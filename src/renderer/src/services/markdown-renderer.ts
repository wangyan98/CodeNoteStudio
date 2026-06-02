import type { CodeMapping, CodeSnippet } from '../types'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function tokenizeLine(line: string): string {
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

function resolveImageUrl(url: string, noteAbsoluteDir?: string): string {
  if (url.startsWith('wsfile://')) return url
  if (/^(https?:\/\/|data:)/.test(url)) return url
  if (url.startsWith('file://')) return 'wsfile://' + url.slice('file://'.length)
  if (url.startsWith('/')) return 'wsfile://' + url
  if (noteAbsoluteDir) {
    return 'wsfile://' + resolvePath(noteAbsoluteDir, url)
  }
  return url
}

export function inferEmbedType(path: string): 'derive' | 'mind' | 'seq' | 'md' | null {
  if (path.endsWith('.derive.json')) return 'derive'
  if (path.endsWith('.mind.json')) return 'mind'
  if (path.endsWith('.seq.mermaid')) return 'seq'
  if (path.endsWith('.md')) return 'md'
  return null
}

export function renderMarkdown(
  md: string,
  codeMappings: CodeMapping[],
  noteAbsoluteDir?: string
): string {
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

  html = html.replace(/^!\[\[([^\]]+)\]\]$/gm, (_fullMatch: string, path: string) => {
    const trimmedPath = path.trim()
    const embedType = inferEmbedType(trimmedPath)
    if (!embedType) {
      return `![[${trimmedPath}]]`
    }
    return `<div class="note-embed-placeholder" data-note-path="${trimmedPath}" data-note-type="${embedType}"></div>`
  })

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

/**
 * Render markdown for embed content — strips [[path]] and ![[path]] references
 * to enforce first-level-only policy (no recursive embeds).
 */
export function renderMarkdownForEmbed(md: string): string {
  let stripped = md.replace(/^!?\[\[([^\]]+)\]\]$/gm, '')
  stripped = stripped.replace(/\[\[([^\]]+)\]\]/g, '$1')
  return renderMarkdown(stripped, [])
}
