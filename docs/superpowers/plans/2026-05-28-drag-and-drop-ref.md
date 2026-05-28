# Drag-and-Drop @ref Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add drag-and-drop from Code Viewport and Code Directory into Note Viewport to insert `@ref()` references, markdown file links, and image embeds.

**Architecture:** Lightweight HTML5 Drag and Drop — no new React context or state management. CodeViewport gains Monaco double-click detection + decoration highlighting. CodeDirectory gains `draggable` on file items. NoteViewport gains `onDrop` → `insertAtPosition`. A new IPC handler copies dragged images into the workspace assets directory.

**Tech Stack:** Electron IPC, Monaco Editor API, HTML5 Drag and Drop, React hooks

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/main/ipc-handlers.ts` | Modify | New `code:copy-file-to-assets` handler |
| `src/preload/index.ts` | Modify | Expose `copyFileToAssets` to renderer |
| `src/renderer/src/components/editors/MdEditor.tsx` | Modify | Add `insertAtPosition` to handle interface |
| `src/renderer/src/components/NoteViewport.tsx` | Modify | Add drop event handlers for drag-and-drop |
| `src/renderer/src/components/NoteViewport.css` | Modify | Add `.note-viewport-drag-over` style |
| `src/renderer/src/components/CodeDirectory.tsx` | Modify | Add `draggable` + `onDragStart` to file items |
| `src/renderer/src/components/CodeViewport.tsx` | Modify | Double-click selection, Monaco decoration, drag source |
| `src/renderer/src/components/CodeViewport.css` | Modify | Add `.ref-drag-highlight` style |
| `tests/main/file-system.test.ts` | Modify | Add copy-file-to-assets test |

---

### Task 1: IPC Handler — Copy File to Assets

**Files:**
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add `copyFileToAssets` function to file-system.ts**

First, add the function to `src/main/services/file-system.ts`:

```typescript
export async function copyFileToAssets(
  sourcePath: string,
  workspacePath: string
): Promise<{ relativePath: string }> {
  const destDir = path.join(workspacePath, 'assets')
  await ensureDir(destDir)

  const originalName = path.basename(sourcePath)
  let destName = originalName
  let destPath = path.join(destDir, destName)

  // Deduplicate: icon.png → icon-1.png if exists
  let counter = 1
  while (await fileExists(destPath)) {
    const ext = path.extname(originalName)
    const base = path.basename(originalName, ext)
    destName = `${base}-${counter}${ext}`
    destPath = path.join(destDir, destName)
    counter++
  }

  await fs.copyFile(sourcePath, destPath)
  return { relativePath: `./assets/${destName}` }
}
```

- [ ] **Step 2: Register IPC handler in ipc-handlers.ts**

Add inside `registerIpcHandlers`, after the `code:resolve-refs` handler:

```typescript
ipcMain.handle('code:copy-file-to-assets', async (_event, sourcePath: string, workspacePath: string) => {
  const { copyFileToAssets } = await import('./services/file-system')
  return copyFileToAssets(sourcePath, workspacePath)
})
```

- [ ] **Step 3: Expose to renderer in preload/index.ts**

Add to the `api` object, after `querySymbols`:

```typescript
copyFileToAssets: (sourcePath: string) =>
  ipcRenderer.invoke('code:copy-file-to-assets', sourcePath),
```

Note: `workspacePath` is resolved inside the handler via `currentProjectPath`, so the renderer only passes `sourcePath`. Update the handler in Step 2 accordingly:

```typescript
ipcMain.handle('code:copy-file-to-assets', async (_event, sourcePath: string) => {
  const { copyFileToAssets } = await import('./services/file-system')
  return copyFileToAssets(sourcePath, currentProjectPath!)
})
```

- [ ] **Step 4: Build and verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/main/services/file-system.ts src/main/ipc-handlers.ts src/preload/index.ts
git commit -m "feat: add copy-file-to-assets IPC for drag-and-drop image support"
```

---

### Task 2: MdEditor — insertAtPosition Method

**Files:**
- Modify: `src/renderer/src/components/editors/MdEditor.tsx`

- [ ] **Step 1: Extend MdEditorHandle interface**

Change the `MdEditorHandle` interface (line 16-18):

```typescript
export interface MdEditorHandle {
  insertAtCursor: (text: string) => void
  insertAtPosition: (text: string, clientX: number, clientY: number) => void
}
```

- [ ] **Step 2: Add insertAtPosition to useImperativeHandle**

Add after the `insertAtCursor` implementation in `useImperativeHandle` (replace lines 27-31):

```typescript
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
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/editors/MdEditor.tsx
git commit -m "feat: add insertAtPosition to MdEditor for drag-and-drop support"
```

---

### Task 3: NoteViewport — Drop Handlers

**Files:**
- Modify: `src/renderer/src/components/NoteViewport.tsx`
- Modify: `src/renderer/src/components/NoteViewport.css`

- [ ] **Step 1: Add drag state and handlers to NoteViewport**

In `NoteViewport.tsx`, add after the existing `codeMappings` state (line 22):

```typescript
const [dragOver, setDragOver] = useState(false)
```

Add the drag event handlers before the `if (!selectedNoteId)` guard. Place them as functions inside the component:

```typescript
const handleDragOver = useCallback((e: React.DragEvent) => {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'copy'
  setDragOver(true)
}, [])

const handleDragLeave = useCallback((e: React.DragEvent) => {
  // Only set false when leaving the container, not when entering a child
  if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
    setDragOver(false)
  }
}, [])

const handleDrop = useCallback(async (e: React.DragEvent) => {
  e.preventDefault()
  setDragOver(false)

  const isImage = e.dataTransfer.getData('application/x-image-drag') === 'true'
  const plainText = e.dataTransfer.getData('text/plain')

  if (!plainText) return

  if (isImage) {
    const sourcePath = e.dataTransfer.getData('application/x-source-path')
    if (sourcePath && mdEditorRef.current) {
      const fileName = sourcePath.split('/').pop() || sourcePath.split('\\').pop() || 'image'
      try {
        const result = await window.electronAPI.copyFileToAssets(sourcePath)
        mdEditorRef.current.insertAtPosition(`![${fileName}](${result.relativePath})`, e.clientX, e.clientY)
      } catch {
        // Fallback: insert with absolute path
        mdEditorRef.current.insertAtPosition(`![${fileName}](${sourcePath})`, e.clientX, e.clientY)
      }
    }
  } else {
    if (mdEditorRef.current) {
      mdEditorRef.current.insertAtPosition(plainText, e.clientX, e.clientY)
    }
  }
}, [])
```

- [ ] **Step 2: Wire handlers to the note-viewport container div**

Change the `note-viewport` div in the return JSX (line 128). Replace:

```tsx
<div className="note-viewport">
```

With:

```tsx
<div
  className={`note-viewport${dragOver ? ' note-viewport-drag-over' : ''}`}
  onDragOver={handleDragOver}
  onDragLeave={handleDragLeave}
  onDrop={handleDrop}
>
```

- [ ] **Step 3: Add CSS for drag-over state**

Append to `NoteViewport.css`:

```css
.note-viewport-drag-over {
  background: rgba(100, 180, 255, 0.05);
  outline: 2px dashed var(--accent-color);
  outline-offset: -2px;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/NoteViewport.tsx src/renderer/src/components/NoteViewport.css
git commit -m "feat: add drop handlers to NoteViewport for drag-and-drop @ref"
```

---

### Task 4: CodeDirectory — Draggable File Items

**Files:**
- Modify: `src/renderer/src/components/CodeDirectory.tsx`

- [ ] **Step 1: Add drag handler and modify FileTreeItem**

Add an `onDragStart` handler to `FileTreeItem`. Change the `FileTreeItem` function to include drag support on the clickable div.

Replace the inner div in `FileTreeItem` (lines 36-43):

```tsx
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'])

function isImageFileName(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return IMAGE_EXTS.has(ext)
}

const handleDragStart = useCallback((e: React.DragEvent) => {
  if (file.isDirectory) return
  const isImage = isImageFileName(file.name)
  e.dataTransfer.effectAllowed = 'copy'
  if (isImage) {
    e.dataTransfer.setData('application/x-image-drag', 'true')
    e.dataTransfer.setData('application/x-source-path', file.absolutePath)
  }
  e.dataTransfer.setData('text/plain', `[${file.name}](${file.relativePath})`)
}, [file])
```

Then add `draggable` and `onDragStart` to the clickable div (line 36-43 area):

```tsx
<div
  className={`code-file-item ${file.isDirectory ? 'folder' : ''}`}
  style={{ '--depth': depth } as React.CSSProperties}
  onClick={handleClick}
  draggable={!file.isDirectory}
  onDragStart={handleDragStart}
>
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/CodeDirectory.tsx
git commit -m "feat: make CodeDirectory file items draggable for @ref insertion"
```

---

### Task 5: CodeViewport — Double-Click Selection + Drag

**Files:**
- Modify: `src/renderer/src/components/CodeViewport.tsx`
- Modify: `src/renderer/src/components/CodeViewport.css`

This is the most complex task. The CodeViewport's read-only Monaco editor needs double-click detection, symbol querying, decoration highlighting, and drag support.

- [ ] **Step 1: Add refs and state for selection/drag**

Add after the existing `editorRef` declaration (line 38):

```typescript
const selectedSymbolRef = useRef<CodeSymbol | null>(null)
const decorationIdsRef = useRef<string[]>([])
const [dragEnabled, setDragEnabled] = useState(false)
```

- [ ] **Step 2: Add helpers to query symbol at position and manage decorations**

Add these helper functions inside the component, before `handleSymbolSelect`:

```typescript
const clearSelection = useCallback(() => {
  const editor = editorRef.current
  if (!editor) return
  const ids = decorationIdsRef.current
  if (ids.length > 0) {
    editor.deltaDecorations(ids, [])
  }
  decorationIdsRef.current = []
  selectedSymbolRef.current = null
  setDragEnabled(false)
}, [])

const selectSymbolAtPosition = useCallback(async (
  editor: monaco.editor.IStandaloneCodeEditor,
  position: monaco.Position
) => {
  const model = editor.getModel()
  if (!model || !activeFile) return

  const word = model.getWordAtPosition(position)
  if (!word) return

  try {
    const symbols: CodeSymbol[] = await window.electronAPI.querySymbols(
      word.word,
      activeFile.path,
      undefined
    )
    // Find symbol in current file matching the clicked word
    const match = symbols.find(s =>
      s.name === word.word && s.filePath === activeFile.path
    )
    if (!match) return

    clearSelection()

    // Apply Monaco decoration to highlight the symbol name
    const range = new (window as any).monaco.Range(
      position.lineNumber,
      word.startColumn,
      position.lineNumber,
      word.endColumn
    )
    const ids = editor.deltaDecorations([], [{
      range,
      options: {
        inlineClassName: 'ref-drag-highlight',
        description: 'ref-drag-highlight'
      }
    }])
    decorationIdsRef.current = ids
    selectedSymbolRef.current = match
    setDragEnabled(true)
  } catch {
    // Symbol query failed — silently ignore
  }
}, [activeFile, clearSelection])
```

Note: `monaco.Range` needs to be accessed. Since Monaco is loaded via `@monaco-editor/react`, import `monaco` types at the top. Add this import if not already present:

```typescript
import type * as monaco from 'monaco-editor'
```

(This import already exists at line 6.)

Then replace the `monaco.Range` construction. Instead of `(window as any).monaco.Range`, we need to import Range from the monaco namespace. Add after existing imports:

The `monaco.Range` constructor can be used via the monaco namespace already imported. Change the range construction to:

```typescript
// Use the monaco instance from the editor
const monacoInstance = (editor as any)._typings?.monaco
// Fallback: construct a simple range object
const range = {
  startLineNumber: position.lineNumber,
  startColumn: word.startColumn,
  endLineNumber: position.lineNumber,
  endColumn: word.endColumn
}
```

Actually, Monaco decorations accept plain range objects. Let's keep it simple:

```typescript
const ids = editor.deltaDecorations([], [{
  range: {
    startLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endLineNumber: position.lineNumber,
    endColumn: word.endColumn
  },
  options: {
    inlineClassName: 'ref-drag-highlight',
    description: 'ref-drag-highlight'
  }
}])
```

- [ ] **Step 3: Wire double-click detection in handleEditorMount**

Modify `handleEditorMount` (lines 94-100) to also set up the mouse listener. Replace with:

```typescript
const handleEditorMount = useCallback((editor: monaco.editor.IStandaloneCodeEditor) => {
  editorRef.current = editor

  // Scroll to pending line if applicable
  if (state.pendingScroll && activeFile && activeFile.path === state.pendingScroll.filePath) {
    editor.revealLineInCenter(state.pendingScroll.line)
    dispatch({ type: 'CLEAR_PENDING_SCROLL' })
  }

  // Double-click to select symbol for drag
  editor.onMouseDown(async (e) => {
    // Check for double-click (detail === 2)
    if (e.event.detail !== 2) {
      // Single click elsewhere clears selection
      if (selectedSymbolRef.current) {
        clearSelection()
      }
      return
    }
    if (!e.target.position) return
    await selectSymbolAtPosition(editor, e.target.position)
  })
}, [state.pendingScroll, activeFile, dispatch, clearSelection, selectSymbolAtPosition])
```

- [ ] **Step 4: Add drag support to the editor container**

Add an `onDragStart` handler for the code-editor-container div. Change line 194:

Replace the plain `<div className="code-editor-container">` with:

```tsx
<div
  className="code-editor-container"
  draggable={dragEnabled}
  onDragStart={(e) => {
    const sym = selectedSymbolRef.current
    if (!sym || !activeFile) {
      e.preventDefault()
      return
    }
    let relPath = sym.filePath
    if (codeRepoPath) {
      const prefix = codeRepoPath.endsWith('/') ? codeRepoPath : codeRepoPath + '/'
      if (sym.filePath.startsWith(prefix)) {
        relPath = sym.filePath.slice(prefix.length)
      }
    }
    const displayName = sym.parentName ? `${sym.parentName}.${sym.name}` : sym.name
    const refText = `@ref(${relPath}:${sym.startLine}:${displayName})`
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('text/plain', refText)
  }}
  onDragEnd={() => {
    // Keep selection after drag — user may want to drag again
  }}
>
```

Wait — the `dragEnabled` state may cause React to re-render and clear the decoration. Let's keep the `draggable` attribute but avoid re-rendering the editor. Instead, we'll use a ref for `dragEnabled` and set the attribute imperatively.

Let me revise. Instead of `dragEnabled` state, we use a ref and an effect to set the attribute on the DOM element:

Remove the `dragEnabled` state (from Step 1) and use:

```typescript
const dragEnabledRef = useRef(false)
const editorContainerRef = useRef<HTMLDivElement>(null)
```

Update `clearSelection`:
```typescript
const clearSelection = useCallback(() => {
  const editor = editorRef.current
  if (!editor) return
  const ids = decorationIdsRef.current
  if (ids.length > 0) {
    editor.deltaDecorations(ids, [])
  }
  decorationIdsRef.current = []
  selectedSymbolRef.current = null
  dragEnabledRef.current = false
  if (editorContainerRef.current) {
    editorContainerRef.current.removeAttribute('draggable')
  }
}, [])
```

Update `selectSymbolAtPosition` (after finding match):
```typescript
selectedSymbolRef.current = match
dragEnabledRef.current = true
if (editorContainerRef.current) {
  editorContainerRef.current.setAttribute('draggable', 'true')
}
```

And the container div:
```tsx
<div
  className="code-editor-container"
  ref={editorContainerRef}
  onDragStart={...}
  onDragEnd={...}
>
```

This avoids React re-renders from toggling `draggable`.

- [ ] **Step 5: Add CSS for the highlight decoration**

Append to `CodeViewport.css`:

```css
.ref-drag-highlight {
  background: rgba(100, 180, 255, 0.3);
  border-radius: 2px;
  cursor: grab;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/CodeViewport.tsx src/renderer/src/components/CodeViewport.css
git commit -m "feat: add double-click symbol selection and drag in CodeViewport"
```

---

### Task 6: IPC Unit Test

**Files:**
- Modify: `tests/main/file-system.test.ts`

- [ ] **Step 1: Add tests for copyFileToAssets**

Append to the `file-system` describe block in `tests/main/file-system.test.ts`:

```typescript
import { copyFileToAssets } from '../../src/main/services/file-system'

describe('copyFileToAssets', () => {
  it('copies a file to the assets directory', async () => {
    const sourcePath = join(testDir, 'img.png')
    await writeTextFile(sourcePath, 'fake-image-data')
    const result = await copyFileToAssets(sourcePath, testDir)
    expect(result.relativePath).toBe('./assets/img.png')
    const copiedExists = await fileExists(join(testDir, 'assets', 'img.png'))
    expect(copiedExists).toBe(true)
  })

  it('deduplicates when filename already exists', async () => {
    const sourcePath = join(testDir, 'icon.png')
    await writeTextFile(sourcePath, 'data')
    // Create a file at the destination first
    await ensureDir(join(testDir, 'assets'))
    await writeTextFile(join(testDir, 'assets', 'icon.png'), 'existing')
    const result = await copyFileToAssets(sourcePath, testDir)
    expect(result.relativePath).toBe('./assets/icon-1.png')
  })
})
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/main/file-system.test.ts`
Expected: All tests pass (existing + 2 new)

- [ ] **Step 3: Commit**

```bash
git add tests/main/file-system.test.ts
git commit -m "test: add copyFileToAssets unit tests"
```

---

### Task 7: Build and Manual Verification

**Files:** None (verification only)

- [ ] **Step 1: Build the app**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Manual test checklist**

Run the app and verify:

1. Open a workspace with an indexed code repo
2. Open a code file in Code Viewport
3. Double-click a function name → blue highlight appears
4. Double-click a keyword (`function`, `return`, `class`) → no highlight
5. Click elsewhere in the editor → highlight clears
6. Double-click a function, drag from the highlighted area to Note Viewport → `@ref(rel/path:line:name)` inserted at drop position
7. Drag a `.ts` file from Code Directory to Note Viewport → `[filename](relative/path)` inserted
8. Drag a `.png` file from Code Directory to Note Viewport → image copied to assets, `![filename](./assets/filename)` inserted
9. Press Ctrl+Z in Note Viewport after a drop → inserted text is undone
10. Drag without prior double-click from Code Viewport → drag does nothing (draggable=false)

- [ ] **Step 3: Fix any issues found**

Address any bugs discovered during manual testing.

- [ ] **Step 4: Final commit (if changes were made)**

```bash
git add -A
git commit -m "chore: final adjustments for drag-and-drop @ref feature"
```
