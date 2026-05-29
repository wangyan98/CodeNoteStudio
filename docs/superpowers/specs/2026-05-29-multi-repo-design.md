# Multi-Repo Index & Color Coding

**Date:** 2026-05-29

## Problem

The app stores all repo symbols in a single flat `.symbols.db` table with no repo column. `clearSymbols()` wipes the entire table on every re-index, so only the last-indexed repo survives. `@ref` references have no repo context, making file paths ambiguous across repos. Users adding multiple repos get broken indexing and unresolvable references.

## Design

### 1. DB Schema — add `repo_path`

```sql
ALTER TABLE symbols ADD COLUMN repo_path TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_symbols_repo ON symbols(repo_path);
```

`repo_path` stores the absolute path from `CodeRepo.path` in `notebook.json`. The index on `repo_path` enables fast scoped queries.

Migration: existing rows get `repo_path = ''`. Since indexing always does delete-then-insert for a repo, stale rows without a proper repo_path get cleaned up on the next re-index.

### 2. Indexing — per-repo delete, not full clear

Replace `clearSymbols(db)` (full table wipe) with `clearRepo(db, repoPath)` (scoped delete):

```ts
export function clearRepo(db: Database.Database, repoPath: string): void {
  db.prepare('DELETE FROM symbols WHERE repo_path = ?').run(repoPath)
}
```

`indexSymbols()` updated to accept and store `repoPath`:

```ts
export function indexSymbols(db: Database.Database, symbols: CodeSymbol[], repoPath: string): void {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO symbols (name, kind, file_path, start_line, end_line, start_column, end_column, parent_name, repo_path)
    VALUES (@name, @kind, @file_path, @start_line, @end_line, @start_column, @end_column, @parent_name, @repo_path)
  `)
  // ... same transaction logic with repo_path param
}
```

`querySymbols()` gains an optional `repoPath` filter:

```ts
export function querySymbols(db, name?, filePath?, kind?, repoPath?, limit?): CodeSymbol[]
```

The returned `CodeSymbol` rows also now include `repoPath`:

```ts
// CodeSymbol type in code-parser.ts gains optional repoPath:
export interface CodeSymbol {
  // ... existing fields ...
  repoPath?: string  // populated by querySymbols(), absent from raw parser output
}
```

The IPC handler `code:index-symbols` calls `clearRepo(db, repoPath)` then `indexSymbols(db, symbols, repoPath)`.

### 3. @ref format — with repo prefix

**New format:** `@ref(repo:path:line:name)` where `repo` is the repo folder basename.

Classification in `classifyRef()`:
- First segment before the first `:` — if it's not all-digits and doesn't contain `/`, it's the `repo`
- Remaining segments: same logic as before (file, line, name)

```
@ref(backend:src/main.go:42:HandleRequest)
      ^^^^^^  ^^^^^^^^^^  ^^  ^^^^^^^^^^^^^
      repo    filePath    line  name
```

**Legacy** `@ref(path:line:name)` without a repo: scoped to the currently active repo during resolution.

**Generation:** Both the CodeViewport drag handler and SymbolPicker prepend the repo basename to the `@ref` text:

```ts
const repoName = path.basename(codeRepoPath)
const refText = `@ref(${repoName}:${relPath}:${sym.startLine}:${displayName})`
```

### 4. Resolution — repo-filtered, then T1-T5

`resolveRefs()` updated: before matching, filter `symbols` to the target repo. Then apply the existing 5-tier logic within that subset.

```
target repo = ref.repo ?? activeRepo
candidates = symbols.filter(s => s.repo_path.endsWith('/' + targetRepo) || s.repo_path === targetRepo)
```

Legacy refs (no repo) use `activeRepo` as the filter. If `activeRepo` is null (no repo selected), resolution returns no match.

IPC handler `code:resolve-refs` updated to accept and pass through `activeRepoPath`:

```ts
ipcMain.handle('code:resolve-refs', async (_event, notePath, content, activeRepoPath?) => {
  const refs = parseRefs(content)
  const db = initSymbolDatabase(currentProjectPath!)
  const allSymbols = querySymbols(db) // always load all repos
  const mappings = await resolveRefs(refs, allSymbols, activeRepoPath)
  // ...
})
```

Preload API gains the extra parameter:

```ts
resolveRefs: (notePath: string, content: string, activeRepoPath?: string) =>
  ipcRenderer.invoke('code:resolve-refs', notePath, content, activeRepoPath),
```

### 5. UI — color coding

**Color palette** (8 colors, assigned by position in `codeRepos` array):

```ts
const REPO_COLORS = ['#e06c75', '#61afef', '#98c379', '#d19a66', '#c678dd', '#56b6c2', '#e5c07b', '#abb2bf']
function getRepoColor(index: number): string { return REPO_COLORS[index % REPO_COLORS.length] }
```

Colors are stable across sessions because they're determined by array position, not randomly assigned.

#### 5a. Repo chips in toolbar

Each chip shows a colored dot, the repo basename, and a per-repo re-index button (↻):

```
Repos: [● backend ↻] [● frontend ↻]  [+ Add Repo]
```

- Colored dot: `width:8px; height:8px; border-radius:50%; background:<repoColor>`
- Re-index button: calls `indexSymbols()` for that single repo only
- Existing "Re-index all" button removed

#### 5b. Code viewport tabs

Tab bar shows a colored dot and a `border-bottom` matching the repo color:

```
┌──────────────┬──────────────┬──────────┐
│ ● main.go    │ ● App.tsx    │ notes.md │
│  (red line)  │  (blue line) │          │
└──────────────┴──────────────┴──────────┘
```

Implementation: `CodeFile` gets a `repoPath` field. When opening a file, the repo path is stored. The tab component looks up the repo color via `codeRepos` array index. Non-code files (no repo) get no dot and a transparent border.

### 6. Data flow

```
User adds repo → saveConfig → indexSymbols(repoPath) on main process
  → main: clearRepo(db, repoPath) → parse files → indexSymbols(db, symbols, repoPath)
  → symbols stored with repo_path column

User clicks re-index on a chip → indexSymbols(repoPath) for that repo only

@ref resolution: parseRefs(content) → resolveRefs(refs, allSymbols, activeRepo)
  → filter by repo → T1-T5 matching → CodeMapping[]

CodeViewport drag: generates @ref(repoName:relPath:line:name)
SymbolPicker insert: generates @ref(repoName:relPath:line:name)
```

### 7. Files changed

| File | Change |
|------|--------|
| `src/main/services/symbol-index.ts` | Add `repo_path` column migration, `clearRepo()`, update `indexSymbols()` + `querySymbols()` |
| `src/main/services/ref-resolver.ts` | Add `repo` to `RefSpec`, update `classifyRef()` (first-segment-is-repo logic), update `resolveRefs()` with repo filtering |
| `src/main/ipc-handlers.ts` | Update `code:index-symbols` to use `clearRepo()`, update `code:resolve-refs` to pass `activeRepo`, update `code:query-symbols` to accept `repoPath` |
| `src/renderer/src/types/index.ts` | Add `repoPath` to `CodeFile` |
| `src/renderer/src/components/WorkspaceToolbar.tsx` | Colored dots, per-repo re-index button, remove bulk re-index |
| `src/renderer/src/components/WorkspaceToolbar.css` | Styles for colored dots and re-index button |
| `src/renderer/src/components/CodeViewport.tsx` | Repo-colored tab dots/underline, `@ref` generation with repo prefix |
| `src/renderer/src/components/CodeViewport.css` | Styles for repo-colored tabs |
| `src/renderer/src/components/SymbolPicker.tsx` | `@ref` generation with repo prefix |
| `src/main/services/live-server.ts` | Update `querySymbols` call to pass `repoPath` |
