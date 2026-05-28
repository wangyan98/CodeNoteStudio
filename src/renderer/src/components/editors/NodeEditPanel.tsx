import { useCallback, useState, useEffect, useRef } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type * as monaco from 'monaco-editor'
import { registerRefCompletionProvider } from '../../services/monaco-completion'
import type { MindMapNode, CodeMapping } from '../../../../main/schemas/note-types'
import type { MindMapAction } from './mindMapReducer'
import './NodeEditPanel.css'

interface NodeEditPanelProps {
  node: MindMapNode | null
  dispatch: React.Dispatch<MindMapAction>
  onNavigateToCode?: (filePath: string, line: number) => void
  saveStatus: 'saved' | 'saving' | 'unsaved' | 'error'
}

export function NodeEditPanel({ node, dispatch, onNavigateToCode, saveStatus }: NodeEditPanelProps) {
  const [title, setTitle] = useState('')
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const completionDisposableRef = useRef<monaco.IDisposable | null>(null)
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!node) {
      setTitle('')
      return
    }
    setTitle(node.title)
    if (editorRef.current) {
      const currentVal = editorRef.current.getValue()
      if (currentVal !== node.content) {
        editorRef.current.setValue(node.content)
      }
    }
  }, [node?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor
    if (node) {
      editor.setValue(node.content)
    }
    completionDisposableRef.current = registerRefCompletionProvider()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setTitle(val)
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current)
    titleTimerRef.current = setTimeout(() => {
      if (node) dispatch({ type: 'UPDATE_TITLE', nodeId: node.id, title: val })
    }, 150)
  }, [node, dispatch])

  const handleContentChange = useCallback((val: string | undefined) => {
    if (!node || val === undefined) return
    if (contentTimerRef.current) clearTimeout(contentTimerRef.current)
    contentTimerRef.current = setTimeout(() => {
      dispatch({ type: 'UPDATE_CONTENT', nodeId: node.id, content: val })
    }, 300)
  }, [node, dispatch])

  const handleRemoveMapping = useCallback((index: number) => {
    if (node) dispatch({ type: 'REMOVE_CODE_MAPPING', nodeId: node.id, index })
  }, [node, dispatch])

  const handleRemoveEmbedRef = useCallback((index: number) => {
    if (node) dispatch({ type: 'REMOVE_EMBED_REF', nodeId: node.id, index })
  }, [node, dispatch])

  const handleAddMapping = useCallback(async () => {
    if (!node) return
    try {
      const symbols = await window.electronAPI.querySymbols(undefined, undefined, undefined)
      if (symbols.length > 0) {
        const sym = symbols[0]
        const mapping: CodeMapping = {
          raw: `@ref(${sym.name})`,
          functionName: sym.name,
          filePath: sym.filePath,
          startLine: sym.startLine,
          endLine: sym.endLine
        }
        dispatch({ type: 'ADD_CODE_MAPPING', nodeId: node.id, mapping })
      }
    } catch {
      // silently fail
    }
  }, [node, dispatch])

  const handleAddEmbedRef = useCallback(async () => {
    if (!node) return
    try {
      const notes = await window.electronAPI.listNotes()
      if (notes.length > 0) {
        dispatch({ type: 'ADD_EMBED_REF', nodeId: node.id, ref: notes[0].relativePath })
      }
    } catch {
      // silently fail
    }
  }, [node, dispatch])

  if (!node) {
    return (
      <div className="node-edit-panel node-edit-panel-empty">
        <p className="node-edit-panel-hint">Click a node to edit</p>
      </div>
    )
  }

  const statusLabels: Record<string, string> = {
    saved: '已保存',
    saving: '保存中...',
    unsaved: '未保存',
    error: '保存失败'
  }

  return (
    <div className="node-edit-panel">
      <div className="node-edit-panel-scroll">
        <div className="node-edit-panel-field">
          <label className="node-edit-panel-label">Title</label>
          <input
            className="node-edit-panel-title-input"
            value={title}
            onChange={handleTitleChange}
            placeholder="Node title"
          />
        </div>

        <div className="node-edit-panel-field">
          <label className="node-edit-panel-label">Content (Markdown)</label>
          <div className="node-edit-panel-monaco">
            <Editor
              height="160px"
              defaultLanguage="markdown"
              theme="vs-dark"
              value={node.content}
              onChange={handleContentChange}
              onMount={handleEditorMount}
              options={{
                minimap: { enabled: false },
                wordWrap: 'on',
                fontSize: 12,
                lineNumbers: 'off',
                scrollBeyondLastLine: false,
                automaticLayout: true
              }}
            />
          </div>
        </div>

        <div className="node-edit-panel-field">
          <div className="node-edit-panel-section-header">
            <label className="node-edit-panel-label">Code Mappings</label>
            <button className="node-edit-panel-add-btn" onClick={handleAddMapping}>+ Add</button>
          </div>
          {node.codeMappings.length === 0 ? (
            <p className="node-edit-panel-empty-text">No code mappings</p>
          ) : (
            <ul className="node-edit-panel-mapping-list">
              {node.codeMappings.map((m, i) => (
                <li key={i} className="node-edit-panel-mapping-item">
                  <span
                    className="node-edit-panel-mapping-ref"
                    onClick={() => onNavigateToCode?.(m.filePath, m.startLine)}
                    title={`${m.filePath}:${m.startLine}`}
                  >
                    {m.raw}
                  </span>
                  <span className="node-edit-panel-mapping-path">{m.filePath}:{m.startLine}</span>
                  <button
                    className="node-edit-panel-remove-btn"
                    onClick={() => handleRemoveMapping(i)}
                  >x</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="node-edit-panel-field">
          <div className="node-edit-panel-section-header">
            <label className="node-edit-panel-label">Embed Refs</label>
            <button className="node-edit-panel-add-btn" onClick={handleAddEmbedRef}>+ Add</button>
          </div>
          {node.embedRefs.length === 0 ? (
            <p className="node-edit-panel-empty-text">No embed refs</p>
          ) : (
            <ul className="node-edit-panel-mapping-list">
              {node.embedRefs.map((ref, i) => (
                <li key={i} className="node-edit-panel-mapping-item">
                  <span className="node-edit-panel-mapping-ref">{ref}</span>
                  <button
                    className="node-edit-panel-remove-btn"
                    onClick={() => handleRemoveEmbedRef(i)}
                  >x</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`node-edit-panel-status node-edit-panel-status-${saveStatus}`}>
          {statusLabels[saveStatus]}
        </div>
      </div>
    </div>
  )
}
