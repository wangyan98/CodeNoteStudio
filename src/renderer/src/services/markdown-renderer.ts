import katex from 'katex'
import type { CodeMapping, CodeSnippet } from '../types'

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

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

function parseAlignment(delimiter: string): ('left' | 'center' | 'right')[] {
  return delimiter
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => {
      const trimmed = cell.trim()
      if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center'
      if (trimmed.endsWith(':')) return 'right'
      return 'left'
    })
}

function renderTable(lines: string[]): string {
  const rows = lines
    .map(line => line.replace(/^\|/, '').replace(/\|$/, ''))
    .map(line => line.split('|').map(cell => cell.trim()))

  const headerCells = rows[0]
  const hasDelimiter = rows.length > 1 && /^[\s:\-|]+$/.test(lines[1])
  const alignments = hasDelimiter
    ? parseAlignment(lines[1])
    : headerCells.map(() => 'left')

  const dataStart = hasDelimiter ? 2 : 1

  const alignmentStyle = (i: number) => ` style="text-align:${alignments[i]}"`

  const headerHtml = '<tr>' + headerCells.map((cell, i) =>
    `<th${alignmentStyle(i)}>${cell}</th>`
  ).join('') + '</tr>'

  const bodyHtml = rows.slice(dataStart).map(row =>
    '<tr>' + row.map((cell, i) =>
      `<td${alignmentStyle(i)}>${cell}</td>`
    ).join('') + '</tr>'
  ).join('')

  return `<table><thead>${headerHtml}</thead><tbody>${bodyHtml}</tbody></table>`
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

export function inferEmbedType(path: string): 'derive' | 'mind' | 'seq' | 'md' | 'net' | null {
  if (path.endsWith('.derive.json')) return 'derive'
  if (path.endsWith('.mind.json')) return 'mind'
  if (path.endsWith('.seq.mermaid')) return 'seq'
  if (path.endsWith('.net.json')) return 'net'
  if (path.endsWith('.md')) return 'md'
  return null
}

export function renderMarkdown(
  md: string,
  codeMappings: CodeMapping[],
  noteAbsoluteDir?: string,
  codeRepos?: { path: string }[]
): string {
  // Strip repo prefix from an absolute path to get a relative path
  const relativePath = (absPath: string): string => {
    if (codeRepos) {
      for (const repo of codeRepos) {
        const prefix = repo.path.endsWith('/') ? repo.path : repo.path + '/'
        if (absPath.startsWith(prefix)) return absPath.slice(prefix.length)
      }
    }
    return absPath.split('/').pop() || absPath
  }
  const snippetByRaw = new Map<string, CodeSnippet>()
  const labelByRaw = new Map<string, string>()
  const matchedRaws = new Set<string>()
  for (const m of codeMappings) {
    matchedRaws.add(m.raw)
    if (m.codeSnippet) {
      snippetByRaw.set(m.raw, m.codeSnippet)
    }
    // Build human-readable label for the clickable link.
    // - functionName that contains '/' is a fallback path → file-only ref
    // - otherwise → "relativePath#functionName"
    const relPath = relativePath(m.filePath)
    if (m.functionName.includes('/')) {
      labelByRaw.set(m.raw, relPath)
    } else {
      labelByRaw.set(m.raw, `${relPath} <span class="ref-fn">${m.functionName}</span>`)
    }
  }

  // Normalize line endings
  let html = md.replace(/\r\n/g, '\n')

  // Escape HTML entities
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Protect fenced code blocks with placeholders so inner content isn't processed
  const codeBlocks: string[] = []
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_full, lang, code) => {
    const idx = codeBlocks.length
    codeBlocks.push(`<pre><code class="language-${lang}">${code}</code></pre>`)
    return `\x00CODE${idx}\x00`
  })

  // Protect block formulas $$...$$
  const blockFormulas: string[] = []
  html = html.replace(/\$\$([\s\S]*?)\$\$/g, (_full, formula) => {
    const idx = blockFormulas.length
    blockFormulas.push(
      katex.renderToString(decodeHtmlEntities(formula.trim()), { displayMode: true, throwOnError: false })
    )
    return `\x00MATHB${idx}\x00`
  })

  // Protect inline formulas $...$
  const inlineFormulas: string[] = []
  html = html.replace(/\$([^$\n]+)\$/g, (_full, formula) => {
    const idx = inlineFormulas.length
    inlineFormulas.push(
      katex.renderToString(decodeHtmlEntities(formula.trim()), { displayMode: false, throwOnError: false })
    )
    return `\x00MATHI${idx}\x00`
  })

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Headings
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')

  // Unordered lists (consecutive lines starting with - or *)
  html = html.replace(/(?:^[-*] .+$\n?)+/gm, (match) => {
    const items = match.trim().split('\n')
      .map(line => `<li>${line.replace(/^[-*] /, '')}</li>`)
      .join('')
    return `<ul>${items}</ul>`
  })

  // Ordered lists (consecutive lines starting with digits + dot)
  html = html.replace(/(?:^\d+\. .+$\n?)+/gm, (match) => {
    const items = match.trim().split('\n')
      .map(line => `<li>${line.replace(/^\d+\. /, '')}</li>`)
      .join('')
    return `<ol>${items}</ol>`
  })

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')

  // Bold / italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // Images
  html = html.replace(/!\[([^\]]+)\]\(([^)]+)\)/g, (_match, alt, url) => {
    return `<img src="${resolveImageUrl(url, noteAbsoluteDir)}" alt="${alt}">`
  })

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

  // Embed placeholders
  html = html.replace(/^!\[\[([^\]]+)\]\]$/gm, (_fullMatch: string, path: string) => {
    const trimmedPath = path.trim()
    const embedType = inferEmbedType(trimmedPath)
    if (!embedType) {
      return `![[${trimmedPath}]]`
    }
    return `<div class="note-embed-placeholder" data-note-path="${trimmedPath}" data-note-type="${embedType}"></div>`
  })

  // @ref on its own line — render code snippet inline
  html = html.replace(
    /^@ref\(([a-zA-Z0-9._/\-:#]+)\)$/gm,
    (_fullMatch: string, refBody: string) => {
      if (!matchedRaws.has(refBody)) {
        return `@ref(${refBody})`
      }
      const label = labelByRaw.get(refBody) || refBody
      const snippet = snippetByRaw.get(refBody)
      let result = `<span class="ref-link" data-ref-name="${refBody}">${label}</span>`
      if (snippet) {
        result += renderCodeSnippet(snippet)
      }
      return result
    }
  )

  // @ref inline — only blue link, no code block
  html = html.replace(
    /@ref\(([a-zA-Z0-9._/\-:#]+)\)/g,
    (_fullMatch: string, refBody: string) => {
      if (!matchedRaws.has(refBody)) {
        return `@ref(${refBody})`
      }
      const label = labelByRaw.get(refBody) || refBody
      return `<span class="ref-link" data-ref-name="${refBody}">${label}</span>`
    }
  )

  // Tables (consecutive pipe-table lines)
  html = html.replace(/(?:^\|.+\|$\n?)+/gm, (match) => {
    const lines = match.trim().split('\n')
    if (lines.length < 2) return match // single pipe line is not a table
    return renderTable(lines)
  })

  // Restore protected code blocks
  html = html.replace(/\x00CODE(\d+)\x00/g, (_full, idx) => codeBlocks[parseInt(idx)])

  // Restore protected block formulas
  html = html.replace(
    /\x00MATHB(\d+)\x00/g,
    (_full, idx) => `<div class="math-block">${blockFormulas[parseInt(idx)]}</div>`
  )

  // Restore protected inline formulas
  html = html.replace(
    /\x00MATHI(\d+)\x00/g,
    (_full, idx) => `<span class="math-inline">${inlineFormulas[parseInt(idx)]}</span>`
  )

  // Paragraph wrapping: split by blank lines, wrap non-block segments in <p>
  const blocks = html.split(/\n\n+/)
  const isBlock = (s: string) => /^<(h[1-4]|ul|ol|blockquote|pre|div|table)[ >]/.test(s.trim())
  html = blocks.map(block => {
    const trimmed = block.trim()
    if (!trimmed) return ''
    if (isBlock(trimmed)) return trimmed
    return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`
  }).filter(Boolean).join('')

  // Clean up empty paragraphs
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
