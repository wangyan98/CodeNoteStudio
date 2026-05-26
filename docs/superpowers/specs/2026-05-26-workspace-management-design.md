# Workspace Management Design

> **Goal:** Add workspace concept — users can specify a notes directory and link target code repositories, replacing the hardcoded `~/code-note-studio-workspace/` path.

**Approach:** Config-in-Notes — single workspace model. User picks a directory, `notebook.json` lives alongside notes, app persists the last-opened path.

---

## Architecture

### Directory Structure

```
~/my-notes/                   ← user picks via native folder dialog
├── notebook.json              ← config file
├── algorithms.md
├── system-design.md
├── projects/
│   └── todo.md
└── .index.db                  ← SQLite index (auto-created)
```

### Startup Flow

```
App Launch
  │
  ├─ Read {userData}/workspace.json → { "lastPath": "..." }
  │
  ├─ Path exists?
  │    ├─ YES → open workspace, load notebook.json, init DB
  │    └─ NO  → show landing page ("Open Folder" button)
  │
  └─ Window loads with 4-panel layout + workspace toolbar

Workspace switch:
  Toolbar "Open Folder" → native dialog → workspace:open IPC
    → persist new path → load notebook.json → init DB → refresh UI
```

### Persistence

Stored at `app.getPath('userData')/workspace.json`:
```json
{ "lastPath": "/Users/wangyan/my-notes" }
```

Read at startup, written on `workspace:open`. No new dependencies.

---

## Data Model

### notebook.json (updated)

```json
{
  "name": "My Notes",
  "notesPath": "./",
  "codeRepos": [
    { "path": "/Users/wangyan/projects/algo", "commit": "" },
    { "path": "/Users/wangyan/projects/lib", "commit": "" }
  ]
}
```

### Types (simplified CodeRepo)

```typescript
// LSP field removed — not implemented, repo can contain multiple languages

interface CodeRepo {
  path: string
  commit: string
}

interface NotebookConfig {
  name: string
  notesPath: string          // default "./" — relative or absolute path for notes
  codeRepos: CodeRepo[]
}
```

---

## IPC Channels

### New

| Channel | Direction | Purpose |
|---|---|---|
| `dialog:select-folder` | renderer → main | Open native folder picker, returns path or null |
| `workspace:open` | renderer → main | Switch workspace — persist path, init DB, return config |
| `workspace:get-current` | renderer → main | Get current workspace path |

### Unchanged

All existing `notes:*`, `code:*`, `config:*`, `server:*` handlers continue working — they already accept `projectPath` as a parameter and use the module-level `currentProjectPath`.

---

## UI

### Workspace Toolbar (above 4-panel layout)

```
┌─────────────────────────────────────────────────────────┐
│ 📁 My Notes │ Repos: [~/projects/algo] [~/projects/lib] │
│                                    [+ Add Repo] [Open Folder] │
└─────────────────────────────────────────────────────────┘
```

- **Workspace name** from `notebook.json` → `name`
- **Repo chips** — click to focus CodeDirectory on that repo, right-click → Remove
- **+ Add Repo** — opens native folder picker, adds path to config, saves
- **Open Folder** — opens native folder picker, switches workspace

### Landing Page (no workspace)

Shown when no workspace is open (first launch, or last path deleted):
- App icon + "Code Note Studio"
- "Open a folder to get started"
- "Open Folder" button (calls `dialog:select-folder` → `workspace:open`)

---

## Files Changed

### Create
- `src/main/services/workspace.ts` — `saveLastWorkspacePath`, `loadLastWorkspacePath`, `validateWorkspacePath`
- `src/renderer/src/components/WorkspaceToolbar.tsx` — toolbar + landing page
- `src/renderer/src/components/WorkspaceToolbar.css` — styles

### Modify
- `src/main/index.ts` — replace hardcoded path with workspace init
- `src/main/ipc-handlers.ts` — add workspace/dialog handlers
- `src/main/types.ts` — simplify CodeRepo, add workspace types
- `src/preload/index.ts` — expose workspace APIs
- `src/renderer/src/types/electron.d.ts` — type declarations
- `src/renderer/src/types/index.ts` — simplify CodeRepo
- `src/renderer/src/components/Layout.tsx` — add WorkspaceToolbar
- `src/renderer/src/components/CodeDirectory.tsx` — support multiple repos
- `src/renderer/src/contexts/AppContext.tsx` — add workspace state to context

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| Last workspace path deleted/moved | Show landing page |
| Workspace folder has no write permission | Alert: "Cannot open — read-only" |
| notebook.json is corrupted JSON | Load defaults, warn |
| Repo path no longer exists | Gray out chip, tooltip "Path not found" |
| Duplicate repo path | No-op |
| First launch (no workspace.json) | Show landing page |
| notesPath points to missing dir | Create on load (mkdir recursive) |
| User cancels folder picker | Stay on current state |

---

## Out of Scope

- Multiple simultaneous workspaces
- Drag-and-drop folder to open
- Recent workspaces list (last path only)
- LSP integration
- Workspace-level settings beyond notebook.json

---

## Testing

### Unit
- `workspace.ts` — read/write workspace.json, path validation
- `notebook-config.ts` — load with corrupted JSON fallback
- `WorkspaceToolbar` — renders landing page vs toolbar based on workspace state
- `CodeDirectory` — renders multiple repos, empty state

### Integration
- IPC: `workspace:open` → loads config, persists path, inits DB
- IPC: `dialog:select-folder` → returns path or null on cancel
- IPC: `workspace:get-current` → returns current path
- Full flow: open workspace → create note → verify on disk
