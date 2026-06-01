import { useCallback, useState, useEffect, useRef } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type * as monaco from 'monaco-editor'
import { registerRefCompletionProvider } from '../../services/monaco-completion'
import type { MindMapNode } from '../../../../main/schemas/note-types'
import type { MindMapAction } from './mindMapReducer'
import './NodeEditPanel.css'

interface NodeEditPanelProps {
  node: MindMapNode | null
  dispatch: React.Dispatch<MindMapAction>
  onNavigateToCode?: (filePath: string, line: number) => void
  saveStatus: 'saved' | 'saving' | 'unsaved' | 'error'
}

const statusLabels: Record<string, string> = {
  saved: '已保存',
  saving: '保存中...',
  unsaved: '未保存',
  error: '保存失败'
}

export function NodeEditPanel({ node, dispatch, onNavigateToCode, saveStatus }: NodeEditPanelProps) {
  const [title, setTitle] = useState('')
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const completionDisposableRef = useRef<monaco.IDisposable | null>(null)
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const nodeRef = useRef<MindMapNode | null>(null)
  nodeRef.current = node

  // Sync title and editor content when node changes, and auto-focus title input
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
    // Auto-focus title input so user can type immediately after clicking a node
    requestAnimationFrame(() => {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    })
  }, [node?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (titleTimerRef.current) clearTimeout(titleTimerRef.current)
      if (contentTimerRef.current) clearTimeout(contentTimerRef.current)
    }
  }, [])

  useEffect(() => {
    return () => {
      completionDisposableRef.current?.dispose()
    }
  }, [])

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor
    if (nodeRef.current) {
      editor.setValue(nodeRef.current.content)
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

  if (!node) {
    return (
      <div className="node-edit-panel node-edit-panel-empty">
        <p className="node-edit-panel-hint">Click a node to edit</p>
      </div>
    )
  }

  return (
    <div className="node-edit-panel">
      <div className="node-edit-panel-scroll">
        <div className="node-edit-panel-field">
          <label className="node-edit-panel-label">Title</label>
          <input
            ref={titleInputRef}
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

        <div className={`node-edit-panel-status node-edit-panel-status-${saveStatus}`}>
          {statusLabels[saveStatus]}
        </div>
      </div>
    </div>
  )
}
