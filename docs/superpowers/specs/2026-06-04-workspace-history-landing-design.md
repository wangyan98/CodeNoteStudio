# Workspace History & Landing Page Design

## Overview

Enhance the startup/landing page with recent workspace history (LRU, max 10 entries),
allow navigating back to landing via the workspace name in the toolbar, improve the
Create Workspace flow, and validate workspace directories on open.

## Data Model

### workspace.json (userData)

```json
{
  "history": [
    { "path": "/Users/xxx/project-a", "name": "project-a", "lastOpened": 1700000000000 },
    { "path": "/Users/xxx/project-b", "name": "my-notes",   "lastOpened": 1699990000000 }
  ]
}
```

- Stored in Electron `userData` directory, same location as current `workspace.json`
- Backward compatible: existing `{ "lastPath": "..." }` format is migrated on first read

### Types

```ts
interface WorkspaceHistoryEntry {
  path: string
  name: string
  lastOpened: number // timestamp
}
```

## Main Process Changes

### `src/main/services/workspace.ts`

- `addToHistory(path, name)` — upsert entry (update timestamp if exists), sort by `lastOpened` desc, trim to 10
- `getHistory(): WorkspaceHistoryEntry[]` — return sorted history
- `removeFromHistory(path)` — delete entry by path
- `loadLastWorkspacePath()` — return `history[0].path` if history exists, else null
- `validateWorkspacePath(path)` — unchanged, checks readability + is directory

### `src/main/ipc-handlers.ts`

| Handler | Change |
|---|---|
| `workspace:get-history` | **New.** Returns `getHistory()` |
| `workspace:remove-from-history` | **New.** Calls `removeFromHistory(path)` |
| `workspace:open` | **Modified.** Validates `notebook.json` exists before opening; calls `addToHistory` on success; throws if not a valid workspace |
| `workspace:create` | **Modified.** Receives `dirPath`, validates directory is empty (ignoring `.DS_Store`), initializes `notebook.json` + `notes/` |
| `workspace:get-current` | **Modified.** When workspace is cleared, returns `null` |

### Workspace Validation

On `workspace:open`, check that `path/notebook.json` exists. If not, throw an error
with message `"Not a valid workspace"`. The renderer catches this and shows an `alert()`.

## Renderer Changes

### `src/renderer/src/types/index.ts`

- Add `WorkspaceHistoryEntry` type
- Add `SET_WORKSPACE_HISTORY` action
- Add `workspaceHistory` to `AppState`

### `src/renderer/src/contexts/AppContext.tsx`

- New state: `workspaceHistory: WorkspaceHistoryEntry[]`
- New action: `SET_WORKSPACE_HISTORY`

### `src/renderer/src/components/WorkspaceToolbar.tsx`

**a) Click workspace name to return to landing**

The toolbar's `📁 {workspaceName}` becomes a clickable element. On click:
- `dispatch({ type: 'CLEAR_WORKSPACE' })` — hides panels, shows landing page
- Calls `window.electronAPI.clearWorkspace()` to reset main process state

**b) Landing page — history list**

Added below the "New Workspace" / "Open Workspace" buttons, separated by a
"Recent Workspaces" divider. Each history item shows:
- Folder icon + project name + full path
- Click to open (validates `notebook.json` first)
- × button to remove from history (no file deletion)

States:
- History loaded and non-empty → show list
- History empty → hide the entire "Recent Workspaces" section
- History item clicked, path invalid → alert("Workspace no longer exists", auto-remove from list

**c) Create Workspace flow**

1. User clicks "New Workspace"
2. Folder picker opens — user selects an empty directory
3. Main process validates the directory is empty (ignoring `.DS_Store`)
4. If not empty, throws error "Selected directory is not empty"
5. Main process initializes `notebook.json` + `notes/` in the selected directory
6. Auto-opens the new workspace

**d) Open Workspace validation**

User clicks "Open Workspace" or a history item:
- Main process checks `notebook.json` in selected folder
- Valid → opens normally, history updated (LRU bump)
- Invalid → alert("Selected folder is not a valid workspace", stays on landing page
- History item invalid → additionally auto-removed from history

### `src/preload/index.ts`

New API methods exposed:
- `getWorkspaceHistory()` — `ipcRenderer.invoke('workspace:get-history')`
- `removeFromWorkspaceHistory(path)` — `ipcRenderer.invoke('workspace:remove-from-history', path)`
- `clearWorkspace()` — resets current workspace to null

## Files Changed

| File | Change Summary |
|---|---|
| `src/main/services/workspace.ts` | History CRUD, LRU logic, migration from old format |
| `src/main/ipc-handlers.ts` | New history handlers, workspace:open validation, workspace:create refactor |
| `src/preload/index.ts` | New API bridge methods |
| `src/renderer/src/types/index.ts` | New types and actions |
| `src/renderer/src/contexts/AppContext.tsx` | New state + reducer case |
| `src/renderer/src/components/WorkspaceToolbar.tsx` | Landing page UI, click-to-landing, flow changes |
| `src/renderer/src/components/WorkspaceToolbar.css` | Landing page history list styles |

## Error Handling

| Scenario | Behavior |
|---|---|
| History item path deleted/moved | `alert()` "Workspace no longer exists", auto-remove from list |
| Open Workspace on non-project dir | `alert()` "Selected folder is not a valid workspace" |
| Create Workspace on non-empty directory | `alert()` "Selected directory is not empty. Please choose an empty folder." |
| Old `workspace.json` format (only `lastPath`) | Auto-migrate to new history array format on first read |
| Empty history | Hide "Recent Workspaces" section entirely |

## Out of Scope

- Workspace pinning / favorites
- Custom workspace icons or colors
- Sorting options beyond LRU
