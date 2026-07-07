import { useReducer, useEffect, useRef, useState, useCallback, useMemo } from 'react'
import type { NetworkDocument, GraphNode, GraphEdge } from '../../../../main/schemas/note-types'
import { createNetworkDocument } from '../../../../main/schemas/note-types'
import type { LayerCatalogOverrides } from '../../../../main/schemas/layer-catalog'
import { resolveLayerCatalog, getLayerDef } from '../../../../main/schemas/layer-catalog'
import { networkReducer } from './networkReducer'
import { NetworkPalette } from './NetworkPalette'
import { NetworkCanvas } from './NetworkCanvas'
import { NetworkPanel } from './NetworkPanel'
import './NetworkEditor.css'

/** Recursively find a node by id in the tree. */
function findNodeInTree(nodes: GraphNode[], id: string): GraphNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children) {
      const found = findNodeInTree(n.children, id)
      if (found) return found
    }
  }
  return null
}

/** Check whether a node is already inside a block — used to enforce the 2-level nesting limit. */
function hasBlockAncestor(nodes: GraphNode[], targetId: string): boolean {
  for (const n of nodes) {
    if (n.children) {
      for (const child of n.children) {
        if (child.id === targetId && n.kind === 'block') return true
        if (child.children) {
          const found = child.children.some(gc => gc.id === targetId)
          if (found && child.kind === 'block') return true
        }
      }
      if (hasBlockAncestor(n.children, targetId)) return true
    }
  }
  return false
}

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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const selectedNodeRef = useRef<GraphNode | null>(null)
  const [panelHeight, setPanelHeight] = useState(0.25)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [catalogOverrides, setCatalogOverrides] = useState<LayerCatalogOverrides | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const oldDocRef = useRef(doc)

  // Resolve catalog (built-in + project overrides)
  const catalog = useMemo(() => resolveLayerCatalog(catalogOverrides), [catalogOverrides])

  // Reset when opening a different document
  useEffect(() => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
    dispatch({ type: 'SET_DOCUMENT', document: initialDoc })
    oldDocRef.current = initialDoc
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
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

  // Keyboard delete for selected node or edge
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedEdgeId) {
          e.preventDefault()
          dispatch({ type: 'DELETE_EDGE', edge: { id: selectedEdgeId } as GraphEdge })
          setSelectedEdgeId(null)
          return
        }
        if (selectedNodeId) {
          e.preventDefault()
          dispatch({ type: 'DELETE_NODE', nodeId: selectedNodeId })
          setSelectedNodeId(null)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedNodeId, selectedEdgeId])

  // Listen for symbol-insert events from CodeViewport
  useEffect(() => {
    const handler = (e: Event) => {
      const refText = (e as CustomEvent<string>).detail
      const sel = selectedNodeRef.current
      if (!sel || sel.kind !== 'layer') return
      const targetNodeId = sel.id
      window.electronAPI.resolveRefs(notePath, refText, undefined).then((mappings) => {
        if (mappings.length > 0) {
          const m = mappings[0]
          m.raw = refText.replace(/^@ref\(|\)$/g, '')
          dispatch({ type: 'UPDATE_NODE', nodeId: targetNodeId, field: 'codeMapping', value: m })
        }
      }).catch(() => {})
    }
    window.addEventListener('symbol-insert', handler)
    return () => window.removeEventListener('symbol-insert', handler)
  }, [notePath])

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

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null
    return findNodeInTree(doc.nodes ?? [], selectedNodeId)
  }, [doc.nodes, selectedNodeId])

  selectedNodeRef.current = selectedNode

  const selectedNodeDef = useMemo(() => {
    if (!selectedNode || selectedNode.kind !== 'layer' || !selectedNode.layerType) return undefined
    return getLayerDef(selectedNode.layerType, catalogOverrides)
  }, [selectedNode, catalogOverrides])

  const handleSelectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId)
    setSelectedEdgeId(null)
  }, [])

  const handleSelectEdge = useCallback((edgeId: string | null) => {
    setSelectedEdgeId(edgeId)
    setSelectedNodeId(null)
  }, [])

  const handleDropLayer = useCallback((layerType: string) => {
    const newNodeId = crypto.randomUUID()
    const sel = selectedNodeRef.current
    if (sel && sel.kind === 'block') {
      // Drop inside selected block as child
      dispatch({ type: 'ADD_NODE', nodeId: newNodeId, parentId: sel.id, kind: 'layer', layerType, name: layerType })
    } else {
      // Drop as standalone node, auto-connect if something is selected
      dispatch({ type: 'ADD_NODE', nodeId: newNodeId, kind: 'layer', layerType, name: layerType })
      if (sel) {
        dispatch({ type: 'ADD_EDGE', source: sel.id, target: newNodeId })
      }
    }
  }, [])

  const handleDeleteNode = useCallback((nodeId: string) => {
    dispatch({ type: 'DELETE_NODE', nodeId })
    setSelectedNodeId(null)
  }, [])

  const handleAddEdge = useCallback((source: string, target: string) => {
    dispatch({ type: 'ADD_EDGE', source, target })
  }, [])

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
        <button className="network-editor-btn" onClick={() => dispatch({ type: 'ADD_NODE', kind: 'input', name: 'Input' })}>
          + Input
        </button>
        <button className="network-editor-btn" onClick={() => dispatch({ type: 'ADD_NODE', kind: 'output', name: 'Output' })}>
          + Output
        </button>
        <span style={{ flex: 1 }} />
        <button
          className="network-editor-btn"
          onClick={() => {
            const sel = selectedNode
            // Only nest if the selected node is a block AND it's not already inside another block
            if (sel && sel.kind === 'block' && !hasBlockAncestor(doc.nodes ?? [], sel.id)) {
              dispatch({
                type: 'ADD_NODE',
                kind: 'block',
                name: 'New Block',
                parentId: sel.id,
              })
            } else {
              dispatch({ type: 'ADD_NODE', kind: 'block', name: 'New Block' })
            }
          }}
        >
          + Add Block
        </button>
        <span className={`network-editor-save-status ${saveStatusClass}`}>
          {saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving...' : saveStatus === 'unsaved' ? 'Unsaved' : 'Error'}
        </span>
      </div>

      {/* Palette */}
      <NetworkPalette catalog={catalog} />

      {/* Canvas + Panel (split remaining space) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ flex: `0 0 ${100 - panelHeight * 100}%`, overflow: 'hidden' }}>
          <NetworkCanvas
            doc={doc}
            catalog={catalog}
            selectedNodeId={selectedNodeId}
            selectedEdgeId={selectedEdgeId}
            onSelectNode={handleSelectNode}
            onSelectEdge={handleSelectEdge}
            onDropLayer={handleDropLayer}
            onDeleteNode={handleDeleteNode}
            onAddEdge={handleAddEdge}
            onNavigateToCode={onNavigateToCode}
          />
        </div>

        {/* Resize handle */}
        <div className="network-editor-resize-handle" onMouseDown={handlePanelResize} />

        {/* Edit panel */}
        <div className="network-editor-panel" style={{ flex: `0 0 ${panelHeight * 100}%` }}>
          <NetworkPanel
            node={selectedNode}
            nodeDef={selectedNodeDef}
            onUpdateNode={(nodeId, field, value, paramKey?) => dispatch({ type: 'UPDATE_NODE', nodeId, field, paramKey, value })}
            onAddEdge={handleAddEdge}
            notePath={notePath}
          />
        </div>
      </div>
    </div>
  )
}
