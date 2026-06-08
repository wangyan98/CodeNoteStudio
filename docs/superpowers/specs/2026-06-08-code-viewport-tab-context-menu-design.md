# Code Viewport Tab Context Menu Design

## Summary

Add a right-click context menu to the code viewport tab bar, providing common tab-management operations: close variations, reopen closed file, copy path, reveal in file tree, and open in external editor.

## Data Model

### New AppState fields (types/index.ts)

```ts
recentlyClosedFile: CodeFile | null
revealFilePath: string | null
```

### New AppAction types (types/index.ts)

```ts
| { type: 'CLOSE_OTHER_CODE_FILES'; index: number }
| { type: 'CLOSE_CODE_FILES_LEFT'; index: number }
| { type: 'CLOSE_CODE_FILES_RIGHT'; index: number }
| { type: 'CLOSE_ALL_CODE_FILES' }
| { type: 'REOPEN_CLOSED_CODE_FILE' }
| { type: 'REVEAL_FILE_IN_TREE'; filePath: string }
| { type: 'CLEAR_REVEAL_FILE_IN_TREE' }
```

### Menu items per right-clicked tab

| Label | Action | Disabled when |
|---|---|---|
| Close | `CLOSE_CODE_FILE` at tab index | — |
| Close Others | `CLOSE_OTHER_CODE_FILES` at tab index | only 1 tab open |
| Close to the Right | `CLOSE_CODE_FILES_RIGHT` at tab index | tab is the rightmost |
| Close to the Left | `CLOSE_CODE_FILES_LEFT` at tab index | tab is the leftmost |
| Close All | `CLOSE_ALL_CODE_FILES` | no tabs open |
| — (separator) | | |
| Reopen Closed File | `REOPEN_CLOSED_CODE_FILE` | `recentlyClosedFile` is null |
| — (separator) | | |
| Copy Path | `navigator.clipboard.writeText(file.path)` | — |
| Reveal in File Tree | `REVEAL_FILE_IN_TREE` with file path | — |
| Open in External Editor | `window.electronAPI.openPath(file.path)` | — |

## Component Changes

### CodeViewport.tsx

- Add `tabContextMenu` state: `{ x: number; y: number; tabIndex: number } | null`
- Add `onContextMenu` handler on each `.code-tab` div that:
  1. Auto-selects the right-clicked tab (`SET_ACTIVE_CODE_FILE`)
  2. Sets the context menu state with mouse coordinates and tab index
- Build menu items via `buildTabContextMenu(tabIndex: number): MenuEntry[]`
- Render `<NodeContextMenu>` when `tabContextMenu` is set (already imported pattern from CodeDirectory)
- Close actions that close a single file (Close, Close All) record the closed file into `recentlyClosedFile`
- Multi-close actions (Close Others, Close Left, Close Right) set `recentlyClosedFile` to null since there's no single definitive file to restore

### AppContext.tsx (reducer)

- `CLOSE_OTHER_CODE_FILES`: keep only the file at `action.index`, set it as active at index 0. Set `recentlyClosedFile` to null.
- `CLOSE_CODE_FILES_LEFT`: filter out files with index < `action.index`. Set `activeCodeFileIndex` to 0 (the right-clicked tab's new position). Set `recentlyClosedFile` to null.
- `CLOSE_CODE_FILES_RIGHT`: filter out files with index > `action.index`. Active index unchanged (only right-side files removed). Set `recentlyClosedFile` to null.
- `CLOSE_ALL_CODE_FILES`: clear `openCodeFiles`, set `activeCodeFileIndex` to -1, store the previously active file into `recentlyClosedFile`.
- `REOPEN_CLOSED_CODE_FILE`: append `recentlyClosedFile` to `openCodeFiles`, set it as active, clear `recentlyClosedFile`.
- `REVEAL_FILE_IN_TREE`: set `revealFilePath` to the target path.
- `CLEAR_REVEAL_FILE_IN_TREE`: set `revealFilePath` to null.
- Existing `CLOSE_CODE_FILE`: also store the closed file into `recentlyClosedFile`.

### CodeDirectory.tsx

- Add a `useEffect` watching `state.revealFilePath`. When set, find the matching file node in the tree, expand all ancestor directories, scroll the node into view, then dispatch `CLEAR_REVEAL_FILE_IN_TREE`.

### CodeViewport.css

- Add `cursor: context-menu` (or `cursor: default`) on `.code-tab` to hint at context menu availability (no new styles needed otherwise — the existing `ContextMenu.css` covers menu rendering).

## Behavior Notes

- Right-clicking a tab first selects it, so the user always sees which tab the menu is operating on.
- Multi-close operations (Close Others, Close Left, Close Right) clear `recentlyClosedFile` rather than storing any single file. Only single-file closes (Close, Close All) populate it. This keeps undo behavior predictable.
- `Reveal in File Tree` is a no-op if `codeRepoPath` is not set or the file is not found in the current tree.
- `Open in External Editor` uses the existing `shell:open-path` IPC handler — no backend changes needed.
