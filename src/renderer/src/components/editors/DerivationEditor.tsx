import { useReducer, useEffect, useMemo, useRef, useState } from 'react'
import katex from 'katex'
import type { DerivationDocument, DerivationNode } from '../../../../main/schemas/note-types'
import './DerivationEditor.css'
import { derivationReducer } from './derivationReducer'
import type { DerivationAction } from './derivationReducer'

interface DerivationEditorProps {
  document: DerivationDocument
  onSave: (doc: DerivationDocument) => Promise<void>
  codeRepoPath: string | null
}

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'

function buildMiniDag(nodes: DerivationNode[]): { rows: DerivationNode[][]; connectors: string[][] } {
  if (nodes.length === 0) return { rows: [], connectors: [] }

  const depthMap = new Map<string, number>()

  function getDepth(nodeId: string): number {
    if (depthMap.has(nodeId)) return depthMap.get(nodeId)!
    const node = nodes.find((n) => n.id === nodeId)
    if (!node || !node.derivesFrom) {
      depthMap.set(nodeId, 0)
      return 0
    }
    const depth = getDepth(node.derivesFrom) + 1
    depthMap.set(nodeId, depth)
    return depth
  }

  for (const node of nodes) {
    getDepth(node.id)
  }

  const maxDepth = Math.max(...Array.from(depthMap.values()), 0)
  const rows: DerivationNode[][] = Array.from({ length: maxDepth + 1 }, () => [])

  for (const node of nodes) {
    const depth = depthMap.get(node.id) ?? 0
    rows[depth].push(node)
  }

  const connectors: string[][] = []
  for (let d = 0; d < rows.length - 1; d++) {
    const connRow: string[] = []
    for (const parent of rows[d]) {
      const children = nodes.filter((n) => n.derivesFrom === parent.id)
      if (children.length === 1) {
        connRow.push('→')
      } else if (children.length > 1) {
        connRow.push('↘...↙')
      }
    }
    connectors.push(connRow)
  }

  return { rows, connectors }
}

export function DerivationEditor({ document: initialDoc, onSave, codeRepoPath }: DerivationEditorProps) {
  const [doc, dispatch] = useReducer(derivationReducer, initialDoc)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [collapsedPreviews, setCollapsedPreviews] = useState<Set<string>>(new Set())
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const oldDocRef = useRef(doc)
  // Reset when opening a different document
  useEffect(() => {
    // Clear any pending save from the previous document
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    dispatch({ type: 'SET_DOCUMENT', document: initialDoc })
    oldDocRef.current = initialDoc
    setCollapsedPreviews(new Set())
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
      try {
        await onSave(doc)
        setSaveStatus('saved')
      } catch {
        setSaveStatus('error')
      }
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

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const miniDag = useMemo(() => buildMiniDag(doc.nodes), [doc.nodes])

  // Build cycle-safe dropdown options for each node (precomputed)
  const derivesFromOptions = useMemo(() => {
    const map = new Map<string, Array<{ id: string; stepNumber: number; title: string }>>()
    for (const node of doc.nodes) {
      const descendants = new Set<string>()
      const stack = [node.id]
      while (stack.length > 0) {
        const current = stack.pop()!
        const children = doc.nodes.filter((n) => n.derivesFrom === current)
        for (const child of children) {
          if (!descendants.has(child.id)) {
            descendants.add(child.id)
            stack.push(child.id)
          }
        }
      }
      map.set(node.id, doc.nodes.filter((n) => n.id !== node.id && !descendants.has(n.id)))
    }
    return map
  }, [doc.nodes])

  const handleDragStart = (index: number) => {
    setDragIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDrop = (index: number) => {
    if (dragIndex !== null && dragIndex !== index) {
      dispatch({ type: 'REORDER_NODES', fromIndex: dragIndex, toIndex: index })
    }
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const handleDeleteNode = (nodeId: string) => {
    const childCount = doc.nodes.filter((n) => n.derivesFrom === nodeId).length
    if (childCount > 0) {
      if (!window.confirm(`${childCount} step(s) derive from this step. Delete anyway?`)) return
    }
    dispatch({ type: 'DELETE_NODE', nodeId })
  }

  const togglePreview = (nodeId: string) => {
    setCollapsedPreviews((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }

  const saveStatusClass =
    saveStatus === 'saved' ? 'derive-save-status-saved' :
    saveStatus === 'saving' ? 'derive-save-status-saving' :
    saveStatus === 'unsaved' ? 'derive-save-status-unsaved' :
    'derive-save-status-error'

  // Empty state
  if (doc.nodes.length === 0) {
    return (
      <div className="derivation-editor">
        <div className="derivation-editor-toolbar">
          <span className="derivation-editor-save-status">Derivation</span>
          <span className={`derivation-editor-save-status ${saveStatusClass}`}>
            {saveStatus === 'saved' ? 'Saved' :
             saveStatus === 'saving' ? 'Saving...' :
             saveStatus === 'unsaved' ? 'Unsaved' :
             'Error'}
          </span>
        </div>
        <div className="derivation-editor-empty">
          <p>Add your first step</p>
          <button className="derive-add-btn" onClick={() => dispatch({ type: 'ADD_NODE', afterStepNumber: 0 })}>
            + Add Step
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="derivation-editor">
      <div className="derivation-editor-toolbar">
        <span className="derivation-editor-save-status">Derivation</span>
        <span className={`derivation-editor-save-status ${saveStatusClass}`}>
          {saveStatus === 'saved' ? 'Saved' :
           saveStatus === 'saving' ? 'Saving...' :
           saveStatus === 'unsaved' ? 'Unsaved' :
           'Error'}
        </span>
      </div>

      {/* Mini DAG */}
      <div className="derivation-editor-mini-dag">
        {miniDag.rows.length === 0 ? (
          <div className="derivation-editor-mini-dag-empty">No derivation steps</div>
        ) : (
          miniDag.rows.map((row, depth) => (
            <div key={depth}>
              <div className="mini-dag-row">
                {row.map((node) => (
                  <span
                    key={node.id}
                    className="mini-dag-pill"
                    onClick={() => {
                      const el = document.getElementById(`derive-node-${node.id}`)
                      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    }}
                  >
                    <KatexMiniPill latex={node.content} stepNumber={node.stepNumber} />
                  </span>
                ))}
              </div>
              {depth < miniDag.rows.length - 1 && (
                <div className="mini-dag-row">
                  {miniDag.connectors[depth]?.map((conn, i) => (
                    <span key={i} className="mini-dag-connector">{conn}</span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Node list */}
      <div className="derivation-editor-list">
        {doc.nodes.map((node, index) => (
          <div key={node.id}>
            {(index === dragOverIndex && dragIndex !== null && dragIndex !== index) && (
              <div style={{ height: 4, background: 'var(--accent-color)', borderRadius: 2, margin: '0 0 4px 0', opacity: 0.6 }} />
            )}
            <div
              id={`derive-node-${node.id}`}
              className={`derive-node-card${dragIndex === index ? ' dragging' : ''}`}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={() => handleDrop(index)}
            >
              <div className="derive-node-card-row">
                <div className="derive-step-badge" draggable onDragStart={() => handleDragStart(index)} onDragEnd={handleDragEnd} title="Drag to reorder">
                  {node.stepNumber}
                </div>
                <input
                  className="derive-title-input"
                  value={node.title}
                  onChange={(e) => dispatch({ type: 'UPDATE_NODE', nodeId: node.id, field: 'title', value: e.target.value })}
                  placeholder="Step title"
                />
                <select
                  className="derive-derives-from-select"
                  value={node.derivesFrom ?? ''}
                  onChange={(e) =>
                    dispatch({ type: 'SET_DERIVES_FROM', nodeId: node.id, parentId: e.target.value || null })
                  }
                >
                  <option value="">Derives from: (none)</option>
                  {(derivesFromOptions.get(node.id) ?? []).map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.stepNumber}. {opt.title || 'Untitled'}
                    </option>
                  ))}
                </select>
                <button className="derive-delete-btn" onClick={() => handleDeleteNode(node.id)} title="Delete step">
                  ✕
                </button>
              </div>
              <textarea
                className="derive-content-textarea"
                value={node.content}
                onChange={(e) => dispatch({ type: 'UPDATE_NODE', nodeId: node.id, field: 'content', value: e.target.value })}
                placeholder="LaTeX formula or text..."
                rows={2}
              />
              {node.content && !collapsedPreviews.has(node.id) && (
                <div className="derive-katex-preview" key={`preview-${node.id}`}>
                  <KatexPreview latex={node.content} />
                </div>
              )}
              {node.content && (
                <button className="derive-katex-collapse-btn" onClick={() => togglePreview(node.id)}>
                  {collapsedPreviews.has(node.id) ? 'Show preview' : 'Hide preview'}
                </button>
              )}
            </div>
            {/* Inline add button between nodes */}
            <div className="derive-inline-add">
              <button
                className="derive-inline-add-btn"
                title="Insert step here"
                onClick={() => dispatch({ type: 'ADD_NODE', afterStepNumber: index + 1 })}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom add button */}
      <div className="derivation-editor-bottom-actions">
        <button className="derive-add-btn" onClick={() => dispatch({ type: 'ADD_NODE', afterStepNumber: doc.nodes.length })}>
          + Add Step
        </button>
      </div>
    </div>
  )
}

// Separate component for KaTeX to keep DerivationEditor focused
function KatexPreview({ latex }: { latex: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    containerRef.current.innerHTML = ''
    try {
      katex.render(latex, containerRef.current, { throwOnError: false, displayMode: false })
      setError(null)
    } catch (err) {
      setError(String(err))
    }
  }, [latex])

  if (error) {
    return <span className="katex-error">{error}</span>
  }

  return <div ref={containerRef} />
}

// Mini KaTeX pill for the DAG preview — shows step number + rendered formula
function KatexMiniPill({ latex, stepNumber }: { latex: string; stepNumber: number }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    containerRef.current.innerHTML = ''
    try {
      katex.render(latex, containerRef.current, { throwOnError: false, displayMode: false })
    } catch {
      containerRef.current.textContent = latex || '(empty)'
    }
  }, [latex])

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontWeight: 600, fontSize: 10, color: 'var(--accent-color)' }}>{stepNumber}.</span>
      <span ref={containerRef} style={{ fontSize: 11 }} />
    </span>
  )
}
