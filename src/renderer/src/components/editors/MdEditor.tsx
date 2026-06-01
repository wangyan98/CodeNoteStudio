import { useState, useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import Editor from '@monaco-editor/react'
import type * as monaco from 'monaco-editor'
import { registerRefCompletionProvider } from '../../services/monaco-completion'
import type { CodeMapping, CodeSnippet } from '../../types'
import './MdEditor.css'
import { createRoot } from 'react-dom/client'
import { DerivationRenderer } from './DerivationRenderer'
import { MindMapRenderer } from './MindMapRenderer'
import type { DerivationDocument, MindMapDocument } from '../../../../main/schemas/note-types'

interface MdEditorProps {
  content: string
  notePath: string
  workspacePath: string | null
  codeRepoPath: string | null
  onSave: (content: string) => Promise<void>
  onRefClick?: (refName: string) => void
  onEmbedClick?: (notePath: string, noteType: 'derive' | 'mind') => void
  codeMappings?: CodeMapping[]
}

export interface MdEditorHandle {
  insertAtCursor: (text: string) => void
  insertAtPosition: (text: string, clientX: number, clientY: number) => void
}

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'

export const MdEditor = forwardRef<MdEditorHandle, MdEditorProps>(
  function MdEditor({ content, notePath, workspacePath, codeRepoPath, onSave, onRefClick, onEmbedClick, codeMappings }, ref) {
  const [value, setValue] = useState(content)
  const [showPreview, setShowPreview] = useState(false)
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
      const noteType = placeholder.getAttribute('data-note-type') as 'derive' | 'mind' | null
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
              <div className="note-embed-body">
                <DerivationRenderer document={content as DerivationDocument} />
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
        }
      }).catch(() => {
        placeholder.innerHTML = `<div class="note-embed-error">Failed to load: ${notePath}</div>`
      })
    })

    return () => {
      roots.forEach((unmount) => unmount())
    }
  }, [showPreview, value, onEmbedClick])

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
                __html: renderMarkdown(value, previewMappings.length > 0 ? previewMappings : (codeMappings ?? []), noteAbsoluteDir)
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
  // Single-pass combined regex to prevent later patterns from matching
  // inside HTML tags generated by earlier replacements.
  const combined = /(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(function|return|if|else|for|while|class|const|let|var|import|export|from|def|async|await|new|try|catch|throw|typedef|struct|enum|static|void|int|float|double|bool|char|public|private|protected|virtual|override|type|interface)\b|\b([A-Z][a-zA-Z0-9]*)\b/g
  return line.replace(combined, (match, comment, string, keyword, type) => {
    if (comment) return `<span class="token-comment">${match}</span>`
    if (string) return `<span class="token-string">${match}</span>`
    if (keyword) return `<span class="token-keyword">${match}</span>`
    if (type) return `<span class="token-type">${match}</span>`
    return match
  })
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

function resolveImageUrl(url: string, noteAbsoluteDir?: string): string {
  // Already using wsfile:// protocol - leave unchanged
  if (url.startsWith('wsfile://')) return url
  // Web URLs and data URIs - leave unchanged
  if (/^(https?:\/\/|data:)/.test(url)) return url
  // file:// URLs - convert to wsfile://
  if (url.startsWith('file://')) return 'wsfile://' + url.slice('file://'.length)
  // Absolute paths - prepend wsfile://
  if (url.startsWith('/')) return 'wsfile://' + url
  // Relative paths - resolve against note directory
  if (noteAbsoluteDir) {
    return 'wsfile://' + resolvePath(noteAbsoluteDir, url)
  }
  // Cannot resolve - leave unchanged
  return url
}

function resolvePath(baseDir: string, relativePath: string): string {
  const base = baseDir.endsWith('/') ? baseDir.slice(0, -1) : baseDir
  const combined = base + '/' + relativePath
  const segments = combined.split('/')
  const resolved: string[] = []
  for (const seg of segments) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      resolved.pop()
    } else {
      resolved.push(seg)
    }
  }
  return '/' + resolved.join('/')
}

function inferEmbedType(path: string): 'derive' | 'mind' | null {
  if (path.endsWith('.derive.json')) return 'derive'
  if (path.endsWith('.mind.json')) return 'mind'
  return null
}

function renderMarkdown(md: string, codeMappings: CodeMapping[], noteAbsoluteDir?: string): string {
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

  // Apply markdown formatting first, before injecting @ref code snippets.
  // This prevents C/C++ pointer syntax (*) inside code snippets from being
  // misinterpreted as markdown emphasis.
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/!\[([^\]]+)\]\(([^)]+)\)/g, (_match, alt, url) => {
    return `<img src="${resolveImageUrl(url, noteAbsoluteDir)}" alt="${alt}">`
  })
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

  // Parse ![[path/to/note.xxx.json]] wiki-link embeds (block-level only)
  html = html.replace(/^!\[\[([^\]]+)\]\]$/gm, (_fullMatch: string, path: string) => {
    const trimmedPath = path.trim()
    const embedType = inferEmbedType(trimmedPath)
    if (!embedType) {
      // Unrecognized type — leave as plain text
      return `![[${trimmedPath}]]`
    }
    return `<div class="note-embed-placeholder" data-note-path="${trimmedPath}" data-note-type="${embedType}"></div>`
  })

  // Convert @ref(...) after markdown formatting so code snippet HTML
  // (which may contain * for pointers) is not corrupted.
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

  html = html.replace(/\n\n/g, '</p><p>')
  html = '<p>' + html + '</p>'
  html = html.replace(/<p>\s*<\/p>/g, '')

  return html
}
