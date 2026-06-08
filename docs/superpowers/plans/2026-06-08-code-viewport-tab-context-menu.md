# Code Viewport Tab Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a right-click context menu to code viewport tabs with close operations, reopen closed file, copy path, reveal in file tree, and open in external editor.

**Architecture:** Follows the existing `NodeContextMenu` + `appReducer` pattern already used in `CodeDirectory.tsx`. New reducer actions handle multi-tab close operations and cross-component reveal signaling. No new components or backend changes — only state management and UI wiring.

**Tech Stack:** React, TypeScript, Electron (shell.openPath), vitest + @testing-library/react

---

### Task 1: Add new types and AppAction variants

**Files:**
- Modify: `src/renderer/src/types/index.ts`

- [ ] **Step 1: Add `recentlyClosedFile` and `revealFilePath` to `AppState`**

Add these two fields after the existing fields in the `AppState` interface (after `codeRepos`):

```ts
recentlyClosedFile: CodeFile | null
revealFilePath: string | null
```

- [ ] **Step 2: Add 7 new `AppAction` variants**

Add these to the `AppAction` union type (after `CLEAR_PENDING_SCROLL`):

```ts
| { type: 'CLOSE_OTHER_CODE_FILES'; index: number }
| { type: 'CLOSE_CODE_FILES_LEFT'; index: number }
| { type: 'CLOSE_CODE_FILES_RIGHT'; index: number }
| { type: 'CLOSE_ALL_CODE_FILES' }
| { type: 'REOPEN_CLOSED_CODE_FILE' }
| { type: 'REVEAL_FILE_IN_TREE'; filePath: string }
| { type: 'CLEAR_REVEAL_FILE_IN_TREE' }
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/types/index.ts
git commit -m "feat: add tab context menu action types and state fields"
```

---

### Task 2: Add new reducer cases in AppContext

**Files:**
- Modify: `src/renderer/src/contexts/AppContext.tsx`

- [ ] **Step 1: Add new fields to `initialState`**

Add after `workspaceHistory: []`:

```ts
recentlyClosedFile: null,
revealFilePath: null,
```

- [ ] **Step 2: Modify `CLOSE_CODE_FILE` case to store closed file**

Replace the existing `CLOSE_CODE_FILE` reducer case (lines 52-59) with:

```ts
case 'CLOSE_CODE_FILE': {
  const closedFile = state.openCodeFiles[action.index]
  const updated = state.openCodeFiles.filter((_, i) => i !== action.index)
  const newIndex = Math.min(state.activeCodeFileIndex, updated.length - 1)
  return {
    ...state,
    openCodeFiles: updated,
    activeCodeFileIndex: updated.length === 0 ? -1 : newIndex,
    recentlyClosedFile: closedFile || null
  }
}
```

- [ ] **Step 3: Add `CLOSE_OTHER_CODE_FILES` case**

Add after the `CLOSE_CODE_FILE` case:

```ts
case 'CLOSE_OTHER_CODE_FILES': {
  return {
    ...state,
    openCodeFiles: [state.openCodeFiles[action.index]],
    activeCodeFileIndex: 0,
    recentlyClosedFile: null
  }
}
```

- [ ] **Step 4: Add `CLOSE_CODE_FILES_LEFT` case**

```ts
case 'CLOSE_CODE_FILES_LEFT': {
  return {
    ...state,
    openCodeFiles: state.openCodeFiles.slice(action.index),
    activeCodeFileIndex: 0,
    recentlyClosedFile: null
  }
}
```

- [ ] **Step 5: Add `CLOSE_CODE_FILES_RIGHT` case**

```ts
case 'CLOSE_CODE_FILES_RIGHT': {
  const updated = state.openCodeFiles.slice(0, action.index + 1)
  return {
    ...state,
    openCodeFiles: updated,
    activeCodeFileIndex: Math.min(state.activeCodeFileIndex, updated.length - 1),
    recentlyClosedFile: null
  }
}
```

- [ ] **Step 6: Add `CLOSE_ALL_CODE_FILES` case**

```ts
case 'CLOSE_ALL_CODE_FILES': {
  const activeFile = state.activeCodeFileIndex >= 0
    ? state.openCodeFiles[state.activeCodeFileIndex]
    : null
  return {
    ...state,
    openCodeFiles: [],
    activeCodeFileIndex: -1,
    recentlyClosedFile: activeFile
  }
}
```

- [ ] **Step 7: Add `REOPEN_CLOSED_CODE_FILE` case**

```ts
case 'REOPEN_CLOSED_CODE_FILE': {
  if (!state.recentlyClosedFile) return state
  return {
    ...state,
    openCodeFiles: [...state.openCodeFiles, state.recentlyClosedFile],
    activeCodeFileIndex: state.openCodeFiles.length,
    recentlyClosedFile: null
  }
}
```

- [ ] **Step 8: Add `REVEAL_FILE_IN_TREE` and `CLEAR_REVEAL_FILE_IN_TREE` cases**

```ts
case 'REVEAL_FILE_IN_TREE':
  return { ...state, revealFilePath: action.filePath }

case 'CLEAR_REVEAL_FILE_IN_TREE':
  return { ...state, revealFilePath: null }
```

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/contexts/AppContext.tsx
git commit -m "feat: add tab context menu reducer cases"
```

---

### Task 3: Add reducer tests

**Files:**
- Modify: `tests/renderer/AppContext.test.tsx`

- [ ] **Step 1: Add imports for `CodeFile` type**

Add to the import from `../../src/renderer/src/types`:

```ts
import type { CodeFile } from '../../src/renderer/src/types'
```

(Add `CodeFile` to the existing type-only import if not already there.)

- [ ] **Step 2: Add a helper `makeFile` at the top of the `describe` block**

```ts
function makeFile(path: string): CodeFile {
  return { path, name: path.split('/').pop() || path, language: 'typescript' }
}
```

- [ ] **Step 3: Add test for `CLOSE_CODE_FILE` stores `recentlyClosedFile`**

```ts
it('CLOSE_CODE_FILE stores closed file in recentlyClosedFile', () => {
  const file = makeFile('/a.ts')
  let state = appReducer(initialState, { type: 'OPEN_CODE_FILE', file })
  state = appReducer(state, { type: 'CLOSE_CODE_FILE', index: 0 })
  expect(state.openCodeFiles).toHaveLength(0)
  expect(state.recentlyClosedFile).toEqual(file)
})
```

- [ ] **Step 4: Add test for `CLOSE_OTHER_CODE_FILES`**

```ts
it('CLOSE_OTHER_CODE_FILES keeps only the clicked tab', () => {
  let state = initialState
  for (const f of [makeFile('/a.ts'), makeFile('/b.ts'), makeFile('/c.ts')]) {
    state = appReducer(state, { type: 'OPEN_CODE_FILE', file: f })
  }
  state = appReducer(state, { type: 'CLOSE_OTHER_CODE_FILES', index: 1 })
  expect(state.openCodeFiles).toHaveLength(1)
  expect(state.openCodeFiles[0].path).toBe('/b.ts')
  expect(state.activeCodeFileIndex).toBe(0)
  expect(state.recentlyClosedFile).toBeNull()
})
```

- [ ] **Step 5: Add test for `CLOSE_CODE_FILES_LEFT`**

```ts
it('CLOSE_CODE_FILES_LEFT removes tabs before index', () => {
  let state = initialState
  for (const f of [makeFile('/a.ts'), makeFile('/b.ts'), makeFile('/c.ts')]) {
    state = appReducer(state, { type: 'OPEN_CODE_FILE', file: f })
  }
  state = appReducer(state, { type: 'CLOSE_CODE_FILES_LEFT', index: 1 })
  expect(state.openCodeFiles).toHaveLength(2)
  expect(state.openCodeFiles[0].path).toBe('/b.ts')
  expect(state.openCodeFiles[1].path).toBe('/c.ts')
  expect(state.activeCodeFileIndex).toBe(0)
})
```

- [ ] **Step 6: Add test for `CLOSE_CODE_FILES_RIGHT`**

```ts
it('CLOSE_CODE_FILES_RIGHT removes tabs after index', () => {
  let state = initialState
  for (const f of [makeFile('/a.ts'), makeFile('/b.ts'), makeFile('/c.ts')]) {
    state = appReducer(state, { type: 'OPEN_CODE_FILE', file: f })
  }
  state = appReducer(state, { type: 'CLOSE_CODE_FILES_RIGHT', index: 1 })
  expect(state.openCodeFiles).toHaveLength(2)
  expect(state.openCodeFiles[0].path).toBe('/a.ts')
  expect(state.openCodeFiles[1].path).toBe('/b.ts')
})
```

- [ ] **Step 7: Add test for `CLOSE_ALL_CODE_FILES`**

```ts
it('CLOSE_ALL_CODE_FILES clears all tabs and stores active file', () => {
  let state = initialState
  for (const f of [makeFile('/a.ts'), makeFile('/b.ts')]) {
    state = appReducer(state, { type: 'OPEN_CODE_FILE', file: f })
  }
  state = appReducer(state, { type: 'SET_ACTIVE_CODE_FILE', index: 0 })
  state = appReducer(state, { type: 'CLOSE_ALL_CODE_FILES' })
  expect(state.openCodeFiles).toHaveLength(0)
  expect(state.activeCodeFileIndex).toBe(-1)
  expect(state.recentlyClosedFile?.path).toBe('/a.ts')
})
```

- [ ] **Step 8: Add test for `REOPEN_CLOSED_CODE_FILE`**

```ts
it('REOPEN_CLOSED_CODE_FILE restores the last closed file', () => {
  const file = makeFile('/a.ts')
  let state = appReducer(initialState, { type: 'OPEN_CODE_FILE', file })
  state = appReducer(state, { type: 'CLOSE_CODE_FILE', index: 0 })
  state = appReducer(state, { type: 'REOPEN_CLOSED_CODE_FILE' })
  expect(state.openCodeFiles).toHaveLength(1)
  expect(state.openCodeFiles[0]).toEqual(file)
  expect(state.activeCodeFileIndex).toBe(0)
  expect(state.recentlyClosedFile).toBeNull()
})
```

- [ ] **Step 9: Add test for `REOPEN_CLOSED_CODE_FILE` no-op when null**

```ts
it('REOPEN_CLOSED_CODE_FILE is no-op when recentlyClosedFile is null', () => {
  const state = appReducer(initialState, { type: 'REOPEN_CLOSED_CODE_FILE' })
  expect(state).toEqual(initialState)
})
```

- [ ] **Step 10: Add tests for reveal actions**

```ts
it('REVEAL_FILE_IN_TREE sets revealFilePath', () => {
  const state = appReducer(initialState, { type: 'REVEAL_FILE_IN_TREE', filePath: '/x/y.ts' })
  expect(state.revealFilePath).toBe('/x/y.ts')
})

it('CLEAR_REVEAL_FILE_IN_TREE clears revealFilePath', () => {
  let state = appReducer(initialState, { type: 'REVEAL_FILE_IN_TREE', filePath: '/x/y.ts' })
  state = appReducer(state, { type: 'CLEAR_REVEAL_FILE_IN_TREE' })
  expect(state.revealFilePath).toBeNull()
})
```

- [ ] **Step 11: Run tests and verify they pass**

```bash
npx vitest run tests/renderer/AppContext.test.tsx
```

Expected: all new tests pass (note: the existing `CLOSE_CODE_FILE` test at line 42-49 will now also check `recentlyClosedFile` — update it if needed).

- [ ] **Step 12: Commit**

```bash
git add tests/renderer/AppContext.test.tsx
git commit -m "test: add reducer tests for tab context menu actions"
```

---

### Task 4: Add context menu to CodeViewport tabs

**Files:**
- Modify: `src/renderer/src/components/CodeViewport.tsx`
- Modify: `src/renderer/src/components/CodeViewport.css`

- [ ] **Step 1: Import `NodeContextMenu` and `MenuEntry`**

Add to the imports at the top of `CodeViewport.tsx`:

```tsx
import { NodeContextMenu } from './editors/NodeContextMenu'
import type { MenuEntry } from './editors/NodeContextMenu'
```

- [ ] **Step 2: Add `tabContextMenu` state**

Add after the existing `useState` declarations (after `const [zoomLevel, setZoomLevel] = useState(1)`):

```tsx
const [tabContextMenu, setTabContextMenu] = useState<{
  x: number
  y: number
  tabIndex: number
} | null>(null)
```

- [ ] **Step 3: Add `buildTabContextMenu` callback**

Add after the `handleSelectTab` callback (around line 231):

```tsx
const buildTabContextMenu = useCallback((tabIndex: number): MenuEntry[] => {
  const file = state.openCodeFiles[tabIndex]
  if (!file) return []
  const isLeftmost = tabIndex === 0
  const isRightmost = tabIndex === state.openCodeFiles.length - 1
  const onlyOne = state.openCodeFiles.length <= 1

  return [
    {
      label: 'Close',
      action: () => dispatch({ type: 'CLOSE_CODE_FILE', index: tabIndex })
    },
    {
      label: 'Close Others',
      action: () => dispatch({ type: 'CLOSE_OTHER_CODE_FILES', index: tabIndex }),
      disabled: onlyOne
    },
    {
      label: 'Close to the Right',
      action: () => dispatch({ type: 'CLOSE_CODE_FILES_RIGHT', index: tabIndex }),
      disabled: isRightmost
    },
    {
      label: 'Close to the Left',
      action: () => dispatch({ type: 'CLOSE_CODE_FILES_LEFT', index: tabIndex }),
      disabled: isLeftmost
    },
    {
      label: 'Close All',
      action: () => dispatch({ type: 'CLOSE_ALL_CODE_FILES' }),
      disabled: state.openCodeFiles.length === 0
    },
    { separator: true },
    {
      label: 'Reopen Closed File',
      action: () => dispatch({ type: 'REOPEN_CLOSED_CODE_FILE' }),
      disabled: !state.recentlyClosedFile
    },
    { separator: true },
    {
      label: 'Copy Path',
      action: () => { navigator.clipboard.writeText(file.path) }
    },
    {
      label: 'Reveal in File Tree',
      action: () => dispatch({ type: 'REVEAL_FILE_IN_TREE', filePath: file.path })
    },
    {
      label: 'Open in External Editor',
      action: () => { window.electronAPI.openPath(file.path) }
    }
  ]
}, [state.openCodeFiles, state.recentlyClosedFile, dispatch])
```

- [ ] **Step 4: Add `handleTabContextMenu` callback**

```tsx
const handleTabContextMenu = useCallback((e: React.MouseEvent, index: number) => {
  e.preventDefault()
  e.stopPropagation()
  dispatch({ type: 'SET_ACTIVE_CODE_FILE', index })
  setTabContextMenu({ x: e.clientX, y: e.clientY, tabIndex: index })
}, [dispatch])
```

- [ ] **Step 5: Add `onContextMenu` to each tab div**

In the tab bar JSX, add the handler to the `.code-tab` div (after `onClick`):

```tsx
onContextMenu={(e) => handleTabContextMenu(e, index)}
```

The full tab div should look like:

```tsx
<div
  key={file.path}
  className={`code-tab ${index === activeCodeFileIndex ? 'active' : ''}`}
  style={repoColor && index === activeCodeFileIndex
    ? { borderBottomColor: repoColor }
    : undefined
  }
  onClick={() => handleSelectTab(index)}
  onContextMenu={(e) => handleTabContextMenu(e, index)}
>
```

- [ ] **Step 6: Render `NodeContextMenu` at the component level**

Add right before the closing `</div>` of the outer panel div (before `<SymbolPicker ... />`):

```tsx
{tabContextMenu && (
  <NodeContextMenu
    x={tabContextMenu.x}
    y={tabContextMenu.y}
    items={buildTabContextMenu(tabContextMenu.tabIndex)}
    onClose={() => setTabContextMenu(null)}
  />
)}
```

- [ ] **Step 7: Add cursor hint in CSS**

In `CodeViewport.css`, add to the `.code-tab` rule:

```css
cursor: default;
```

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/CodeViewport.tsx src/renderer/src/components/CodeViewport.css
git commit -m "feat: add right-click context menu to code viewport tabs"
```

---

### Task 5: Add Reveal in File Tree support to CodeDirectory

**Files:**
- Modify: `src/renderer/src/components/CodeDirectory.tsx`

- [ ] **Step 1: Add `data-file-path` attribute to `FileTreeItem`**

In the `FileTreeItem` component's top-level div, add:

```tsx
data-file-path={file.absolutePath}
```

The div opening tag should become:

```tsx
<div
  className={`code-file-item ${file.isDirectory ? 'folder' : ''}`}
  style={{ '--depth': depth } as React.CSSProperties}
  onClick={handleClick}
  draggable={!file.isDirectory}
  onDragStart={handleDragStart}
  onContextMenu={(e) => onContextMenu(e, file)}
  data-file-path={file.absolutePath}
>
```

- [ ] **Step 2: Auto-expand ancestor directories**

Add a `revealTargetPath` prop to `FileTreeItem`:

```tsx
function FileTreeItem({
  file,
  depth,
  onSelect,
  onContextMenu,
  revealTargetPath
}: {
  file: RepoFileNode
  depth: number
  onSelect: (file: RepoFileNode) => void
  onContextMenu: (e: React.MouseEvent, file: RepoFileNode) => void
  revealTargetPath?: string
})
```

Add a `useEffect` inside `FileTreeItem` after the existing `useState`:

```tsx
useEffect(() => {
  if (revealTargetPath && file.isDirectory && revealTargetPath.startsWith(file.absolutePath + '/')) {
    setExpanded(true)
  }
}, [revealTargetPath, file.isDirectory, file.absolutePath])
```

- [ ] **Step 3: Pass `revealTargetPath` through the tree**

Update the recursive `<FileTreeItem>` calls to pass the prop:

```tsx
<FileTreeItem
  key={child.relativePath}
  file={child}
  depth={depth + 1}
  onSelect={onSelect}
  onContextMenu={onContextMenu}
  revealTargetPath={revealTargetPath}
/>
```

And in the top-level render in `CodeDirectory`, pass `state.revealFilePath || undefined`:

```tsx
tree.map((file) => (
  <FileTreeItem
    key={file.relativePath}
    file={file}
    depth={0}
    onSelect={handleFileSelect}
    onContextMenu={handleContextMenu}
    revealTargetPath={state.revealFilePath || undefined}
  />
))
```

- [ ] **Step 4: Add scroll-and-highlight effect**

Add a `useEffect` in the `CodeDirectory` component, after the existing effects:

```tsx
useEffect(() => {
  if (!state.revealFilePath) return
  const filePath = state.revealFilePath
  // Double rAF to wait for tree re-render and paint after directory expansion
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const escaped = filePath.replace(/"/g, '\\"')
      const el = document.querySelector(`[data-file-path="${escaped}"]`)
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        el.classList.add('code-file-item-highlight')
        setTimeout(() => el.classList.remove('code-file-item-highlight'), 2000)
      }
      dispatch({ type: 'CLEAR_REVEAL_FILE_IN_TREE' })
    })
  })
}, [state.revealFilePath, dispatch])
```

- [ ] **Step 5: Add highlight CSS**

In `CodeDirectory.css`, add:

```css
.code-file-item-highlight {
  background: rgba(100, 180, 255, 0.25);
  outline: 1px solid var(--accent-color);
  border-radius: 3px;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/CodeDirectory.tsx src/renderer/src/components/CodeDirectory.css
git commit -m "feat: add reveal-in-file-tree support with auto-expand and scroll"
```

---

### Task 6: Run full test suite

**Files:**
- (verification only)

- [ ] **Step 1: Run all renderer tests**

```bash
npx vitest run tests/renderer/
```

Expected: all tests pass. If any existing test breaks (e.g., the `CLOSE_CODE_FILE` test now expects `recentlyClosedFile`), fix the test inline.

- [ ] **Step 2: Commit any test fixes if needed**

```bash
git add -A
git commit -m "test: update tests for new reducer behavior"
```
