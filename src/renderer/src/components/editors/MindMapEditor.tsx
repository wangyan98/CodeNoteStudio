import { useReducer, useCallback, useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { MindMapDocument, MindMapNode } from '../../../../main/schemas/note-types'
import './MindMapRenderer.css'
import { mindMapReducer, findNode } from './mindMapReducer'
import type { MindMapAction } from './mindMapReducer'
import { MindMapCanvas } from './MindMapCanvas'
import type { MindMapCanvasHandle } from './MindMapCanvas'
import { NodeContextMenu } from './NodeContextMenu'
import { NodeEditPanel } from './NodeEditPanel'

interface MindMapEditorProps {
  document: MindMapDocument
  notePath: string
  onSave: (doc: MindMapDocument) => Promise<void>
  onNavigateToCode?: (filePath: string, line: number) => void
}

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'

export function MindMapEditor({ document: initialDoc, notePath, onSave, onNavigateToCode }: MindMapEditorProps) {
  const [doc, dispatch] = useReducer(mindMapReducer, initialDoc)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [panelHeight, setPanelHeight] = useState(0.38)
  const canvasRef = useRef<MindMapCanvasHandle>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const oldDocRef = useRef(doc)
  const selectedNodeIdRef = useRef<string | null>(null)

  // Keep ref in sync so wrappedDispatch can stay stable
  selectedNodeIdRef.current = selectedNodeId

  // Reset when opening a different document
  useEffect(() => {
    dispatch({ type: 'SET_DOCUMENT', document: initialDoc })
    setSelectedNodeId(null)
    setCollapsedIds(new Set())
    setContextMenu(null)
    oldDocRef.current = initialDoc
  }, [initialDoc.root.id])

  // Stable dispatch wrapper — uses ref for selectedNodeId to avoid dependency churn
  const wrappedDispatch = useCallback((action: MindMapAction) => {
    if (action.type === 'SELECT_NODE') {
      setSelectedNodeId(action.nodeId || null)
    }
    if (action.type === 'TOGGLE_COLLAPSE') {
      setCollapsedIds((prev) => {
        const next = new Set(prev)
        if (next.has(action.nodeId!)) {
          next.delete(action.nodeId!)
        } else {
          next.add(action.nodeId!)
        }
        return next
      })
    }
    if (action.type === 'ADD_CHILD' || action.type === 'ADD_SIBLING') {
      const childId = uuidv4()
      dispatch({ ...action, childId })
      setSelectedNodeId(childId)
      return
    }
    if (action.type === 'DELETE_NODE' && action.nodeId === selectedNodeIdRef.current) {
      setSelectedNodeId(null)
    }
    dispatch(action)
  }, [])

  // Auto-save with debounce
  useEffect(() => {
    if (doc === oldDocRef.current) return
    oldDocRef.current = doc

    setSaveStatus('unsaved')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving')
      try {
        await onSave(doc)
        setSaveStatus('saved')
      } catch {
        setSaveStatus('error')
      }
    }, 300)
  }, [doc, onSave])

  // Cleanup save timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

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

  const handleContextMenu = useCallback((nodeId: string, x: number, y: number) => {
    setContextMenu({ nodeId, x, y })
  }, [])

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const selectedNode = selectedNodeId ? findNode(doc, selectedNodeId) : null

  const contextMenuItems = contextMenu ? [
    { label: 'Add Child', shortcut: 'Tab', action: () => wrappedDispatch({ type: 'ADD_CHILD', parentId: contextMenu.nodeId }) },
    { label: 'Add Sibling', shortcut: 'Enter', action: () => wrappedDispatch({ type: 'ADD_SIBLING', nodeId: contextMenu.nodeId }) },
    { separator: true as const },
    { label: 'Collapse / Expand', shortcut: 'Space', action: () => wrappedDispatch({ type: 'TOGGLE_COLLAPSE', nodeId: contextMenu.nodeId }) },
    { separator: true as const },
    { label: 'Delete Node', shortcut: 'Del', action: () => wrappedDispatch({ type: 'DELETE_NODE', nodeId: contextMenu.nodeId }), danger: true },
  ] : []

  const handlePanelResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const container = (e.target as HTMLElement).closest('.mind-editor')
    if (!container) return
    const containerHeight = container.getBoundingClientRect().height

    const onMove = (ev: MouseEvent) => {
      const dy = startY - ev.clientY
      const newFraction = Math.min(0.6, Math.max(0.15, (dy / containerHeight) + panelHeight))
      setPanelHeight(newFraction)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [panelHeight])

  // Keyboard: Delete and arrow key navigation
  useEffect(() => {
    if (!selectedNodeId) return
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).closest('.monaco-editor')) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId === doc.root.id) return
        e.preventDefault()
        if (window.confirm('Delete this node and all its children?')) {
          wrappedDispatch({ type: 'DELETE_NODE', nodeId: selectedNodeId })
        }
        return
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault()
        const siblingId = findSibling(doc, selectedNodeId, e.key)
        if (siblingId) {
          wrappedDispatch({ type: 'SELECT_NODE', nodeId: siblingId })
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedNodeId, doc, wrappedDispatch])

  return (
    <div className="mind-editor">
      <div className="mind-editor-canvas" style={{ flex: `0 0 ${100 - panelHeight * 100}%` }}>
        <MindMapCanvas
          ref={canvasRef}
          doc={doc}
          notePath={notePath}
          selectedNodeId={selectedNodeId}
          collapsedIds={collapsedIds}
          dispatch={wrappedDispatch}
          onContextMenu={handleContextMenu}
        />
      </div>
      <div
        className="mind-editor-panel-resize-handle"
        onMouseDown={handlePanelResize}
      />
      <div className="mind-editor-panel" style={{ flex: `0 0 ${panelHeight * 100}%` }}>
        <NodeEditPanel
          node={selectedNode}
          dispatch={wrappedDispatch}
          onNavigateToCode={onNavigateToCode}
          saveStatus={saveStatus}
        />
      </div>
      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={handleCloseContextMenu}
        />
      )}
    </div>
  )
}

// Helper: find sibling in arrow direction
function findSibling(doc: MindMapDocument, nodeId: string, direction: string): string | null {
  if (nodeId === doc.root.id) {
    if (direction === 'ArrowRight' && doc.root.children.length > 0) {
      return doc.root.children[0].id
    }
    return null
  }

  const parent = findParent(doc.root, nodeId)
  if (!parent) return null

  const siblings = parent.children
  const idx = siblings.findIndex((c) => c.id === nodeId)
  if (idx < 0) return null

  if (direction === 'ArrowDown' && idx < siblings.length - 1) {
    return siblings[idx + 1].id
  }
  if (direction === 'ArrowUp' && idx > 0) {
    return siblings[idx - 1].id
  }
  if (direction === 'ArrowLeft') {
    return parent.id
  }
  if (direction === 'ArrowRight') {
    const current = siblings[idx]
    if (current.children.length > 0) return current.children[0].id
  }
  return null
}

function findParent(node: MindMapNode, targetId: string): MindMapNode | null {
  for (const child of node.children) {
    if (child.id === targetId) return node
    const found = findParent(child, targetId)
    if (found) return found
  }
  return null
}
