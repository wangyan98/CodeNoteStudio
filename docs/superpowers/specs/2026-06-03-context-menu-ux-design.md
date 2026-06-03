# Context Menu & Notes UX Improvements

**Date:** 2026-06-03
**Status:** approved

## Overview

Three UX improvements for the Code Note Studio desktop app:

1. **"New Folder" button** in the Notes panel toolbar
2. **Right-click context menus** on both the Code file tree and Notes file tree
3. **"Insert Image into MD"** option for image files in the Code file tree

## 1. New Folder Button

### Location
`NoteDirectory.tsx` toolbar, next to the existing "+ New Note" button.

### Behavior
- Click shows an inline input asking for folder name (same pattern as New Note)
- On confirm, calls new IPC handler `notes:create-folder` → `fs.mkdir`
- After creation, refreshes the notes tree

### New IPC
- `notes:create-folder(relativePath)` → `ensureDir(fullPath)`

### Visual
Icon button with tooltip "New Folder", placed next to New Note button.

## 2. Context Menu System

### Component
Reuse existing `NodeContextMenu` component (`editors/NodeContextMenu.tsx`). Already provides portal rendering, viewport edge detection, click-outside/escape close, separators, danger items.

### Clipboard State
- Per-tree `clipboardFile` ref: `{ sourcePath: string } | null`
- Set by "Copy File", cleared after "Paste File"

### New IPC Handlers

| Channel | Purpose |
|---------|---------|
| `notes:create-folder` | Create directory in notes root |
| `notes:copy-file` | Copy a file from source path to target directory |
| `notes:delete-folder` | Delete a folder recursively in notes root (`fs.rm({ recursive: true })`) |

### Path Copy
Uses `navigator.clipboard.writeText()` — no IPC needed.

## 3. Menu Items

### Code File Tree (right-click on file — read-only)

| Item | Action | Condition |
|------|--------|-----------|
| Copy File | Store absolutePath to clipboardFile | always |
| Copy Relative Path | clipboard.writeText(relativePath) | always |
| Copy Absolute Path | clipboard.writeText(absolutePath) | always |
| --- | | |
| Insert Image into MD | Copy image to assets, insert `![name](wsfile://path)` into active MD at cursor | image files only |

### Notes File Tree (right-click on file — editable)

| Item | Action | Condition |
|------|--------|-----------|
| Copy File | Store absolutePath to clipboardFile | always |
| Paste File | IPC copy-file from clipboardFile to current dir | clipboard not empty |
| Rename | prompt() → IPC rename | always |
| --- | | |
| Copy Relative Path | clipboard.writeText(relativePath) | always |
| Copy Absolute Path | clipboard.writeText(absolutePath) | always |
| --- | | |
| Delete | confirm() → IPC delete | always |

### Notes Folder (right-click on folder)

| Item | Action | Condition |
|------|--------|-----------|
| New Note | Show inline input → create note in this folder | always |
| New Folder | Show inline input → create folder in this folder | always |
| --- | | |
| Paste File | IPC copy-file from clipboardFile into this folder | clipboard not empty |
| Rename | prompt() → IPC rename | always |
| --- | | |
| Delete Folder | confirm() → IPC `notes:delete-folder` (recursive) | always |

## 4. Insert Image into MD Flow

When user right-clicks an image file in the Code tree and selects "Insert Image into MD":

1. Check if the active note is MD type; if not, show a brief toast/snackbar "No active MD note"
2. Call `window.electronAPI.copyFileToAssets(sourcePath)` to copy the image to `assets/`
3. Dispatch a custom event or call MdEditor ref to insert `![filename](wsfile://absolutePath)` at the current cursor position
4. This mirrors the existing drag-and-drop behavior in `NoteViewport.handleDrop`

## 5. Files Changed

| File | Change |
|------|--------|
| `src/renderer/src/components/NoteDirectory.tsx` | Add New Folder button, add right-click context menu on tree items |
| `src/renderer/src/components/CodeDirectory.tsx` | Add right-click context menu on file tree items |
| `src/main/ipc-handlers.ts` | Add `notes:create-folder` and `notes:copy-file` handlers |
| `src/main/services/note-service.ts` | Add `createFolder` and `copyFile` functions |
| `src/preload/index.ts` | Add `createFolder` and `copyFile` API methods |
| `src/renderer/src/types/electron.d.ts` | Add type declarations for new API methods |

## 6. Non-Goals

- No changes to the live server API
- No keyboard shortcuts for context menu items (menu-only)
- No multi-select or batch operations
- No drag-and-drop for folders
