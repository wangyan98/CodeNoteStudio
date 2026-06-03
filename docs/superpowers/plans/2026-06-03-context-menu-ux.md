# Context Menu & Notes UX Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add right-click context menus to Notes and Code file trees, a "New Folder" button to the Notes toolbar, and "Insert Image into MD" for image files in the Code tree.

**Architecture:** Reuse the existing `NodeContextMenu` portal component. Add 3 IPC handlers for folder/file CRUD. Use a custom DOM event `image-insert` (following the existing `symbol-insert` pattern) to communicate from CodeDirectory to NoteViewport for image insertion. Extract context menu CSS to a shared file.

**Tech Stack:** React 18, TypeScript, Electron IPC, Node.js fs

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/renderer/src/components/ContextMenu.css` | **Create** | Shared CSS for `NodeContextMenu` styles, extracted from MindMapRenderer.css |
| `src/renderer/src/services/clipboard.ts` | **Create** | Module-level shared clipboard state for file copy/paste across trees |
| `src/renderer/src/components/editors/MindMapRenderer.css` | Modify | Remove `node-context-menu` CSS rules, import shared file |
| `src/main/services/note-service.ts` | Modify | Add `createFolder`, `copyFileToNotes`, `deleteFolder` functions |
| `src/main/ipc-handlers.ts` | Modify | Register `notes:create-folder`, `notes:copy-file`, `notes:delete-folder` handlers |
| `src/preload/index.ts` | Modify | Expose `createFolder`, `copyFile`, `deleteFolder` via contextBridge |
| `src/renderer/src/types/electron.d.ts` | Modify | Add type declarations for new API methods |
| `src/renderer/src/components/NoteDirectory.tsx` | Modify | Add New Folder button, right-click context menu on tree items |
| `src/renderer/src/components/NoteDirectory.css` | Modify | Add toolbar button row styling |
| `src/renderer/src/components/CodeDirectory.tsx` | Modify | Add right-click context menu on file items |
| `src/renderer/src/components/NoteViewport.tsx` | Modify | Listen for `image-insert` custom event, insert image ref into MdEditor |

---

### Task 1: Extract context menu CSS to shared file

**Background:** The `NodeContextMenu` component is used by `MindMapRenderer` and will now also be used by `NoteDirectory` and `CodeDirectory`. Its styles currently live only in `MindMapRenderer.css`. Extract them to a shared CSS file so all consumers can import it.

**Files:**
- Create: `src/renderer/src/components/ContextMenu.css`
- Modify: `src/renderer/src/components/editors/MindMapRenderer.css`

- [ ] **Step 1: Create shared ContextMenu.css**

Create `src/renderer/src/components/ContextMenu.css`:

```css
.node-context-menu {
  position: fixed;
  background: #2d2d2d;
  border: 1px solid #555;
  border-radius: 6px;
  padding: 4px 0;
  min-width: 180px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  z-index: 10000;
}

.node-context-menu-item {
  padding: 6px 14px;
  color: #ccc;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.node-context-menu-item:hover {
  background: #094771;
}

.node-context-menu-item-danger {
  color: #e44;
}

.node-context-menu-item-danger:hover {
  background: #5a1d1d;
}

.node-context-menu-shortcut {
  color: #666;
  font-size: 11px;
  margin-left: 24px;
}

.node-context-menu-separator {
  height: 1px;
  background: #555;
  margin: 4px 0;
}
```

- [ ] **Step 2: Remove context menu CSS from MindMapRenderer.css and import shared file**

In `src/renderer/src/components/editors/MindMapRenderer.css`, remove lines 25-67 (the `.node-context-menu` through `.node-context-menu-separator` rules). Add at the top:

```css
@import '../ContextMenu.css';
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ContextMenu.css src/renderer/src/components/editors/MindMapRenderer.css
git commit -m "refactor: extract context menu CSS to shared file"
```

---

### Task 2: Shared clipboard module

**Background:** "Copy File" in Code tree must allow "Paste File" in Notes tree. Since these are separate components, clipboard state lives in a module-level variable.

**Files:**
- Create: `src/renderer/src/services/clipboard.ts`

- [ ] **Step 1: Create shared clipboard module**

Create `src/renderer/src/services/clipboard.ts`:

```typescript
let clipboardFile: { sourcePath: string } | null = null

export function getClipboardFile() {
  return clipboardFile
}

export function setClipboardFile(sourcePath: string) {
  clipboardFile = { sourcePath }
}

export function clearClipboardFile() {
  clipboardFile = null
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/services/clipboard.ts
git commit -m "feat: add shared clipboard module for file copy/paste"
```

---

### Task 3: Backend — Add note-service functions

**Files:**
- Modify: `src/main/services/note-service.ts`

- [ ] **Step 1: Add `createFolder`, `copyFileToNotes`, and `deleteFolder` functions**

Add the following three exports to `src/main/services/note-service.ts` (after the existing `noteExists` function, before the closing of the file):

```typescript
export async function createFolder(
  projectPath: string,
  relativePath: string
): Promise<void> {
  const notesRoot = await getNotesRoot(projectPath)
  const fullPath = path.join(notesRoot, relativePath)
  await ensureDir(fullPath)
}

export async function copyFileToNotes(
  projectPath: string,
  sourcePath: string,
  targetDirRelative: string
): Promise<void> {
  const notesRoot = await getNotesRoot(projectPath)
  const targetDir = path.join(notesRoot, targetDirRelative)
  await ensureDir(targetDir)

  const originalName = path.basename(sourcePath)
  let destName = originalName
  let destPath = path.join(targetDir, destName)

  let counter = 1
  while (await fileExists(destPath)) {
    const ext = path.extname(originalName)
    const base = path.basename(originalName, ext)
    destName = `${base}-${counter}${ext}`
    destPath = path.join(targetDir, destName)
    counter++
  }

  await fs.copyFile(sourcePath, destPath)
}

export async function deleteFolder(
  projectPath: string,
  relativePath: string
): Promise<void> {
  const notesRoot = await getNotesRoot(projectPath)
  const fullPath = path.join(notesRoot, relativePath)
  await fs.rm(fullPath, { recursive: true, force: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/services/note-service.ts
git commit -m "feat: add createFolder, copyFileToNotes, deleteFolder to note-service"
```

---

### Task 4: Backend — Register new IPC handlers

**Files:**
- Modify: `src/main/ipc-handlers.ts`

- [ ] **Step 1: Add three new IPC handlers**

In `src/main/ipc-handlers.ts`, add the following handlers after the existing `notes:exists` handler (after line 70):

```typescript
  ipcMain.handle('notes:create-folder', async (_event, relativePath: string): Promise<void> => {
    const { createFolder } = await import('./services/note-service')
    return createFolder(currentProjectPath!, relativePath)
  })

  ipcMain.handle('notes:copy-file', async (_event, sourcePath: string, targetDirRelative: string): Promise<void> => {
    const { copyFileToNotes } = await import('./services/note-service')
    return copyFileToNotes(currentProjectPath!, sourcePath, targetDirRelative)
  })

  ipcMain.handle('notes:delete-folder', async (_event, relativePath: string): Promise<void> => {
    const { deleteFolder } = await import('./services/note-service')
    await deleteFolder(currentProjectPath!, relativePath)
    const { broadcastMessage } = await import('./services/live-server')
    broadcastMessage('note-deleted', { relativePath })
  })
```

- [ ] **Step 2: Commit**

```bash
git add src/main/ipc-handlers.ts
git commit -m "feat: register IPC handlers for create-folder, copy-file, delete-folder"
```

---

### Task 5: Preload — Expose new APIs

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add three new API methods**

In `src/preload/index.ts`, add the following methods inside the `api` object:

```typescript
  // After noteExists line:
  createFolder: (relativePath: string) => ipcRenderer.invoke('notes:create-folder', relativePath),
  copyFile: (sourcePath: string, targetDir: string) =>
    ipcRenderer.invoke('notes:copy-file', sourcePath, targetDir),
  deleteFolder: (relativePath: string) => ipcRenderer.invoke('notes:delete-folder', relativePath),
```

Place `createFolder` after `noteExists` (line 31), and `copyFile` and `deleteFolder` after `renameNote` (line 30):

The relevant section should look like:

```typescript
  renameNote: (oldPath: string, newPath: string) =>
    ipcRenderer.invoke('notes:rename', oldPath, newPath),
  noteExists: (relativePath: string) => ipcRenderer.invoke('notes:exists', relativePath),
  createFolder: (relativePath: string) => ipcRenderer.invoke('notes:create-folder', relativePath),
  copyFile: (sourcePath: string, targetDir: string) =>
    ipcRenderer.invoke('notes:copy-file', sourcePath, targetDir),
  deleteFolder: (relativePath: string) => ipcRenderer.invoke('notes:delete-folder', relativePath),
```

- [ ] **Step 2: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat: expose createFolder, copyFile, deleteFolder via preload API"
```

---

### Task 6: Types — Update electron.d.ts

**Files:**
- Modify: `src/renderer/src/types/electron.d.ts`

- [ ] **Step 1: Add type declarations**

Add the following type declarations inside the `electronAPI` interface, after `deleteNote`:

```typescript
      createFolder: (relativePath: string) => Promise<void>
      copyFile: (sourcePath: string, targetDir: string) => Promise<void>
      deleteFolder: (relativePath: string) => Promise<void>
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/types/electron.d.ts
git commit -m "feat: add type declarations for createFolder, copyFile, deleteFolder"
```

---

### Task 7: NoteDirectory — Add "New Folder" button

**Files:**
- Modify: `src/renderer/src/components/NoteDirectory.tsx`
- Modify: `src/renderer/src/components/NoteDirectory.css`

- [ ] **Step 1: Add New Folder state and handler in NoteDirectory**

In `NoteDirectory.tsx`, add new state variables for the folder creation input, immediately after the existing `showNewNoteInput`/`newNoteName`/`newNoteType` state block:

```typescript
  const [showNewFolderInput, setShowNewFolderInput] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
```

Add the handler function after `handleSubmitNewNote`:

```typescript
  const handleNewFolder = useCallback(() => {
    setShowNewFolderInput(true)
    setNewFolderName('')
  }, [])

  const handleSubmitNewFolder = useCallback(async () => {
    const folderName = newFolderName.trim()
    if (!folderName) {
      setShowNewFolderInput(false)
      return
    }
    try {
      await window.electronAPI.createFolder(folderName)
      await refreshNotes()
      setShowNewFolderInput(false)
      setNewFolderName('')
    } catch (err) {
      console.error('Failed to create folder:', err)
    }
  }, [newFolderName, refreshNotes])
```

- [ ] **Step 2: Add New Folder UI to the toolbar**

In the JSX, replace the existing toolbar buttons section. Currently there is a single `+ New Note` button (or input when active) at the bottom of the toolbar. Add the New Folder button next to it. Change the toolbar button area to use a row layout:

In the toolbar div, replace:

```tsx
          {showNewNoteInput ? (
            ...
          ) : (
            <button className="new-note-btn" onClick={handleNewNote}>
              + New Note
            </button>
          )}
```

With a container that shows both buttons side by side, and the folder input:

```tsx
          <div className="note-directory-toolbar-buttons">
            {showNewNoteInput ? (
              <div className="new-note-input-group">
                <div className="new-note-input-row">
                  <input
                    className="new-note-name-input"
                    type="text"
                    placeholder="filename"
                    value={newNoteName}
                    onChange={(e) => setNewNoteName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSubmitNewNote()
                      if (e.key === 'Escape') setShowNewNoteInput(false)
                    }}
                    autoFocus
                  />
                  <select
                    className="new-note-type-select"
                    value={newNoteType}
                    onChange={(e) => setNewNoteType(e.target.value as NoteType)}
                  >
                    {typeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="new-note-actions">
                  <button className="new-note-submit-btn" onClick={handleSubmitNewNote}>
                    OK
                  </button>
                  <button className="new-note-cancel-btn" onClick={() => setShowNewNoteInput(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button className="new-note-btn" onClick={handleNewNote} title="New Note">
                📝+
              </button>
            )}
            {showNewFolderInput ? (
              <div className="new-note-input-group">
                <div className="new-note-input-row">
                  <input
                    className="new-note-name-input"
                    type="text"
                    placeholder="folder name"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSubmitNewFolder()
                      if (e.key === 'Escape') setShowNewFolderInput(false)
                    }}
                    autoFocus
                  />
                </div>
                <div className="new-note-actions">
                  <button className="new-note-submit-btn" onClick={handleSubmitNewFolder}>
                    OK
                  </button>
                  <button className="new-note-cancel-btn" onClick={() => setShowNewFolderInput(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button className="new-note-btn" onClick={handleNewFolder} title="New Folder">
                📁+
              </button>
            )}
          </div>
```

- [ ] **Step 3: Add CSS for toolbar buttons row**

In `src/renderer/src/components/NoteDirectory.css`, add:

```css
.note-directory-toolbar-buttons {
  display: flex;
  gap: 4px;
  width: 100%;
}

.note-directory-toolbar-buttons .new-note-btn {
  flex: 1;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/NoteDirectory.tsx src/renderer/src/components/NoteDirectory.css
git commit -m "feat: add New Folder button to Notes toolbar"
```

---

### Task 8: NoteDirectory — Add right-click context menu

**Files:**
- Modify: `src/renderer/src/components/NoteDirectory.tsx`

- [ ] **Step 1: Add imports and context menu state**

Add the import at the top of the file:

```typescript
import { NodeContextMenu } from './editors/NodeContextMenu'
import type { MenuEntry } from './editors/NodeContextMenu'  // Note: MenuEntry isn't exported yet
```

Wait — `MenuEntry` is defined inside `NodeContextMenu.tsx` but not exported. We need to export it. Let's handle that.

First, in `src/renderer/src/components/editors/NodeContextMenu.tsx`, export the types by adding `export`:

The interface definitions (lines 4-16) need `export` added:

```typescript
export interface MenuItem {
  label: string
  shortcut?: string
  action: () => void
  danger?: boolean
  separator?: false
}

export interface MenuSeparator {
  separator: true
}

export type MenuEntry = MenuItem | MenuSeparator
```

Then in `NoteDirectory.tsx`, add these imports after the existing imports:

```typescript
import { NodeContextMenu } from './editors/NodeContextMenu'
import type { MenuEntry } from './editors/NodeContextMenu'
import { getClipboardFile, setClipboardFile, clearClipboardFile } from '../services/clipboard'
```

Add context menu state in the `NoteDirectory` component, after the `newFolderName` state:

```typescript
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    node: TreeNode
  } | null>(null)
```

- [ ] **Step 2: Add context menu handler and menu building functions**

Add these functions inside `NoteDirectory`, before the return statement:

```typescript
  const buildFileContextMenu = useCallback((node: TreeNode): MenuEntry[] => {
    const parentDir = node.path.includes('/')
      ? node.path.substring(0, node.path.lastIndexOf('/'))
      : ''
    const absolutePath = state.workspacePath
      ? state.workspacePath.replace(/\/?$/, '/') + node.path
      : node.path

    return [
      {
        label: 'Copy File',
        action: () => { setClipboardFile(absolutePath) }
      },
      ...(getClipboardFile() ? [{
        label: 'Paste File',
        action: async () => {
          const cf = getClipboardFile()!
          await window.electronAPI.copyFile(cf.sourcePath, parentDir)
          clearClipboardFile()
          await refreshNotes()
        }
      }] : []),
      {
        label: 'Rename',
        action: () => {
          const newName = prompt('New name:', node.name)
          if (newName && newName !== node.name) {
            const parts = node.path.split('/')
            parts[parts.length - 1] = newName
            renameNote(node.path, parts.join('/'))
          }
        }
      },
      { separator: true },
      {
        label: 'Copy Relative Path',
        action: () => { navigator.clipboard.writeText(node.path) }
      },
      {
        label: 'Copy Absolute Path',
        action: () => { navigator.clipboard.writeText(absolutePath) }
      },
      { separator: true },
      {
        label: 'Delete',
        danger: true,
        action: () => {
          if (confirm(`Delete "${node.name}"?`)) {
            deleteNote(node.path)
          }
        }
      }
    ]
  }, [state.workspacePath, renameNote, deleteNote, refreshNotes])

  const buildFolderContextMenu = useCallback((node: TreeNode): MenuEntry[] => {
    return [
      {
        label: 'New Note',
        action: () => {
          const baseName = prompt('Note name:')
          if (!baseName) return
          const ext = '.md'
          const relPath = node.path ? `${node.path}/${baseName}${ext}` : `${baseName}${ext}`
          createNote(relPath, 'md')
        }
      },
      {
        label: 'New Folder',
        action: () => {
          const folderName = prompt('Folder name:')
          if (!folderName) return
          const relPath = node.path ? `${node.path}/${folderName}` : folderName
          window.electronAPI.createFolder(relPath).then(() => refreshNotes())
        }
      },
      { separator: true },
      ...(getClipboardFile() ? [{
        label: 'Paste File',
        action: async () => {
          const cf = getClipboardFile()!
          await window.electronAPI.copyFile(cf.sourcePath, node.path)
          clearClipboardFile()
          await refreshNotes()
        }
      }] : []),
      {
        label: 'Rename',
        action: () => {
          const newName = prompt('New folder name:', node.name)
          if (newName && newName !== node.name) {
            const parts = node.path.split('/')
            parts[parts.length - 1] = newName
            renameNote(node.path, parts.join('/'))
          }
        }
      },
      { separator: true },
      {
        label: 'Delete Folder',
        danger: true,
        action: async () => {
          if (confirm(`Delete folder "${node.name}" and all its contents?`)) {
            await window.electronAPI.deleteFolder(node.path)
            await refreshNotes()
          }
        }
      }
    ]
  }, [createNote, renameNote, refreshNotes])

  const handleContextMenu = useCallback((e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, node })
  }, [])
```

- [ ] **Step 3: Add onContextMenu to TreeItem**

In the `TreeItem` component props, add `onContextMenu`:

```typescript
function TreeItem({
  node,
  depth,
  selectedPath,
  onSelect,
  onDelete,
  onRename,
  onContextMenu   // <-- add this
}: {
  node: TreeNode
  depth: number
  selectedPath: string | null
  onSelect: (node: TreeNode) => void
  onDelete: (node: TreeNode) => void
  onRename: (node: TreeNode) => void
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void  // <-- add this
})
```

Add the `onContextMenu` handler to the root `div.tree-item` element:

```tsx
        onContextMenu={(e) => onContextMenu(e, node)}
```

Place it after the existing `onClick` handler on the same div.

- [ ] **Step 4: Wire up context menu in NoteDirectory render**

Pass `onContextMenu` to each `TreeItem` in the render. Update the `TreeItem` usage in the tree rendering section:

```tsx
            <TreeItem
              key={child.path}
              node={child}
              depth={0}
              selectedPath={state.selectedNoteId}
              onSelect={handleSelect}
              onDelete={handleDelete}
              onRename={handleRename}
              onContextMenu={handleContextMenu}
            />
```

- [ ] **Step 5: Render the context menu at the end of NoteDirectory**

Add the context menu portal right before the closing `</div>` of the component return (after the `note-tree` div):

```tsx
        {contextMenu && (
          <NodeContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextMenu.node.type === 'folder'
              ? buildFolderContextMenu(contextMenu.node)
              : buildFileContextMenu(contextMenu.node)
            }
            onClose={() => setContextMenu(null)}
          />
        )}
```

- [ ] **Step 6: Import ContextMenu.css**

Add at the top of `NoteDirectory.tsx` after other imports:

```typescript
import './ContextMenu.css'
```

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/editors/NodeContextMenu.tsx src/renderer/src/components/NoteDirectory.tsx
git commit -m "feat: add right-click context menu to Notes file tree"
```

---

### Task 9: CodeDirectory — Add right-click context menu

**Files:**
- Modify: `src/renderer/src/components/CodeDirectory.tsx`

- [ ] **Step 1: Add imports**

Add at the top of `CodeDirectory.tsx`:

```typescript
import { NodeContextMenu } from './editors/NodeContextMenu'
import type { MenuEntry } from './editors/NodeContextMenu'
import { setClipboardFile } from '../services/clipboard'
import './ContextMenu.css'
```

- [ ] **Step 2: Add context menu state in CodeDirectory component**

After the `loading` state:

```typescript
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    file: RepoFileNode
  } | null>(null)
```

- [ ] **Step 3: Add image detection helper and menu builder**

Add inside the `CodeDirectory` component, before the return:

```typescript
  const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'])

  const isImageFile = (name: string): boolean => {
    const ext = name.split('.').pop()?.toLowerCase() || ''
    return IMAGE_EXTS.has(ext)
  }

  const buildFileContextMenu = useCallback((file: RepoFileNode): MenuEntry[] => {
    const items: MenuEntry[] = [
      {
        label: 'Copy File',
        action: () => { setClipboardFile(file.absolutePath) }
      },
      { separator: true },
      {
        label: 'Copy Relative Path',
        action: () => { navigator.clipboard.writeText(file.relativePath) }
      },
      {
        label: 'Copy Absolute Path',
        action: () => { navigator.clipboard.writeText(file.absolutePath) }
      }
    ]

    if (isImageFile(file.name)) {
      items.push(
        { separator: true },
        {
          label: 'Insert Image into MD',
          action: () => {
            window.dispatchEvent(new CustomEvent('image-insert', {
              detail: { sourcePath: file.absolutePath, fileName: file.name }
            }))
          }
        }
      )
    }

    return items
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent, file: RepoFileNode) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, file })
  }, [])
```

- [ ] **Step 4: Add onContextMenu to FileTreeItem**

Update the `FileTreeItem` component signature to accept `onContextMenu`:

```typescript
function FileTreeItem({
  file,
  depth,
  onSelect,
  onContextMenu
}: {
  file: RepoFileNode
  depth: number
  onSelect: (file: RepoFileNode) => void
  onContextMenu: (e: React.MouseEvent, file: RepoFileNode) => void
})
```

Add the `onContextMenu` handler to the root div element (the `code-file-item` div), alongside the existing `onClick` and `onDragStart`:

```tsx
        onContextMenu={(e) => onContextMenu(e, file)}
```

Update the recursive `FileTreeItem` render inside the component to pass `onContextMenu`:

In the JSX where `<FileTreeItem` is rendered recursively (line 65), add:
```tsx
          onContextMenu={onContextMenu}
```

- [ ] **Step 5: Pass onContextMenu to FileTreeItems in the render**

In `CodeDirectory`'s JSX, where `<FileTreeItem` is rendered (line 216), add the `onContextMenu` prop:

```tsx
                tree.map((file) => (
                  <FileTreeItem
                    key={file.relativePath}
                    file={file}
                    depth={0}
                    onSelect={handleFileSelect}
                    onContextMenu={handleContextMenu}
                  />
                ))
```

- [ ] **Step 6: Render the context menu portal at end of CodeDirectory**

Add after the closing of the `code-file-tree` div (or `code-no-repo` div), before the final closing `</div>`:

```tsx
        {contextMenu && (
          <NodeContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={buildFileContextMenu(contextMenu.file)}
            onClose={() => setContextMenu(null)}
          />
        )}
```

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/CodeDirectory.tsx
git commit -m "feat: add right-click context menu to Code file tree"
```

---

### Task 10: NoteViewport — Listen for image-insert custom event

**Files:**
- Modify: `src/renderer/src/components/NoteViewport.tsx`

- [ ] **Step 1: Add image-insert event listener**

In `NoteViewport.tsx`, add a new `useEffect` after the existing `symbol-insert` listener (after line 37). The handler follows the same pattern as `handleDrop` for image files:

```typescript
  // Listen for image-insert events from CodeDirectory context menu
  useEffect(() => {
    const handler = async (e: Event) => {
      const { sourcePath, fileName } = (e as CustomEvent<{ sourcePath: string; fileName: string }>).detail
      if (state.activeNoteType !== 'md') {
        // Could show a toast here; for now silently ignore or alert
        return
      }
      try {
        const result = await window.electronAPI.copyFileToAssets(sourcePath)
        mdEditorRef.current?.insertAtCursor(`![${fileName}](wsfile://${result.absolutePath})`)
      } catch {
        mdEditorRef.current?.insertAtCursor(`![${fileName}](wsfile://${sourcePath})`)
      }
    }
    window.addEventListener('image-insert', handler)
    return () => window.removeEventListener('image-insert', handler)
  }, [state.activeNoteType])
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/NoteViewport.tsx
git commit -m "feat: handle image-insert event from Code tree context menu"
```

---

### Task 11: Final verification

- [ ] **Step 1: Type check**

```bash
cd /Users/wangyan/Desktop/note && npx tsc --noEmit 2>&1 | head -50
```

Expected: No type errors (or only pre-existing ones).

- [ ] **Step 2: Run existing tests**

```bash
cd /Users/wangyan/Desktop/note && npm test
```

Expected: All existing tests pass.

- [ ] **Step 3: Commit any fixes if needed**

If type errors are found, fix them and commit.
