import { useState, useCallback, useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import type * as monaco from 'monaco-editor'
import { SequenceDiagramViewer } from './SequenceDiagramViewer'
import './SequenceEditor.css'

interface SequenceEditorProps {
  content: string
  notePath: string
  onSave: (content: string) => Promise<void>
}

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'

export function SequenceEditor({ content: initialContent, notePath, onSave }: SequenceEditorProps) {
  const [value, setValue] = useState(initialContent)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [codePanelHeight, setCodePanelHeight] = useState(45)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const oldValueRef = useRef(initialContent)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)

  // Reset when opening a different file
  useEffect(() => {
    setValue(initialContent)
    setSaveStatus('saved')
    oldValueRef.current = initialContent
  }, [initialContent, notePath])

  // Auto-save with 300ms debounce
  useEffect(() => {
    if (value === oldValueRef.current) return
    oldValueRef.current = value

    setSaveStatus('unsaved')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving')
      try {
        await onSave(value)
        setSaveStatus('saved')
      } catch {
        setSaveStatus('error')
      }
    }, 300)
  }, [value, onSave])

  // Ctrl+S immediate save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        setSaveStatus('saving')
        onSave(value).then(() => setSaveStatus('saved')).catch(() => setSaveStatus('error'))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [value, onSave])

  // Listen for symbol-insert events from CodeViewport
  useEffect(() => {
    const handler = (e: Event) => {
      const refText = (e as CustomEvent<string>).detail
      const editor = editorRef.current
      if (!editor) return
      const position = editor.getPosition()
      if (!position) return
      editor.executeEdits('symbol-insert', [{
        range: {
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column
        },
        text: refText
      }])
      editor.focus()
    }
    window.addEventListener('symbol-insert', handler)
    return () => window.removeEventListener('symbol-insert', handler)
  }, [])
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const handleChange = useCallback((val: string | undefined) => {
    setValue(val || '')
  }, [])

  const handleResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const container = (e.target as HTMLElement).closest('.seq-editor-body')
    if (!container) return
    const containerHeight = container.getBoundingClientRect().height

    const onMove = (ev: MouseEvent) => {
      const dy = ev.clientY - startY
      const newFraction = Math.min(70, Math.max(20, ((codePanelHeight / 100) * containerHeight + dy) / containerHeight * 100))
      setCodePanelHeight(newFraction)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [codePanelHeight])

  const statusLabel: Record<SaveStatus, string> = {
    saved: 'Saved',
    saving: 'Saving...',
    unsaved: 'Unsaved',
    error: 'Error'
  }

  return (
    <div className="seq-editor">
      <div className="seq-editor-toolbar">
        <span className="seq-editor-path">{notePath}</span>
        <span className={`seq-editor-save-status seq-editor-save-status-${saveStatus}`}>
          {statusLabel[saveStatus]}
        </span>
      </div>
      <div className="seq-editor-body">
        <div className="seq-editor-code" style={{ flex: `0 0 ${codePanelHeight}%` }}>
          <Editor
            height="100%"
            defaultLanguage="plaintext"
            value={value}
            onChange={handleChange}
            onMount={(editor) => { editorRef.current = editor }}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              wordWrap: 'on',
              fontSize: 13,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true
            }}
          />
        </div>
        <div className="seq-editor-resize-handle" onMouseDown={handleResize} />
        <div className="seq-editor-preview">
          <SequenceDiagramViewer content={value} notePath={notePath} />
        </div>
      </div>
    </div>
  )
}
