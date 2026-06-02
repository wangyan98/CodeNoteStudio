import { useReducer, useEffect, useRef, useState, useCallback, useMemo } from 'react'
import type { NetworkDocument, CodeMapping } from '../../../../main/schemas/note-types'
import { createNetworkDocument } from '../../../../main/schemas/note-types'
import type { LayerDef, LayerCatalogOverrides } from '../../../../main/schemas/layer-catalog'
import { resolveLayerCatalog, getLayerDef } from '../../../../main/schemas/layer-catalog'
import { networkReducer } from './networkReducer'
import type { NetworkAction } from './networkReducer'
import { NetworkPalette } from './NetworkPalette'
import { NetworkCanvas } from './NetworkCanvas'
import { NetworkPanel } from './NetworkPanel'
import './NetworkEditor.css'

interface NetworkEditorProps {
  document: NetworkDocument
  notePath: string
  workspacePath: string | null
  onSave: (doc: NetworkDocument) => Promise<void>
  onNavigateToCode?: (filePath: string, line: number) => void
}

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'

export function NetworkEditor({ document: initialDoc, notePath, workspacePath, onSave, onNavigateToCode }: NetworkEditorProps) {
  const [doc, dispatch] = useReducer(networkReducer, initialDoc.version === 2 ? initialDoc : createNetworkDocument())
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  const [panelHeight, setPanelHeight] = useState(0.3)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [catalogOverrides, setCatalogOverrides] = useState<LayerCatalogOverrides | null>(null)
  const [resolvedMapping, setResolvedMapping] = useState<CodeMapping | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const oldDocRef = useRef(doc)

  // Resolve catalog (built-in + project overrides)
  const catalog = useMemo(() => resolveLayerCatalog(catalogOverrides), [catalogOverrides])

  // Reset when opening a different document
  useEffect(() => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
    dispatch({ type: 'SET_DOCUMENT', document: initialDoc })
    oldDocRef.current = initialDoc
    setSelectedBlockId(null)
    setSelectedLayerId(null)
    setSaveStatus('saved')
  }, [initialDoc])

  // Auto-save with 300ms debounce
  useEffect(() => {
    if (doc === oldDocRef.current) return
    oldDocRef.current = doc
    setSaveStatus('unsaved')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving')
      try { await onSave(doc); setSaveStatus('saved') }
      catch { setSaveStatus('error') }
    }, 300)
  }, [doc, onSave])

  // Ctrl+S immediate save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        setSaveStatus('saving')
        onSave(doc).then(() => setSaveStatus('saved')).catch(() => setSaveStatus('error'))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [doc, onSave])

  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [])

  // Load project-level layer catalog overrides
  useEffect(() => {
    const loadOverrides = async () => {
      try {
        if (!workspacePath) return
        const ov = await window.electronAPI.readLayerCatalog(workspacePath)
        if (ov) setCatalogOverrides(ov)
      } catch { /* no override file, use defaults */ }
    }
    loadOverrides()
  }, [notePath, workspacePath])

  const selectedLayer = useMemo(() => {
    if (!selectedBlockId || !selectedLayerId) return null
    for (const block of doc.blocks) {
      if (block.id === selectedBlockId) {
        return block.layers.find(l => l.id === selectedLayerId) || null
      }
    }
    return null
  }, [doc.blocks, selectedBlockId, selectedLayerId])

  const selectedLayerDef = useMemo(() => {
    if (!selectedLayer) return undefined
    return getLayerDef(selectedLayer.type, catalogOverrides)
  }, [selectedLayer, catalogOverrides])

  const selectedBlock = useMemo(() => {
    if (!selectedBlockId) return null
    return doc.blocks.find(b => b.id === selectedBlockId) || null
  }, [doc.blocks, selectedBlockId])

  const handleUpdateBlock = useCallback((blockId: string, field: string, value: string | number) => {
    dispatch({ type: 'UPDATE_BLOCK', blockId, field, value })
  }, [])

  const handleSelectLayer = useCallback((blockId: string, layerId: string) => {
    setSelectedBlockId(blockId || null)
    setSelectedLayerId(layerId || null)
  }, [])

  const handleSelectBlock = useCallback((blockId: string) => {
    setSelectedBlockId(blockId)
    setSelectedLayerId(null)
  }, [])

  const handleDropLayer = useCallback((blockId: string, layerType: string, afterLayerId?: string) => {
    dispatch({ type: 'ADD_LAYER', blockId, layerType, afterLayerId })
  }, [])

  const handleDeleteLayer = useCallback((blockId: string, layerId: string) => {
    dispatch({ type: 'DELETE_LAYER', blockId, layerId })
    setSelectedBlockId(null)
    setSelectedLayerId(null)
  }, [])

  const handleResolveRef = useCallback(async (raw: string) => {
    if (!selectedLayerId || !selectedBlockId) return
    try {
      const mappings = await window.electronAPI.resolveRefs(notePath, `@ref(${raw})`, undefined)
      if (mappings.length > 0) {
        const m = mappings[0]
        setResolvedMapping(m)
        dispatch({ type: 'UPDATE_LAYER_CODE_MAPPING', blockId: selectedBlockId, layerId: selectedLayerId, codeMapping: m })
      }
    } catch { /* ref resolution failed */ }
  }, [notePath, selectedBlockId, selectedLayerId])

  const handlePanelResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const container = (e.target as HTMLElement).closest('.network-editor')
    if (!container) return
    const containerHeight = container.getBoundingClientRect().height
    const onMove = (ev: MouseEvent) => {
      const dy = startY - ev.clientY
      const newFrac = Math.min(0.55, Math.max(0.15, (dy / containerHeight) + panelHeight))
      setPanelHeight(newFrac)
    }
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [panelHeight])

  const saveStatusClass =
    saveStatus === 'saved' ? 'net-save-saved' :
    saveStatus === 'saving' ? 'net-save-saving' :
    saveStatus === 'unsaved' ? 'net-save-unsaved' : 'net-save-error'

  // v1 compatibility: show message for old-format documents
  if (initialDoc.version === 1 || !initialDoc.nodes) {
    return (
      <div className="network-editor">
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100%', color: '#888', fontSize: 13, flexDirection: 'column', gap: 8
        }}>
          <p>This file uses an older format (v1).</p>
          <p>Create a new .net.json file for the graph editor.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="network-editor">
      {/* Toolbar */}
      <div className="network-editor-toolbar">
        <span className="network-editor-label">Network:</span>
        <input
          className="network-editor-name-input"
          value={doc.name}
          onChange={(e) => dispatch({ type: 'UPDATE_NETWORK_NAME', name: e.target.value })}
        />
        <span className="network-editor-label">Input:</span>
        <input
          className="network-editor-shape-input"
          value={doc.inputShape}
          onChange={(e) => dispatch({ type: 'UPDATE_INPUT_SHAPE', shape: e.target.value })}
          placeholder="3×224×224"
        />
        <span style={{ flex: 1 }} />
        <button className="network-editor-btn" onClick={() => dispatch({ type: 'ADD_BLOCK', name: 'New Block' })}>
          + Add Block
        </button>
        <span className={`network-editor-save-status ${saveStatusClass}`}>
          {saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving...' : saveStatus === 'unsaved' ? 'Unsaved' : 'Error'}
        </span>
      </div>

      {/* Palette */}
      <NetworkPalette catalog={catalog} />

      {/* Canvas */}
      <div style={{ flex: `0 0 ${100 - panelHeight * 100}%`, overflow: 'hidden' }}>
        <NetworkCanvas
          doc={doc}
          catalog={catalog}
          selectedBlockId={selectedBlockId}
          selectedLayerId={selectedLayerId}
          onSelectLayer={handleSelectLayer}
          onSelectBlock={handleSelectBlock}
          onDropLayer={handleDropLayer}
          onDeleteLayer={handleDeleteLayer}
        />
      </div>

      {/* Resize handle */}
      <div className="network-editor-resize-handle" onMouseDown={handlePanelResize} />

      {/* Edit panel */}
      <div className="network-editor-panel" style={{ flex: `0 0 ${panelHeight * 100}%` }}>
        <NetworkPanel
          block={selectedBlock}
          layer={selectedLayer}
          layerDef={selectedLayerDef}
          onUpdateBlock={handleUpdateBlock}
          onUpdateParam={(layerId, key, val) => dispatch({ type: 'UPDATE_LAYER', blockId: selectedBlockId!, layerId, field: 'params', paramKey: key, value: val })}
          onUpdateInputShape={(layerId, shape) => dispatch({ type: 'UPDATE_LAYER', blockId: selectedBlockId!, layerId, field: 'inputShape', value: shape })}
          onUpdateOutputShape={(layerId, shape) => dispatch({ type: 'UPDATE_LAYER', blockId: selectedBlockId!, layerId, field: 'outputShape', value: shape })}
          onUpdateCodeMapping={(layerId, mapping) => dispatch({ type: 'UPDATE_LAYER_CODE_MAPPING', blockId: selectedBlockId!, layerId, codeMapping: mapping })}
          onUpdateLayerName={(layerId, name) => dispatch({ type: 'UPDATE_LAYER', blockId: selectedBlockId!, layerId, field: 'name', value: name })}
          onResolveRef={handleResolveRef}
          resolvedMapping={resolvedMapping}
        />
      </div>
    </div>
  )
}
