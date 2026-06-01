# Mind Map Node Content Embed Rendering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support `[[relative/path]]` embed references in mind.json node `content`, rendering referenced file content as togglable, absolutely-positioned HTML cards below SVG nodes in the Canvas.

**Architecture:** Parse `[[path]]` from node content at render time, resolve via existing `electronAPI.readNote()` IPC, cache results in a `Map`, render embed content in an absolutely-positioned HTML overlay layer inside the Canvas container. Toggle state stored in a `Set<{nodeId}::{path}>`. Position cards by mapping SVG node bounding rects to container-relative coordinates.

**Tech Stack:** React, D3.js, TypeScript, existing IPC (notes:read)

---

## File Structure

| File | Role |
|------|------|
| `src/renderer/src/services/markdown-renderer.ts` (NEW) | Shared `renderMarkdown()` extracted from MdEditor |
| `src/renderer/src/components/editors/mindMapReducer.ts` | Add `TOGGLE_EMBED` action to reducer |
| `src/renderer/src/components/editors/MindMapCanvas.tsx` | Major: embed overlay, toggle UI, resolve/load/render logic |
| `src/renderer/src/components/editors/MindMapRenderer.css` | Major: embed overlay styles, toggle button styles, card styles |
| `src/renderer/src/components/editors/MindMapEditor.tsx` | Minor: thread `notePath` prop through to Canvas |
| `src/renderer/src/components/editors/NodeEditPanel.tsx` | Minor: add `notePath` prop for embed preview in edit panel |
| `src/renderer/src/components/editors/MdEditor.tsx` | Minor: replace inline renderMarkdown with shared import |
| `src/renderer/src/components/NoteViewport.tsx` | Minor: pass `selectedNoteId` as `notePath` to editor |

---

### Task 1: Extract renderMarkdown to shared service

**Files:**
- Create: `src/renderer/src/services/markdown-renderer.ts`
- Modify: `src/renderer/src/components/editors/MdEditor.tsx`

**Purpose:** Extract `renderMarkdown()`, `escapeHtml()`, `tokenizeLine()`, `renderCodeSnippet()`, `resolveImageUrl()`, `resolvePath()`, `inferEmbedType()` from MdEditor into a shared module so MindMapCanvas can reuse markdown rendering without duplicating code or importing from a component.

- [ ] **Step 1: Create the shared markdown renderer module**

```typescript
// src/renderer/src/services/markdown-renderer.ts
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

  // Apply markdown formatting before @ref injection (prevents * in C pointers from breaking)
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

  // ![[path]] wiki-link embeds (block-level only)
  html = html.replace(/^!\[\[([^\]]+)\]\]$/gm, (_fullMatch: string, path: string) => {
    const trimmedPath = path.trim()
    const embedType = inferEmbedType(trimmedPath)
    if (!embedType) {
      return `![[${trimmedPath}]]`
    }
    return `<div class="note-embed-placeholder" data-note-path="${trimmedPath}" data-note-type="${embedType}"></div>`
  })

  // @ref() code references
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
  // Strip wiki-link embeds: ![[path]] and [[path]]
  let stripped = md.replace(/^!?\[\[([^\]]+)\]\]$/gm, '')
  // Strip inline [[path]] references
  stripped = stripped.replace(/\[\[([^\]]+)\]\]/g, '$1')
  // Render without code mappings or image resolution
  return renderMarkdown(stripped, [])
}
```

- [ ] **Step 2: Update MdEditor.tsx to import from shared module**

Remove the local definitions of `escapeHtml`, `tokenizeLine`, `renderCodeSnippet`, `resolveImageUrl`, `resolvePath`, `inferEmbedType`, `renderMarkdown` from `MdEditor.tsx` (lines 295–431). Replace with:

```typescript
import { renderMarkdown, inferEmbedType } from '../../services/markdown-renderer'
```

And in the preview effect (line 261), update the call to remove `inferEmbedType` local usage (already imported).

- [ ] **Step 3: Run type-check to verify no import errors**

Run: `npx tsc --noEmit -p tsconfig.web.json`

Expected: No type errors related to `markdown-renderer` or `MdEditor`.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/services/markdown-renderer.ts src/renderer/src/components/editors/MdEditor.tsx
git commit -m "refactor: extract renderMarkdown to shared markdown-renderer service"
```

---

### Task 2: No reducer changes needed (design decision)

**Files:** None

**Purpose:** The `TOGGLE_EMBED` action listed in the spec's file changes table does not require a reducer change. Embed toggle state (`expandedEmbeds: Set<string>`) is purely UI state managed locally in `MindMapCanvas`, following the same pattern as `collapsedIds` in `MindMapEditor`. No `mindMapReducer` changes are needed.

- [ ] **Step 1: Note design decision in commit**

```bash
git commit --allow-empty -m "docs: TOGGLE_EMBED is UI state, no reducer changes needed"
```

---

### Task 3: Thread notePath from NoteViewport through MindMapEditor to MindMapCanvas

**Files:**
- Modify: `src/renderer/src/components/NoteViewport.tsx` (pass `selectedNoteId`)
- Modify: `src/renderer/src/components/editors/MindMapEditor.tsx` (accept + pass `notePath` prop)
- Modify: `src/renderer/src/components/editors/MindMapCanvas.tsx` (accept `notePath` prop, no usage yet)

**Purpose:** MindMapCanvas needs to know the current mind.json file's relative path to resolve `[[path]]` references relative to the file's directory.

- [ ] **Step 1: Add notePath prop to MindMapCanvas interface**

```typescript
// In MindMapCanvas.tsx, update the interface:
interface MindMapCanvasProps {
  doc: MindMapDocument
  notePath: string  // ADD: relative path of the mind.json file (e.g. "notes/算法/排序.mind.json")
  selectedNodeId: string | null
  collapsedIds: Set<string>
  dispatch: React.Dispatch<MindMapAction>
  onContextMenu: (nodeId: string, x: number, y: number) => void
  onHoverNode?: (nodeId: string | null) => void
}
```

- [ ] **Step 2: Update MindMapEditor to accept and pass notePath**

```typescript
// In MindMapEditor.tsx, update the interface:
interface MindMapEditorProps {
  document: MindMapDocument
  notePath: string  // ADD
  onSave: (doc: MindMapDocument) => Promise<void>
  onNavigateToCode?: (filePath: string, line: number) => void
}
```

And in the JSX, pass `notePath` to MindMapCanvas:

```tsx
<MindMapCanvas
  ref={canvasRef}
  doc={doc}
  notePath={notePath}
  selectedNodeId={selectedNodeId}
  collapsedIds={collapsedIds}
  dispatch={wrappedDispatch}
  onContextMenu={handleContextMenu}
/>
```

- [ ] **Step 3: Update NoteViewport to pass selectedNoteId as notePath**

In `NoteViewport.tsx`, update the `case 'mind':` block (around line 147):

```tsx
case 'mind':
  return (
    <MindMapEditor
      document={activeNoteContent as MindMapDocument}
      notePath={selectedNoteId}  // ADD
      onSave={async (doc: MindMapDocument) => {
        await saveNote(selectedNoteId, doc)
      }}
      onNavigateToCode={(filePath: string, line: number) => {
        navigateToCode(filePath, line)
      }}
    />
  )
```

- [ ] **Step 4: Run type-check**

Run: `npx tsc --noEmit -p tsconfig.web.json`

Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/editors/MindMapCanvas.tsx src/renderer/src/components/editors/MindMapEditor.tsx src/renderer/src/components/NoteViewport.tsx
git commit -m "feat: thread notePath through MindMapEditor to MindMapCanvas"
```

---

### Task 4: Add embed parsing, resolution, and caching to MindMapCanvas

**Files:**
- Modify: `src/renderer/src/components/editors/MindMapCanvas.tsx`

**Purpose:** Parse `[[path]]` from node content, resolve paths, detect circular refs, load content via IPC, cache results. No visual rendering yet.

- [ ] **Step 1: Define embed types and embed state at top of MindMapCanvas**

```typescript
// Add these imports at top:
import type { NoteContent } from '../../../../main/services/note-service'
import { inferEmbedType } from '../../services/markdown-renderer'

// Add these types after imports, before the component:
interface EmbedRef {
  rawMatch: string         // the full [[path]] string
  relativePath: string     // the path inside brackets, trimmed
}

type EmbedStatus = 'loading' | 'loaded' | 'error'

interface ResolvedEmbed {
  status: EmbedStatus
  notePath: string          // resolved relative path (used as IPC key)
  noteType: string | null   // 'md' | 'mind' | 'derive' | 'seq' | null
  content?: NoteContent     // loaded content
  errorMessage?: string     // error text if status === 'error'
}

function parseEmbeds(content: string): EmbedRef[] {
  const refs: EmbedRef[] = []
  const matches = content.matchAll(/\[\[([^\]]+)\]\]/g)
  for (const match of matches) {
    refs.push({
      rawMatch: match[0],
      relativePath: match[1].trim()
    })
  }
  return refs
}

function resolveEmbedPath(
  sourceNotePath: string,
  embedRelativePath: string
): string {
  // embedRelativePath is relative to the source mind.json file's directory
  const sourceDir = sourceNotePath.replace(/\/[^/]*$/, '')
  const combined = sourceDir ? `${sourceDir}/${embedRelativePath}` : embedRelativePath
  // Normalize .. and .
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
  return resolved.join('/')
}

function isCircularReference(sourceNotePath: string, targetResolvedPath: string): boolean {
  return sourceNotePath === targetResolvedPath
}
```

- [ ] **Step 2: Add embed state to MindMapCanvas component**

Add these state variables inside the component (after existing state declarations):

```typescript
// Add before the render() callback:
const [expandedEmbeds, setExpandedEmbeds] = useState<Set<string>>(new Set())
const [embedCache, setEmbedCache] = useState<Map<string, ResolvedEmbed>>(new Map())
```

- [ ] **Step 3: Add embed resolution function**

Add this callback inside the component (before `render()`):

```typescript
const resolveEmbed = useCallback(async (nodeId: string, embedRef: EmbedRef): Promise<ResolvedEmbed> => {
  const resolvedPath = resolveEmbedPath(notePath, embedRef.relativePath)
  const cacheKey = `${nodeId}::${resolvedPath}`

  // Check cache first
  if (embedCache.has(cacheKey)) {
    return embedCache.get(cacheKey)!
  }

  // Circular reference check
  if (isCircularReference(notePath, resolvedPath)) {
    const err: ResolvedEmbed = {
      status: 'error',
      notePath: resolvedPath,
      noteType: null,
      errorMessage: `Circular reference: ${embedRef.relativePath}`
    }
    setEmbedCache(prev => new Map(prev).set(cacheKey, err))
    return err
  }

  // Check file type
  const noteType = inferEmbedType(resolvedPath)
  if (!noteType) {
    const err: ResolvedEmbed = {
      status: 'error',
      notePath: resolvedPath,
      noteType: null,
      errorMessage: `Unsupported type: ${embedRef.relativePath}`
    }
    setEmbedCache(prev => new Map(prev).set(cacheKey, err))
    return err
  }

  // Set loading
  const loading: ResolvedEmbed = { status: 'loading', notePath: resolvedPath, noteType }
  setEmbedCache(prev => new Map(prev).set(cacheKey, loading))

  // Load via IPC
  try {
    const content = await window.electronAPI.readNote(resolvedPath) as NoteContent
    const resolved: ResolvedEmbed = {
      status: 'loaded',
      notePath: resolvedPath,
      noteType,
      content
    }
    setEmbedCache(prev => new Map(prev).set(cacheKey, resolved))
    return resolved
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    let errorMessage: string
    if (msg.includes('ENOENT') || msg.includes('not found') || msg.includes('does not exist')) {
      errorMessage = `File not found: ${embedRef.relativePath}`
    } else if (msg.includes('EACCES') || msg.includes('permission')) {
      errorMessage = `Cannot read: ${embedRef.relativePath}`
    } else {
      errorMessage = `Load error: ${embedRef.relativePath}`
    }
    const err: ResolvedEmbed = {
      status: 'error',
      notePath: resolvedPath,
      noteType,
      errorMessage
    }
    setEmbedCache(prev => new Map(prev).set(cacheKey, err))
    return err
  }
}, [notePath, embedCache])
```

- [ ] **Step 4: Add toggle handler**

```typescript
const handleToggleEmbed = useCallback(async (nodeId: string, embedRef: EmbedRef) => {
  const resolvedPath = resolveEmbedPath(notePath, embedRef.relativePath)
  const cacheKey = `${nodeId}::${resolvedPath}`

  setExpandedEmbeds(prev => {
    const next = new Set(prev)
    if (next.has(cacheKey)) {
      next.delete(cacheKey)
      return next
    }
    // Expanding — trigger resolution
    next.add(cacheKey)
    // Async: resolve the embed content
    resolveEmbed(nodeId, embedRef)
    return next
  })
}, [notePath, resolveEmbed])
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/editors/MindMapCanvas.tsx
git commit -m "feat: add embed parsing, resolution, and caching to MindMapCanvas"
```

---

### Task 5: Add embed overlay HTML layer and position sync

**Files:**
- Modify: `src/renderer/src/components/editors/MindMapCanvas.tsx`

**Purpose:** Add an absolutely-positioned HTML overlay div inside the Canvas container, position cards relative to SVG nodes, and sync positions on zoom/pan.

- [ ] **Step 1: Add overlay ref and position sync logic**

Add these refs alongside existing ones in the component:

```typescript
const embedOverlayRef = useRef<HTMLDivElement>(null)
```

- [ ] **Step 2: Add position syncing function**

Add this callback (before `render()`, after other callbacks):

```typescript
const syncEmbedPositions = useCallback(() => {
  const overlay = embedOverlayRef.current
  const container = containerRef.current
  const svg = svgRef.current
  if (!overlay || !container || !svg) return

  const containerRect = container.getBoundingClientRect()

  overlay.querySelectorAll<HTMLElement>('.embed-card').forEach(card => {
    const nodeId = card.getAttribute('data-node-id')
    const embedPath = card.getAttribute('data-embed-path')
    if (!nodeId) return

    const nodeEl = svg.querySelector<SVGGElement>(`[data-node-id="${nodeId}"]`)
    if (!nodeEl) return

    const nodeRect = nodeEl.getBoundingClientRect()
    // Position below the SVG node rect
    const top = nodeRect.bottom - containerRect.top + 4
    const left = nodeRect.left - containerRect.left

    card.style.position = 'absolute'
    card.style.top = `${top}px`
    card.style.left = `${left}px`
    card.style.maxWidth = `${Math.min(480, containerRect.width - left - 16)}px`
  })
}, [])
```

- [ ] **Step 3: Update zoom handler to sync embed positions**

In `MindMapCanvas.tsx`, in the `render()` callback, locate the zoom creation block:

```typescript
if (!zoomRef.current) {
  zoomRef.current = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.3, 2.5])
    .on('zoom', (event) => {
      if (gElRef.current) {
        d3.select(gElRef.current).attr('transform', `translate(${event.transform.x},${event.transform.y}) scale(${event.transform.k})`)
      }
    })
  ;(svg as any).call(zoomRef.current)
  ;(svg as any).call(zoomRef.current.transform, d3.zoomIdentity.translate(80, height / 2))
}
```

Replace with:

```typescript
if (!zoomRef.current) {
  zoomRef.current = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.3, 2.5])
    .on('zoom', (event) => {
      if (gElRef.current) {
        d3.select(gElRef.current).attr('transform',
          `translate(${event.transform.x},${event.transform.y}) scale(${event.transform.k})`)
      }
      requestAnimationFrame(() => syncEmbedPositions())
    })
  ;(svg as any).call(zoomRef.current)
  ;(svg as any).call(zoomRef.current.transform, d3.zoomIdentity.translate(80, height / 2))
}
```
`syncEmbedPositions` uses refs internally so the closure captured at zoom creation time reads the latest ref values at call time.

- [ ] **Step 4: Add overlay div to JSX**

In the JSX return (around line 524), after the `<svg>` element, add the overlay div:

```tsx
return (
  <div
    className="mindmap-container"
    ref={containerRef}
    tabIndex={0}
    onKeyDown={...}
  >
    <svg ref={svgRef} />
    <div
      ref={embedOverlayRef}
      className="mindmap-embed-overlay"
    />
  </div>
)
```

- [ ] **Step 5: Run type-check**

Run: `npx tsc --noEmit -p tsconfig.web.json`

Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/editors/MindMapCanvas.tsx
git commit -m "feat: add embed overlay HTML layer and position sync in MindMapCanvas"
```

---

### Task 6: Render embed toggle buttons in SVG nodes and content cards in overlay

**Files:**
- Modify: `src/renderer/src/components/editors/MindMapCanvas.tsx`

**Purpose:** In the SVG, add toggle indicators below each node that has `[[path]]` in its content. In the overlay, render embedded file content as React components when expanded.

- [ ] **Step 1: Add embed toggle indicators to SVG nodes**

In the `render()` callback, after the title text is appended to node groups (after line ~243), add:

```typescript
// After the title text append block:
// Embed toggle indicators
nodeGroup.each(function (d: d3.HierarchyNode<MindMapNode>) {
  if (!d.data.content) return
  const embeds = parseEmbeds(d.data.content)
  if (embeds.length === 0) return

  const g = d3.select(this)
  embeds.forEach((embedRef, i) => {
    const resolvedPath = resolveEmbedPath(notePath, embedRef.relativePath)
    const cacheKey = `${d.data.id}::${resolvedPath}`
    const isExpanded = expandedEmbeds.has(cacheKey)
    const cached = embedCache.get(cacheKey)

    const indicatorY = 22 + i * 18  // Below the node rect

    // Background rect for toggle row
    g.append('rect')
      .attr('x', -70)
      .attr('y', indicatorY)
      .attr('width', 140)
      .attr('height', 16)
      .attr('rx', 3)
      .attr('fill', cached?.status === 'error' ? '#3d2020' : '#2a2a2a')
      .attr('stroke', cached?.status === 'error' ? '#f44747' : '#444')
      .attr('stroke-width', 0.5)

    // Toggle arrow
    g.append('text')
      .attr('x', -62)
      .attr('y', indicatorY + 11)
      .attr('fill', cached?.status === 'error' ? '#f44747' : '#888')
      .attr('font-size', '9px')
      .style('pointer-events', 'none')
      .text(isExpanded ? '▼' : '▶')

    // Label text
    const label = cached?.errorMessage
      ? `⚠ ${cached.errorMessage}`
      : `📄 ${embedRef.relativePath}`
    g.append('text')
      .attr('x', -48)
      .attr('y', indicatorY + 12)
      .attr('fill', cached?.status === 'error' ? '#f44747' : '#aaa')
      .attr('font-size', '9px')
      .text(label.length > 28 ? label.slice(0, 26) + '..' : label)

    // Click area (invisible rect)
    g.append('rect')
      .attr('x', -70)
      .attr('y', indicatorY)
      .attr('width', 140)
      .attr('height', 16)
      .attr('fill', 'transparent')
      .style('cursor', 'pointer')
      .on('click', (event: MouseEvent) => {
        event.stopPropagation()
        handleToggleEmbed(d.data.id, embedRef)
      })
  })
})
```

- [ ] **Step 2: Render expanded embed content cards in the overlay**

After the SVG rendering is complete in `render()`, and after the inline editing overlay logic, add embed content rendering. Use React portals via a side effect. Actually, since `render()` is a D3 function, we should render embed cards through a React effect that reads from state.

Add a `useEffect` that syncs the overlay DOM when `expandedEmbeds` or `embedCache` changes:

```typescript
// Add a ref to track React roots for cleanup:
const embedRootsRef = useRef<Array<() => void>>([])

// After the render effect (useEffect(() => { render() }, [render])):
useEffect(() => {
  const overlay = embedOverlayRef.current
  if (!overlay) return

  // Clean up previous roots before clearing DOM
  embedRootsRef.current.forEach(unmount => unmount())
  embedRootsRef.current = []

  // Clear overlay
  overlay.innerHTML = ''

  if (expandedEmbeds.size === 0) return

  // For each expanded embed, render a card
  expandedEmbeds.forEach(cacheKey => {
    const cached = embedCache.get(cacheKey)
    if (!cached) return

    // Parse cacheKey: "nodeId::resolvedPath"
    const sepIdx = cacheKey.indexOf('::')
    const nodeId = cacheKey.slice(0, sepIdx)
    const embedPath = cacheKey.slice(sepIdx + 2)

    const card = document.createElement('div')
    card.className = 'embed-card'
    card.setAttribute('data-node-id', nodeId)
    card.setAttribute('data-embed-path', embedPath)

    // Header bar
    const header = document.createElement('div')
    header.className = 'embed-card-header'
    header.innerHTML = `<span class="embed-card-badge">${cached.noteType}</span> <span>${embedPath}</span>`
    card.appendChild(header)

    // Body
    const body = document.createElement('div')
    body.className = 'embed-card-body'

    if (cached.status === 'loading') {
      body.innerHTML = '<div class="embed-card-loading">Loading...</div>'
    } else if (cached.status === 'loaded' && cached.content !== undefined) {
      // Render content by type using React createRoot (similar to MdEditor embed rendering)
      const root = createRoot(body)
      embedRootsRef.current.push(() => root.unmount())
      if (cached.noteType === 'md') {
        const mdHtml = renderMarkdownForEmbed(cached.content as string)
        root.render(
          <div dangerouslySetInnerHTML={{ __html: mdHtml }} />
        )
      } else if (cached.noteType === 'mind') {
        root.render(
          <MindMapRenderer
            document={cached.content as MindMapDocument}
            onSave={async () => {}}
          />
        )
      } else if (cached.noteType === 'derive') {
        root.render(
          <DerivationDagViewer document={cached.content as DerivationDocument} />
        )
      } else if (cached.noteType === 'seq') {
        root.render(
          <SequenceDiagramViewer content={cached.content as string} />
        )
      }
    }

    card.appendChild(body)
    overlay.appendChild(card)
  })

  // Position cards after they're added to DOM
  requestAnimationFrame(() => syncEmbedPositions())
}, [expandedEmbeds, embedCache, syncEmbedPositions])
```

- [ ] **Step 3: Import required modules and components**

At the top of `MindMapCanvas.tsx`, add:

```typescript
import { createRoot } from 'react-dom/client'
import { renderMarkdownForEmbed } from '../../services/markdown-renderer'
import { MindMapRenderer } from './MindMapRenderer'
import { DerivationDagViewer } from './DerivationDagViewer'
import { SequenceDiagramViewer } from './SequenceDiagramViewer'
import type { MindMapDocument, DerivationDocument } from '../../../../main/schemas/note-types'
```

Note: `MindMapDocument` is already imported, `DerivationDocument` is new.

- [ ] **Step 4: Add ResizeObserver to sync embed positions**

Extend the existing ResizeObserver effect (around line 508–515) to also sync embed positions:

```typescript
useEffect(() => {
  const container = containerRef.current
  if (!container) return
  const observer = new ResizeObserver(() => {
    render()
    requestAnimationFrame(() => syncEmbedPositions())
  })
  observer.observe(container)
  return () => observer.disconnect()
}, [render, syncEmbedPositions])
```

- [ ] **Step 5: Run type-check**

Run: `npx tsc --noEmit -p tsconfig.web.json`

Expected: No type errors. Fix any that arise (e.g., missing type imports).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/editors/MindMapCanvas.tsx
git commit -m "feat: render embed toggle buttons in SVG and content cards in overlay"
```

---

### Task 7: Add CSS styles for embed overlay, cards, and toggle indicators

**Files:**
- Modify: `src/renderer/src/components/editors/MindMapRenderer.css`

**Purpose:** Style the overlay, embed cards, toggle indicators, error states, loading states.

- [ ] **Step 1: Add embed overlay and card CSS**

Append to `MindMapRenderer.css`:

```css
/* Mindmap container needs relative positioning for the embed overlay */
.mindmap-container {
  position: relative;
}

/* --- Embed Overlay --- */

.mindmap-embed-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 10;
}

.mindmap-embed-overlay .embed-card {
  pointer-events: auto;
  background: #1e1e1e;
  border: 1px solid #444;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
  min-width: 220px;
  max-width: 480px;
  overflow: hidden;
}

.embed-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #2d2d2d;
  border-bottom: 1px solid #444;
  font-size: 11px;
  color: #aaa;
}

.embed-card-badge {
  background: #3c3c3c;
  color: #ccc;
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 3px;
  text-transform: uppercase;
  font-weight: 600;
}

.embed-card-body {
  padding: 8px 10px;
  max-height: 320px;
  overflow-y: auto;
  font-size: 12px;
  color: #d4d4d4;
  line-height: 1.5;
}

.embed-card-body .mindmap-container {
  height: 240px;
  min-height: 160px;
}

.embed-card-body pre {
  background: #2d2d2d;
  padding: 8px;
  border-radius: 4px;
  font-size: 11px;
  overflow-x: auto;
}

.embed-card-body code {
  background: #333;
  padding: 1px 4px;
  border-radius: 2px;
  font-size: 11px;
}

.embed-card-loading {
  color: #666;
  font-size: 11px;
  padding: 8px;
  text-align: center;
}

/* --- SVG Embed Toggle Indicators --- */

.embed-toggle-row {
  cursor: pointer;
}

.embed-toggle-row:hover rect {
  fill: #3c3c3c;
}

.embed-toggle-arrow {
  font-family: monospace;
  user-select: none;
}

.embed-toggle-label {
  font-family: monospace;
  user-select: none;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/editors/MindMapRenderer.css
git commit -m "style: add embed overlay, card, and toggle indicator CSS"
```

---

### Task 8: Manual integration test

**Files:**
- Create: test mind.json and companion .md files (in project workspace)
- Modify: `src/renderer/src/components/editors/MindMapCanvas.tsx` (any bug fixes)

**Purpose:** Verify the feature works end-to-end with real files.

- [ ] **Step 1: Create test files**

In the project's notes directory, create:

```
notes/
  embed-test/
    test.mind.json         — mind map with [[references]]
    companion.md           — simple markdown to embed
    sub-mind.mind.json     — another mind map to embed
```

`embed-test/test.mind.json`:
```json
{
  "type": "mind",
  "version": 1,
  "root": {
    "id": "root-1",
    "title": "Embed Test",
    "content": "See [[embed-test/companion.md]] and [[embed-test/sub-mind.mind.json]]",
    "children": [
      {
        "id": "child-1",
        "title": "Self Ref",
        "content": "This references [[embed-test/test.mind.json]] (circular)",
        "children": []
      }
    ]
  }
}
```

`embed-test/companion.md`:
```markdown
## Companion Note

This is a test markdown file embedded in the mind map.

- Item 1
- Item 2
```

`embed-test/sub-mind.mind.json`:
```json
{
  "type": "mind",
  "version": 1,
  "root": {
    "id": "sub-1",
    "title": "Sub Mind Map",
    "content": "I'm embedded!",
    "children": [
      { "id": "sub-2", "title": "Sub child", "content": "", "children": [] }
    ]
  }
}
```

- [ ] **Step 2: Run the app and verify visually**

Run: `npm run dev`

Expected behavior:
1. Open `embed-test/test.mind.json` in the mind map editor
2. Root node shows two toggle indicators: ▶ companion.md, ▶ sub-mind.mind.json
3. Click ▶ to expand companion.md → card renders with rendered markdown
4. Click ▶ to expand sub-mind.mind.json → card renders with MindMapRenderer
5. Child node "Self Ref" shows ⚠ Circular reference indicator
6. Zoom/pan the canvas — embed cards follow their nodes
7. Resize the window — cards reposition correctly
8. Toggle collapsed (▼ → ▶) hides the card

- [ ] **Step 3: Fix any visual issues found during testing**

Common expected issues:
- Card position offset when SVG g element has transform → fix by incorporating g transform in `syncEmbedPositions()`
- Cards not visible due to z-index → ensure overlay has correct z-index
- Card width exceeding container → clamp in `syncEmbedPositions()`

- [ ] **Step 4: Final commit with any fixes**

```bash
git add -A
git commit -m "test: add embed test files and final integration fixes"
```
