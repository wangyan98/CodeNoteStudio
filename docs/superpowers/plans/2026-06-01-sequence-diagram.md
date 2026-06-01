# Sequence Diagram (.seq.mermaid) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `.seq.mermaid` file type support — standalone editor with Monaco + Mermaid preview, and `![[...]]` embed rendering in Markdown.

**Architecture:** Follows the exact same pattern as `.derive.json` / `.mind.json`. A new `'seq'` NoteType stored as plain text (like `.md`), a dedicated split-view editor (SequenceEditor), and a read-only viewer (SequenceDiagramViewer) for MD embeds. Uses Mermaid.js for rendering.

**Tech Stack:** Mermaid.js, Monaco editor, React, Electron

---

### Task 1: Install mermaid dependency

- [ ] **Step 1: Install mermaid npm package**

```bash
npm install mermaid
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add mermaid dependency for sequence diagrams"
```

---

### Task 2: Add `'seq'` to backend types and note service

**Files:**
- Modify: `src/main/types.ts`
- Modify: `src/main/services/note-service.ts`

- [ ] **Step 1: Add `'seq'` to NoteFileType**

In `src/main/types.ts`, change line 14 from:
```typescript
export type NoteFileType = 'mind' | 'md' | 'derive'
```
to:
```typescript
export type NoteFileType = 'mind' | 'md' | 'derive' | 'seq'
```

- [ ] **Step 2: Add `.seq.mermaid` mapping in note-service.ts**

In `src/main/services/note-service.ts`, in the `getNoteType` function (line 23-28), add after the `if (fileName.endsWith('.md'))` line:

```typescript
if (fileName.endsWith('.seq.mermaid')) return 'seq'
```

The full function becomes:
```typescript
function getNoteType(fileName: string): NoteFileType | null {
  if (fileName.endsWith('.mind.json')) return 'mind'
  if (fileName.endsWith('.derive.json')) return 'derive'
  if (fileName.endsWith('.seq.mermaid')) return 'seq'
  if (fileName.endsWith('.md')) return 'md'
  return null
}
```

- [ ] **Step 3: Add create case for 'seq'**

In `createNote()`, add after the `case 'md'` block (before the closing brace of the switch):

```typescript
case 'seq': {
  const content = 'sequenceDiagram\n    Alice->>Bob: Hello Bob!\n    Bob->>Alice: Hello Alice!\n'
  await writeTextFile(fullPath, content)
  break
}
```

- [ ] **Step 4: Add read case for 'seq'**

In `readNote()`, add after the `.derive.json` block and before `return readTextFile(fullPath)`:

```typescript
if (relativePath.endsWith('.seq.mermaid')) {
  return readTextFile(fullPath)
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit --project tsconfig.node.json 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/main/types.ts src/main/services/note-service.ts
git commit -m "feat: add 'seq' NoteFileType to backend types and note service"
```

---

### Task 3: Add `'seq'` to frontend types

**Files:**
- Modify: `src/renderer/src/types/index.ts`

- [ ] **Step 1: Add `'seq'` to NoteType union**

In `src/renderer/src/types/index.ts`, change line 1 from:
```typescript
export type NoteType = 'mind' | 'md' | 'derive'
```
to:
```typescript
export type NoteType = 'mind' | 'md' | 'derive' | 'seq'
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit --project tsconfig.web.json 2>&1 | head -30
```

Expected: No errors from this change (other pre-existing errors may exist but no new ones).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/types/index.ts
git commit -m "feat: add 'seq' to NoteType in frontend types"
```

---

### Task 4: Create SequenceDiagramViewer (read-only embed component)

**Files:**
- Create: `src/renderer/src/components/editors/SequenceDiagramViewer.tsx`

- [ ] **Step 1: Create the viewer component**

Write `src/renderer/src/components/editors/SequenceDiagramViewer.tsx`:

```typescript
import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

// Initialize mermaid once
let mermaidInitialized = false
function initMermaid() {
  if (mermaidInitialized) return
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    sequence: {
      diagramMarginX: 20,
      diagramMarginY: 20,
      actorMargin: 60,
      boxMargin: 10,
      messageMargin: 40,
      mirrorActors: false,
      useMaxWidth: false
    }
  })
  mermaidInitialized = true
}

interface SequenceDiagramViewerProps {
  content: string
}

export function SequenceDiagramViewer({ content }: SequenceDiagramViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    initMermaid()
    const renderDiagram = async () => {
      if (!content.trim()) {
        setSvg(null)
        setError(null)
        return
      }
      try {
        const id = 'mermaid-' + Math.random().toString(36).substring(2, 8)
        const { svg: rendered } = await mermaid.render(id, content)
        setSvg(rendered)
        setError(null)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown render error'
        setError(message)
        setSvg(null)
      }
    }
    renderDiagram()
  }, [content])

  if (error) {
    return (
      <div className="sequence-diagram-error" style={{ color: '#e06c75', padding: 8, fontSize: 13 }}>
        Diagram error: {error}
      </div>
    )
  }

  if (!svg) {
    return (
      <div className="sequence-diagram-empty" style={{ color: '#5c6370', padding: 8, fontSize: 13 }}>
        Empty diagram
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="sequence-diagram-viewer"
      style={{ overflowX: 'auto', padding: 8 }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/editors/SequenceDiagramViewer.tsx
git commit -m "feat: add SequenceDiagramViewer for read-only Mermaid rendering"
```

---

### Task 5: Create SequenceEditor (split-view editor)

**Files:**
- Create: `src/renderer/src/components/editors/SequenceEditor.tsx`
- Create: `src/renderer/src/components/editors/SequenceEditor.css`

- [ ] **Step 1: Create SequenceEditor.css**

Write `src/renderer/src/components/editors/SequenceEditor.css`:

```css
.seq-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.seq-editor-toolbar {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  background: var(--toolbar-bg, #252526);
  border-bottom: 1px solid var(--border-color, #3e3e42);
  font-size: 12px;
  gap: 8px;
  flex-shrink: 0;
}

.seq-editor-toolbar .seq-editor-path {
  color: var(--text-color, #cccccc);
  flex: 1;
}

.seq-editor-save-status {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 3px;
}

.seq-editor-save-status-saved { color: #98c379; }
.seq-editor-save-status-saving { color: #e5c07b; }
.seq-editor-save-status-unsaved { color: #e5c07b; }
.seq-editor-save-status-error { color: #e06c75; }

.seq-editor-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.seq-editor-code {
  flex: 0 0 45%;
  min-height: 100px;
  overflow: hidden;
  border-bottom: 2px solid var(--border-color, #3e3e42);
}

.seq-editor-resize-handle {
  height: 4px;
  cursor: row-resize;
  background: var(--border-color, #3e3e42);
  flex-shrink: 0;
  transition: background 0.15s;
}

.seq-editor-resize-handle:hover {
  background: var(--accent-color, #61afef);
}

.seq-editor-preview {
  flex: 1;
  min-height: 100px;
  overflow: auto;
  display: flex;
  justify-content: center;
  padding: 16px;
  background: #1e1e2e;
}

.seq-editor-preview svg {
  max-width: 100%;
}
```

- [ ] **Step 2: Create SequenceEditor.tsx**

Write `src/renderer/src/components/editors/SequenceEditor.tsx`:

```typescript
import { useState, useCallback, useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
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

  // Cleanup timer on unmount
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
          <SequenceDiagramViewer content={value} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit --project tsconfig.web.json 2>&1 | head -30
```

Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/editors/SequenceEditor.tsx src/renderer/src/components/editors/SequenceEditor.css
git commit -m "feat: add SequenceEditor with Monaco + Mermaid split view"
```

---

### Task 6: Wire SequenceEditor into NoteViewport

**Files:**
- Modify: `src/renderer/src/components/NoteViewport.tsx`

- [ ] **Step 1: Import SequenceEditor**

In `src/renderer/src/components/NoteViewport.tsx`, add the import after the DerivationEditor import (line 8):

```typescript
import { SequenceEditor } from './editors/SequenceEditor'
```

- [ ] **Step 2: Add case 'seq' in renderEditor**

In the `renderEditor` function, add after the `case 'derive'` block (before `default`):

```typescript
case 'seq':
  return (
    <SequenceEditor
      content={activeNoteContent as string}
      notePath={selectedNoteId}
      onSave={async (content: string) => {
        await saveNote(selectedNoteId, content)
      }}
    />
  )
```

- [ ] **Step 3: Add seq to typeLabels**

In the `typeLabels` object (line 173), add after `derive: 'Derive'`:

```typescript
seq: 'Seq'
```

The full object becomes:
```typescript
const typeLabels: Record<string, string> = {
  md: 'MD',
  mind: 'Mind',
  derive: 'Derive',
  seq: 'Seq'
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit --project tsconfig.web.json 2>&1 | head -30
```

Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/NoteViewport.tsx
git commit -m "feat: wire SequenceEditor into NoteViewport"
```

---

### Task 7: Add MD embed support for .seq.mermaid

**Files:**
- Modify: `src/renderer/src/components/editors/MdEditor.tsx`

- [ ] **Step 1: Import SequenceDiagramViewer**

In `src/renderer/src/components/editors/MdEditor.tsx`, add the import after the MindMapRenderer import (line 9):

```typescript
import { SequenceDiagramViewer } from './SequenceDiagramViewer'
```

- [ ] **Step 2: Update inferEmbedType**

Change the `inferEmbedType` function (lines 340-344) to include `.seq.mermaid`:

```typescript
function inferEmbedType(path: string): 'derive' | 'mind' | 'seq' | null {
  if (path.endsWith('.derive.json')) return 'derive'
  if (path.endsWith('.mind.json')) return 'mind'
  if (path.endsWith('.seq.mermaid')) return 'seq'
  return null
}
```

- [ ] **Step 3: Update the onEmbedClick type annotation**

Change the `onEmbedClick` prop type in the `MdEditorProps` interface (line 19) from:

```typescript
onEmbedClick?: (notePath: string, noteType: 'derive' | 'mind') => void
```

to:

```typescript
onEmbedClick?: (notePath: string, noteType: 'derive' | 'mind' | 'seq') => void
```

- [ ] **Step 4: Add seq embed rendering case**

In the `useEffect` for note embed hydration (lines 86-145), add the `'seq'` case after the `'mind'` case's closing brace (after line 136, before the `}).catch`):

```typescript
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
        <SequenceDiagramViewer content={content as string} />
      </div>
    </div>
  )
```

Make sure to insert this *before* the existing `}` that closes the if/else chain. The full final structure of that inner part is:

```typescript
if (noteType === 'derive') {
  // ... existing derive rendering ...
} else if (noteType === 'mind') {
  // ... existing mind rendering ...
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
        <SequenceDiagramViewer content={content as string} />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit --project tsconfig.web.json 2>&1 | head -30
```

Expected: No new errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/editors/MdEditor.tsx
git commit -m "feat: add .seq.mermaid embed support in MD editor"
```

---

### Task 8: Add seq to EmbedCard type labels

**Files:**
- Modify: `src/renderer/src/components/editors/EmbedCard.tsx`

- [ ] **Step 1: Add seq label**

In `src/renderer/src/components/editors/EmbedCard.tsx`, change the `typeLabels` object (lines 8-12) from:

```typescript
const typeLabels: Record<NoteType, string> = {
  mind: 'Mind Map',
  md: 'Markdown',
  derive: 'Derivation'
}
```

to:

```typescript
const typeLabels: Record<NoteType, string> = {
  mind: 'Mind Map',
  md: 'Markdown',
  derive: 'Derivation',
  seq: 'Sequence Diagram'
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/editors/EmbedCard.tsx
git commit -m "feat: add seq label to EmbedCard"
```

---

### Task 9: Add seq to NoteDirectory (icon, filter, type option)

**Files:**
- Modify: `src/renderer/src/components/NoteDirectory.tsx`

- [ ] **Step 1: Add seq icon**

In the `TreeItem` component, add to the `icons` object (lines 62-67) after `derive: '∑'`:

```typescript
seq: '⚡'
```

- [ ] **Step 2: Add seq filter**

Add to the `filters` array (lines 130-135) after `{ label: 'Derive', value: 'derive' }`:

```typescript
{ label: 'Seq', value: 'seq' }
```

- [ ] **Step 3: Add seq type option**

In the `typeOptions` array (lines 171-175), add after the `.derive.json` entry:

```typescript
{ label: '.seq.mermaid', value: 'seq', suffix: '.seq.mermaid' }
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit --project tsconfig.web.json 2>&1 | head -30
```

Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/NoteDirectory.tsx
git commit -m "feat: add seq icon, filter, and type option to NoteDirectory"
```

---

### Task 10: End-to-end verification

- [ ] **Step 1: Build check**

```bash
npm run build 2>&1 | tail -20
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Launch dev server and smoke test**

```bash
npm run dev &
```

Then verify:
- Open the app at the dev URL
- Create a new `.seq.mermaid` file via the "+ New Note" button
- Type Mermaid syntax in the Monaco editor
- Confirm the SVG preview renders in the bottom panel
- Create a `.md` file, add `![[path/to/file.seq.mermaid]]` on its own line
- Switch to Preview mode and confirm the diagram renders inline
- Confirm the "Seq" filter works in the Notes panel

- [ ] **Step 3: Commit any cleanups if needed**

```bash
git status
```
