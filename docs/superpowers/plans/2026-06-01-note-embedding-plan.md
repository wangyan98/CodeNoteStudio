# Note Embedding in Markdown — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support `![[path/to/note.xxx.json]]` wiki-link syntax in markdown to embed derive.json and mind.json notes as read-only inlined views, with click-to-navigate.

**Architecture:** Parse `![[...]]` in `renderMarkdown()` → replace with placeholder `<div data-note-path data-note-type>` → after preview HTML is injected into DOM, a `useEffect` hydrates each placeholder via `createRoot`, loading the note via `window.electronAPI.readNote()` and rendering `DerivationRenderer` / `MindMapRenderer` inline. Navigation on click via a new `onEmbedClick` prop passed from NoteViewport.

**Tech Stack:** React 18 (`createRoot`), existing KaTeX/D3 renderers, existing IPC (`notes:read`)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/renderer/src/components/editors/MdEditor.tsx` | Parse `![[...]]` in `renderMarkdown()`, hydrate placeholders with React, new `onEmbedClick` prop |
| `src/renderer/src/components/editors/MdEditor.css` | Styles for `.note-embed-container`, `.note-embed-header`, placeholder states |
| `src/renderer/src/components/NoteViewport.tsx` | Wire `onEmbedClick` to `selectNote` for navigation |

---

### Task 1: Add `![[...]]` parsing to renderMarkdown

**Files:**
- Modify: `src/renderer/src/components/editors/MdEditor.tsx:269-323`

- [ ] **Step 1: Add embed parsing to `renderMarkdown`**

Replace the existing `renderMarkdown` function (specifically adding embed parsing between markdown formatting and `@ref` processing):

In `renderMarkdown`, after the heading/image/link formatting (line 299) and before `@ref` processing (line 303), add embed parsing:

```typescript
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

  // Apply markdown formatting first
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

  // NEW: Parse ![[path/to/note.xxx.json]] wiki-link embeds
  html = html.replace(/^!\[\[([^\]]+)\]\]$/gm, (_fullMatch: string, path: string) => {
    const trimmedPath = path.trim()
    const embedType = inferEmbedType(trimmedPath)
    if (!embedType) {
      // Unrecognized type — leave as plain text
      return `![[${trimmedPath}]]`
    }
    return `<div class="note-embed-placeholder" data-note-path="${trimmedPath}" data-note-type="${embedType}"></div>`
  })

  // @ref processing (unchanged)
  // ...
}
```

- [ ] **Step 2: Add `inferEmbedType` helper before `renderMarkdown`**

Insert between `resolvePath` (line 267) and `renderMarkdown` (line 269):

```typescript
function inferEmbedType(path: string): 'derive' | 'mind' | null {
  if (path.endsWith('.derive.json')) return 'derive'
  if (path.endsWith('.mind.json')) return 'mind'
  return null
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/editors/MdEditor.tsx
git commit -m "feat: parse ![[path]] wiki-link embed syntax in renderMarkdown"
```

---

### Task 2: Add `onEmbedClick` prop to MdEditor

**Files:**
- Modify: `src/renderer/src/components/editors/MdEditor.tsx:8-15` (interface)

- [ ] **Step 1: Add `onEmbedClick` to MdEditorProps interface**

```typescript
interface MdEditorProps {
  content: string
  notePath: string
  workspacePath: string | null
  codeRepoPath: string | null
  onSave: (content: string) => Promise<void>
  onRefClick?: (refName: string) => void
  onEmbedClick?: (notePath: string, noteType: 'derive' | 'mind') => void  // NEW
  codeMappings?: CodeMapping[]
}
```

- [ ] **Step 2: Destructure `onEmbedClick` in the component**

In the function signature (line 26), add `onEmbedClick`:

```typescript
export const MdEditor = forwardRef<MdEditorHandle, MdEditorProps>(
  function MdEditor({ content, notePath, workspacePath, codeRepoPath, onSave, onRefClick, onEmbedClick, codeMappings }, ref) {
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/editors/MdEditor.tsx
git commit -m "feat: add onEmbedClick prop to MdEditor"
```

---

### Task 3: Hydrate embed placeholders with React

**Files:**
- Modify: `src/renderer/src/components/editors/MdEditor.tsx:1,164-180` (imports, preview rendering)

- [ ] **Step 1: Add imports**

Add at the top of the file (after existing imports):

```typescript
import { createRoot } from 'react-dom/client'
import { DerivationRenderer } from './DerivationRenderer'
import { MindMapRenderer } from './MindMapRenderer'
import type { DerivationDocument, MindMapDocument } from '../../../../main/schemas/note-types'
```

- [ ] **Step 2: Add preview container ref and embed hydration effect**

Add a ref for the preview container (after `editorMonacoRef` line 31):

```typescript
const previewRef = useRef<HTMLDivElement>(null)
```

Add the embed hydration effect (after the existing `useEffect` at line 77 that resolves refs when entering preview):

```typescript
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
```

- [ ] **Step 3: Attach `previewRef` to the preview container**

Change the preview div (line 167) to include the ref:

```tsx
<div
  ref={previewRef}
  className="md-editor-preview"
>
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/editors/MdEditor.tsx
git commit -m "feat: hydrate ![[path]] embeds with DerivationRenderer/MindMapRenderer"
```

---

### Task 4: Add embed container CSS styles

**Files:**
- Modify: `src/renderer/src/components/editors/MdEditor.css`

- [ ] **Step 1: Add embed-related styles**

Append to the end of `MdEditor.css`:

```css
/* ---- Note Embeds ---- */

.note-embed-placeholder {
  margin: 12px 0;
}

.note-embed-loading {
  padding: 16px;
  text-align: center;
  color: var(--placeholder-color);
  font-size: 12px;
  border: 1px dashed var(--border-color);
  border-radius: 6px;
}

.note-embed-error {
  padding: 12px 16px;
  color: #e44;
  font-size: 12px;
  border: 1px solid #5a1d1d;
  border-radius: 6px;
  background: rgba(255, 0, 0, 0.05);
}

.note-embed-container {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
  margin: 12px 0;
}

.note-embed-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--header-bg);
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  user-select: none;
}

.note-embed-header:hover {
  background: rgba(255, 255, 255, 0.05);
}

.note-embed-badge {
  font-size: 10px;
  padding: 1px 6px;
  background: var(--accent-color);
  color: #fff;
  border-radius: 2px;
  text-transform: uppercase;
  flex-shrink: 0;
}

.note-embed-path {
  font-size: 11px;
  color: var(--header-color);
  font-family: monospace;
}

.note-embed-body {
  max-height: 400px;
  overflow-y: auto;
}

.note-embed-body.mind-embed {
  height: 300px;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/editors/MdEditor.css
git commit -m "feat: add note embed container styles"
```

---

### Task 5: Wire `onEmbedClick` in NoteViewport

**Files:**
- Modify: `src/renderer/src/components/NoteViewport.tsx:113-133` (MdEditor JSX)

- [ ] **Step 1: Get `selectNote` from useNotes**

In the `NoteViewport` component (line 16), already destructured `saveNote`:

```typescript
const { saveNote } = useNotes()
```

Change to also get `selectNote`:

```typescript
const { saveNote, selectNote } = useNotes()
```

- [ ] **Step 2: Pass `onEmbedClick` to MdEditor**

In the `case 'md':` block (line 114-133), add the `onEmbedClick` prop:

```tsx
case 'md':
  return (
    <MdEditor
      ref={mdEditorRef}
      content={activeNoteContent as string}
      notePath={selectedNoteId}
      workspacePath={state.workspacePath}
      codeRepoPath={state.codeRepoPath}
      codeMappings={codeMappings}
      onSave={async (content: string) => {
        await saveNote(selectedNoteId, content)
      }}
      onRefClick={async (refName: string) => {
        const mappings = await window.electronAPI.resolveRefs(selectedNoteId, `@ref(${refName})`, state.codeRepoPath ?? undefined)
        if (mappings.length > 0) {
          navigateToCode(mappings[0].filePath, mappings[0].startLine)
        }
      }}
      onEmbedClick={(notePath, noteType) => {
        selectNote(notePath, noteType)
      }}
    />
  )
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/NoteViewport.tsx
git commit -m "feat: wire onEmbedClick in NoteViewport to navigate to source note"
```

---

### Task 6: Run tests and verify

**Files:**
- Test: `tests/renderer/DerivationEditor.test.tsx`
- Test: `tests/renderer/derivationReducer.test.ts`
- Test: `tests/renderer/NoteDirectory.test.tsx`

- [ ] **Step 1: Run existing tests to verify no regressions**

```bash
npx vitest run tests/renderer/DerivationEditor.test.tsx tests/renderer/derivationReducer.test.ts tests/renderer/NoteDirectory.test.tsx
```

Expected: all passing

- [ ] **Step 2: Manual smoke test checklist**

1. Create a derive note with a few steps (with LaTeX formulas)
2. Create an `.md` note that contains `![[path/to/derive.derive.json]]`
3. Switch to preview mode → verify the derivation renders with steps + formulas
4. Click the embed header → verify it navigates to the derive note for editing
5. Test with a mind map embed → verify D3 tree renders
6. Test with non-existent path → verify error state renders
7. Test with unsupported extension → verify text is left as-is
8. Test switching between Edit and Preview → embeds re-hydrate correctly

- [ ] **Step 3: Commit if any test fixes needed**

```bash
git add -A
git commit -m "test: verify note embedding with existing test suite"
```
