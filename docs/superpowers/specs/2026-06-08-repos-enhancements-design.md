# Repos Enhancements Design

## Summary

Enhance the code repository management experience in the workspace toolbar with right-click context menu (replacing direct right-click delete), repo reordering, color customization, repo detail view, and website jump for repos with git remotes.

## Data Model

### CodeRepo (types/index.ts, main/types.ts)

```ts
export interface CodeRepo {
  path: string
  commit: string
  color?: string // optional custom hex color override
}
```

`color` is persisted in `notebook.json` under `codeRepos`. When absent, the color is auto-assigned from the `REPO_COLORS` palette by index.

## Backend Changes

### git-service.ts

New function:

```ts
export async function getRemoteUrl(repoPath: string): Promise<string | null>
```

- Runs `git remote get-url origin` via simple-git
- Returns the URL string, or `null` if not a git repo / no remote configured
- URL is used for "Open in Website" (any URL, not just GitHub/GitLab/Gitee)

### ipc-handlers.ts

New handler: `code:get-remote-url` — calls `getRemoteUrl(repoPath)`

### preload/index.ts

New API: `getRemoteUrl: (repoPath: string) => ipcRenderer.invoke('code:get-remote-url', repoPath)`

## Frontend Changes (WorkspaceToolbar.tsx)

### Right-Click Context Menu

Replace the current `onContextMenu` (which fires `handleRemoveRepo` directly) with a context menu using the existing `NodeContextMenu` component.

Menu structure:

```
Copy Repo Path
Open in Finder
──────────────────
Re-index Symbols
Change Color →        (submenu: 8 preset color dots + Reset to Default)
──────────────────
Move to Front
Move to Back
Move Up
Move Down
──────────────────
Open in Website       (shown only when git remote URL is detected)
──────────────────
View Details
──────────────────
Remove Repo           (danger color)
```

- Move Up / Move to Front disabled when repo is first
- Move Down / Move to Back disabled when repo is last
- Color submenu: 8 dots from `REPO_COLORS`, clicking applies color → saves to config
- "Reset to Default" clears `color` field → reverts to index-based auto color

### Repo Sorting

Four ordering actions modify the `codeRepos` array in local state, then persist via `saveConfig`:

- **Move to Front**: splice + unshift to index 0
- **Move to Back**: splice + push to end
- **Move Up**: swap with index - 1
- **Move Down**: swap with index + 1

### Color Customization

- Submenu shows 8 preset colors from `REPO_COLORS` as clickable colored dots
- Selecting a color sets `repo.color` and saves config
- "Reset to Default" removes `color` → falls back to index-based color
- The `getRepoColor` function checks `repo.color` first, then falls back to `REPO_COLORS[index % REPO_COLORS.length]`

### Repo Detail Modal

An inline Modal component triggered by "View Details":

Displays:
- Local path
- Git remote URL (or "N/A")
- Latest commit: SHA, message, author, date
- File count / directory count (computed from `listRepoFiles`)
- Recent commits list (last 10): SHA, message, relative time

Data is fetched on modal open via `getRemoteUrl`, `getGitCommit`, `getRecentCommits`, and `listRepoFiles`.

### Open in Website

- Before showing context menu, check if repo has a git remote URL
- If remote URL exists, show "Open in Website" menu item
- Click triggers `shell.openExternal(url)` via a new IPC call or existing mechanism
- No domain matching — any remote URL is supported

### IPC / preload additions needed for openExternal

New IPC: `shell:open-external` → `shell.openExternal(url)` in main process
New preload API: `openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url)`

## File Change List

| File | Change |
|---|---|
| `src/renderer/src/types/index.ts` | `CodeRepo` add `color?` |
| `src/main/types.ts` | `CodeRepo` add `color?` |
| `src/main/services/git-service.ts` | Add `getRemoteUrl()` |
| `src/main/ipc-handlers.ts` | Add `code:get-remote-url` and `shell:open-external` handlers |
| `src/preload/index.ts` | Expose `getRemoteUrl` and `openExternal` |
| `src/renderer/src/components/WorkspaceToolbar.tsx` | Context menu, sorting, detail modal, color picker, website jump |
| `src/renderer/src/components/WorkspaceToolbar.css` | Modal, color picker, context menu styles |

No new files.

## Implementation Order

1. Data model: `CodeRepo.color?`
2. Backend: `getRemoteUrl()` + IPC handlers + preload
3. Context menu: replace `onContextMenu` with full menu
4. Sorting: move up/down/front/back actions
5. Color picker: submenu with presets
6. Detail modal: git info + file stats
7. Open in Website: remote URL detection + `shell.openExternal`
