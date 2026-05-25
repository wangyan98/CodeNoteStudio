import { useState, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import './MdEditor.css'

interface MdEditorProps {
  content: string
  notePath: string
  onSave: (content: string) => Promise<void>
}

export function MdEditor({ content, notePath, onSave }: MdEditorProps) {
  const [value, setValue] = useState(content)
  const [showPreview, setShowPreview] = useState(false)
  const [saving, setSaving] = useState(false)

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
                __html: renderMarkdown(value)
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
          />
        )}
      </div>
    </div>
  )
}

function renderMarkdown(md: string): string {
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  html = html.replace(/\n\n/g, '</p><p>')
  html = '<p>' + html + '</p>'
  html = html.replace(/<p>\s*<\/p>/g, '')

  return html
}
