# Context Menu & Notes UX Bug Fixes (2026-06-03)

## Issue 1: Context Menu Clicks Not Responding

**Symptom:** Right-click context menu appeared but clicking menu items had no effect — actions didn't execute and the menu stayed open.

**Root Cause:** The `NodeContextMenu` component renders menu items via `createPortal` into `document.body`. React's synthetic `onClick` event handler on those portal-rendered `<div>` elements was not firing at all.

**Fix:** Replaced React synthetic `onClick` with a native DOM `click` event listener attached directly to the menu container via `useEffect`. Menu items now carry a `data-menu-action` attribute and the native handler identifies the clicked item via `closest('[data-menu-action]')`, then executes the action and closes the menu.

**Files changed:** `src/renderer/src/components/editors/NodeContextMenu.tsx`

---

## Issue 2: Empty Directories Not Visible in Notes Tree

**Symptom:** After creating a new folder via the context menu, the folder did not appear in the Notes tree. The folder existed on disk but the tree only showed directories that contained note files.

**Root Cause:** `listNotes()` in `note-service.ts` only scanned for recognized note files (`.md`, `.mind.json`, etc.). The `buildTree()` function on the frontend derived folder nodes from file paths, so empty directories had no representation.

**Fix:**
1. Added `isDirectory?: boolean` to `NoteListItem` (main) and `NoteItem` (renderer) types
2. Modified `listNotes()` to also push directory entries during its recursive scan
3. Updated `buildTree()` to handle directory entries — when `note.isDirectory` is true or the path part is an intermediate segment, the node is created as type `'folder'`

**Files changed:** `src/main/types.ts`, `src/main/services/note-service.ts`, `src/renderer/src/types/index.ts`, `src/renderer/src/components/NoteDirectory.tsx`

---

## Issue 3: Context Menu "New Note" Always Created .md Files

**Symptom:** Creating a note via the right-click context menu always produced a Markdown `.md` file, regardless of what suffix the user typed in the inline input.

**Root Cause:** `handleCreateSubmit()` hardcoded `createNote(relPath, 'md')` for all note types. There was also only one generic "New Note" menu entry.

**Fix:**
1. Replaced the single "New Note" context menu entry with 5 per-type entries: `New .md`, `New .mind.json`, `New .derive.json`, `New .seq.mermaid`, `New .net.json`
2. Each entry pre-fills the inline input with the file suffix and positions the cursor at position 0 (before the suffix)
3. `handleCreateSubmit()` now passes `creatingType` (which is `NoteType | 'folder'`) to `createNote()`, so each file type gets its proper initial content

**Files changed:** `src/renderer/src/components/NoteDirectory.tsx`

---

## Issue 4: Inline Input UX (Rename, New Note, New Folder)

**Symptom:** Context menu actions for New Note, New Folder, and Rename used browser `prompt()` dialogs, which felt clunky and sometimes didn't work reliably in Electron.

**Fix:** Implemented VS Code-style inline inputs in the tree:
- **Rename:** Clicking "Rename" turns the item's label into an inline `<input>`, pre-filled with the current name and auto-selected. Enter to confirm, Escape or blur to cancel.
- **New Note/New Folder:** Clicking any "New X" option adds an inline input row under the target folder (or at root level). Pre-filled with the file suffix, cursor at start. Enter to create, Escape or blur to cancel.

**Files changed:** `src/renderer/src/components/NoteDirectory.tsx`, `src/renderer/src/components/NoteDirectory.css`

---

## Issue 5: Context Menu and Toolbar Used File Suffixes Instead of Display Names

**Symptom:** Context menu showed "New .md", "New .mind.json" and toolbar type selector showed ".md", ".mind.json" — these suffix-based labels were not intuitive.

**Fix:** Added `displayName` field to `typeOptions` with human-readable names (Markdown, Mindmap, Derive, Sequence, Network). Context menu now shows "New Markdown", "New Mindmap", etc. Toolbar `<select>` shows display names instead of suffixes.

**Files changed:** `src/renderer/src/components/NoteDirectory.tsx`

---

## Issue 6: Notes Directory Not Sorted

**Symptom:** Files and folders in the Notes tree appeared in arbitrary filesystem order.

**Fix:** Added sorting to `listNotes()`: directories appear first (A-Z), followed by files grouped by type in order (md → mind → derive → seq → net), each group sorted A-Z.

**Files changed:** `src/main/services/note-service.ts`
