import { useState, useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import Editor from '@monaco-editor/react'
import type * as monaco from 'monaco-editor'
import { registerRefCompletionProvider } from '../../services/monaco-completion'
import type { CodeMapping, CodeSnippet } from '../../types'
import './MdEditor.css'

interface MdEditorProps {
  content: string
  notePath: string
  onSave: (content: string) => Promise<void>
  onRefClick?: (refName: string) => void
  codeMappings?: CodeMapping[]
}

export interface MdEditorHandle {
  insertAtCursor: (text: string) => void
  insertAtPosition: (text: string, clientX: number, clientY: number) => void
}

export const MdEditor = forwardRef<MdEditorHandle, MdEditorProps>(
  function MdEditor({ content, notePath, onSave, onRefClick, codeMappings }, ref) {
  const [value, setValue] = useState(content)
  const [showPreview, setShowPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const editorMonacoRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)

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
    }
  }))

  useEffect(() => {
    const disposable = registerRefCompletionProvider()
    return () => disposable.dispose()
  }, [])

  const handleChange = useCallback((val: string | undefined) => {
    setValue(val || '')
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await onSave(value)
    } finally {
      setSaving(false)
    }
  }, [value, onSave])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      handleSave()
    }
  }, [handleSave])

  return (
    <div className="md-editor" onKeyDown={handleKeyDown}>
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
          <button className="md-editor-btn save" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
      <div className="md-editor-content">
        {showPreview ? (
          <div className="md-editor-preview">
            <div
              className="md-preview-content"
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(value, codeMappings ?? [])
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function tokenizeLine(line: string): string {
  return line
    .replace(/(\/\/.*$)/g, '<span class="token-comment">$1</span>')
    .replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, '<span class="token-string">$1</span>')
    .replace(/\b(function|return|if|else|for|while|class|const|let|var|import|export|from|def|async|await|new|try|catch|throw|typedef|struct|enum|static|void|int|float|double|bool|char|public|private|protected|virtual|override|type|interface)\b/g, '<span class="token-keyword">$1</span>')
    .replace(/\b([A-Z][a-zA-Z0-9]*)\b/g, '<span class="token-type">$1</span>')
}

function renderCodeSnippet(snippet: CodeSnippet): string {
  const lines = snippet.lines.map((line, i) => {
    const lineNum = snippet.startLine + i
    const isHighlight = lineNum === snippet.highlightLine
    const cls = isHighlight ? 'ref-code-line ref-highlight-line' : 'ref-code-line'
    const escaped = escapeHtml(line)
    const tokenized = tokenizeLine(escaped)
    return `<span class="${cls}"><span class="line-number">${lineNum}</span>${tokenized}</span>`
  }).join('')
  return `<pre class="ref-code-block"><code>${lines}</code></pre>`
}

function renderMarkdown(md: string, codeMappings: CodeMapping[]): string {
  const snippetByRaw = new Map<string, CodeSnippet>()
  const matchedRaws = new Set<string>()
  for (const m of codeMappings) {
    matchedRaws.add(m.raw)
    if (m.codeSnippet) {
      snippetByRaw.set(m.raw, m.codeSnippet)
    }
  }

  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Convert @ref(...) — handle all colon-separated formats
  html = html.replace(
    /@ref\(([a-zA-Z0-9._/\-:]+)\)/g,
    (_fullMatch: string, refBody: string) => {
      if (!matchedRaws.has(refBody)) {
        return `@ref(${refBody})`
      }
      const snippet = snippetByRaw.get(refBody)
      let result = `<span class="ref-link" data-ref-name="${refBody}">@ref(${refBody})</span>`
      if (snippet) {
        result += renderCodeSnippet(snippet)
      }
      return result
    }
  )

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/!\[([^\]]+)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  html = html.replace(/\n\n/g, '</p><p>')
  html = '<p>' + html + '</p>'
  html = html.replace(/<p>\s*<\/p>/g, '')

  return html
}
