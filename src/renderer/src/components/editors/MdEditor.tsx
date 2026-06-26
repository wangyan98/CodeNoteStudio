import 'katex/dist/katex.min.css'
import { useState, useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import Editor from '@monaco-editor/react'
import type * as monaco from 'monaco-editor'
import { registerRefCompletionProvider } from '../../services/monaco-completion'
import { renderMarkdown, inferEmbedType } from '../../services/markdown-renderer'
import type { CodeMapping } from '../../types'
import './MdEditor.css'
import { createRoot } from 'react-dom/client'
import { DerivationDagViewer } from './DerivationDagViewer'
import { MindMapRenderer } from './MindMapRenderer'
import { SequenceDiagramViewer } from './SequenceDiagramViewer'
import { NetworkEmbedViewer } from './NetworkEmbedViewer'
import type { DerivationDocument, MindMapDocument, NetworkDocument } from '../../../../main/schemas/note-types'

interface MdEditorProps {
  content: string
  notePath: string
  workspacePath: string | null
  codeRepoPath: string | null
  codeRepos?: { path: string }[]
  onSave: (content: string) => Promise<void>
  onRefClick?: (refName: string) => void
  onEmbedClick?: (notePath: string, noteType: 'derive' | 'mind' | 'seq' | 'net') => void
  onNavigateToCode?: (filePath: string, line: number) => void
  codeMappings?: CodeMapping[]
}

export interface MdEditorHandle {
  insertAtCursor: (text: string) => void
  insertAtPosition: (text: string, clientX: number, clientY: number) => void
  appendToEnd: (text: string) => void
  switchToEdit: () => void
}

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'

export const MdEditor = forwardRef<MdEditorHandle, MdEditorProps>(
  function MdEditor({ content, notePath, workspacePath, codeRepoPath, codeRepos, onSave, onRefClick, onEmbedClick, onNavigateToCode, codeMappings }, ref) {
  const [value, setValue] = useState(content)
  const [showPreview, setShowPreview] = useState(true)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [previewMappings, setPreviewMappings] = useState<CodeMapping[]>([])
  const editorMonacoRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const oldContentRef = useRef(content)

  useImperativeHandle(ref, () => ({
    insertAtCursor(text: string) {
      editorMonacoRef.current?.trigger('keyboard', 'type', { text })
    },
    insertAtPosition(text: string, clientX: number, clientY: number) {
      const editor = editorMonacoRef.current
      if (!editor) return
      const target = editor.getTargetAtClientPoint(clientX, clientY)
      if (target && target.position) {
        editor.executeEdits('drag-drop', [
          { range: {
            startLineNumber: target.position.lineNumber,
            startColumn: target.position.column,
            endLineNumber: target.position.lineNumber,
            endColumn: target.position.column
          }, text }
        ])
      } else {
        // Fallback to cursor position
        editor.trigger('keyboard', 'type', { text })
      }
    },
    appendToEnd(text: string) {
      const editor = editorMonacoRef.current
      if (!editor) return
      const model = editor.getModel()
      if (!model) return
      const lastLine = model.getLineCount()
      const lastCol = model.getLineMaxColumn(lastLine)
      const prefix = model.getValue() === '' ? '' : '\n'
      const insertText = prefix + text + '\n'
      editor.executeEdits('append-to-end', [{
        range: {
          startLineNumber: lastLine,
          startColumn: lastCol,
          endLineNumber: lastLine,
          endColumn: lastCol
        },
        text: insertText
      }])
      // Move cursor to end after insertion
      const newLastLine = model.getLineCount()
      const newLastCol = model.getLineMaxColumn(newLastLine)
      editor.setPosition({ lineNumber: newLastLine, column: newLastCol })
    },
    switchToEdit() {
      setShowPreview(false)
    }
  }))

  useEffect(() => {
    const disposable = registerRefCompletionProvider()
    return () => disposable.dispose()
  }, [])

  // Re-resolve refs from current editor content when switching to preview,
  // so newly added @ref(...) references render immediately.
  useEffect(() => {
    if (!showPreview) return
    let cancelled = false
    window.electronAPI.resolveRefs(notePath, value, codeRepoPath ?? undefined)
      .then((mappings: CodeMapping[]) => {
        if (!cancelled) setPreviewMappings(mappings)
      })
      .catch(() => {
        if (!cancelled) setPreviewMappings([])
      })
    return () => { cancelled = true }
  }, [showPreview, value, notePath])

  // Hydrate note embed placeholders when preview is shown or content changes
  useEffect(() => {
    if (!showPreview) return
    const container = previewRef.current
    if (!container) return

    const placeholders = container.querySelectorAll<HTMLElement>('.note-embed-placeholder')
    const roots: Array<() => void> = []

    placeholders.forEach((placeholder) => {
      const notePath = placeholder.getAttribute('data-note-path')
      const noteType = placeholder.getAttribute('data-note-type') as 'derive' | 'mind' | 'seq' | 'net' | null
      if (!notePath || !noteType) return

      // Loading state
      placeholder.innerHTML = '<div class="note-embed-loading">Loading...</div>'

      window.electronAPI.readNote(notePath).then((content) => {
        const root = createRoot(placeholder)
        roots.push(() => root.unmount())

        if (noteType === 'derive') {
          root.render(
            <div className="note-embed-container">
              <div
                className="note-embed-header"
                onClick={() => onEmbedClick?.(notePath, noteType)}
              >
                <span className="note-embed-badge">derive</span>
                <span className="note-embed-path">{notePath}</span>
              </div>
              <div className="note-embed-body dag-embed">
                <DerivationDagViewer document={content as DerivationDocument} onNavigateToCode={onNavigateToCode} />
              </div>
            </div>
          )
        } else if (noteType === 'mind') {
          root.render(
            <div className="note-embed-container">
              <div
                className="note-embed-header"
                onClick={() => onEmbedClick?.(notePath, noteType)}
              >
                <span className="note-embed-badge">mind</span>
                <span className="note-embed-path">{notePath}</span>
              </div>
              <div className="note-embed-body mind-embed">
                <MindMapRenderer document={content as MindMapDocument} onSave={async () => {}} />
              </div>
            </div>
          )
        } else if (noteType === 'seq') {
          root.render(
            <div className="note-embed-container">
              <div
                className="note-embed-header"
                onClick={() => onEmbedClick?.(notePath, noteType)}
              >
                <span className="note-embed-badge">seq</span>
                <span className="note-embed-path">{notePath}</span>
              </div>
              <div className="note-embed-body seq-embed">
                <SequenceDiagramViewer content={content as string} notePath={notePath} />
              </div>
            </div>
          )
        } else if (noteType === 'net') {
          root.render(
            <div className="note-embed-container">
              <div
                className="note-embed-header"
                onClick={() => onEmbedClick?.(notePath, noteType)}
              >
                <span className="note-embed-badge">net</span>
                <span className="note-embed-path">{notePath}</span>
              </div>
              <div className="note-embed-body net-embed">
                <NetworkEmbedViewer document={content as NetworkDocument} onNavigateToCode={onNavigateToCode} />
              </div>
            </div>
          )
        }
      }).catch(() => {
        placeholder.innerHTML = `<div class="note-embed-error">Failed to load: ${notePath}</div>`
      })
    })

    return () => {
      roots.forEach((unmount) => unmount())
    }
  }, [showPreview, value, onEmbedClick, onNavigateToCode])

  // Reset when opening a different note
  useEffect(() => {
    setValue(content)
    setSaveStatus('saved')
    oldContentRef.current = content
  }, [content, notePath])

  // Auto-save with 300ms debounce
  useEffect(() => {
    if (value === oldContentRef.current) return
    oldContentRef.current = value

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

  const handleChange = useCallback((val: string | undefined) => {
    setValue(val || '')
  }, [])

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
        onSave(value).then(() => setSaveStatus('saved')).catch(() => setSaveStatus('error'))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [value, onSave])

  const statusLabel: Record<SaveStatus, string> = {
    saved: 'Saved',
    saving: 'Saving...',
    unsaved: 'Unsaved',
    error: 'Error'
  }

  // Compute absolute directory of the note for resolving relative image paths
  const noteAbsoluteDir = workspacePath && notePath
    ? workspacePath.replace(/\/?$/, '/') + notePath.replace(/\/?[^/]*$/, '')
    : undefined

  return (
    <div className="md-editor">
      <div className="md-editor-toolbar">
        <span className="md-editor-path">{notePath}</span>
        <div className="md-editor-actions">
          <button
            className={`md-editor-btn ${!showPreview ? 'active' : ''}`}
            onClick={() => setShowPreview(false)}
          >
            Edit
          </button>
          <button
            className={`md-editor-btn ${showPreview ? 'active' : ''}`}
            onClick={() => setShowPreview(true)}
          >
            Preview
          </button>
          <span className={`md-editor-save-status md-editor-save-status-${saveStatus}`}>
            {statusLabel[saveStatus]}
          </span>
        </div>
      </div>
      <div className="md-editor-content">
        {showPreview ? (
          <div
            ref={previewRef}
            className="md-editor-preview"
          >
            <div
              className="md-preview-content"
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(value, previewMappings.length > 0 ? previewMappings : (codeMappings ?? []), noteAbsoluteDir, codeRepos)
              }}
              onClick={(e) => {
                const target = (e.target as HTMLElement).closest('.ref-link') as HTMLElement | null
                if (target) {
                  const refName = target.getAttribute('data-ref-name')
                  if (refName) onRefClick?.(refName)
                }
              }}
            />
          </div>
        ) : (
          <Editor
            height="100%"
            defaultLanguage="markdown"
            value={value}
            onChange={handleChange}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              wordWrap: 'on',
              fontSize: 13,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true
            }}
            onMount={(editor) => { editorMonacoRef.current = editor }}
          />
        )}
      </div>
    </div>
  )
})
