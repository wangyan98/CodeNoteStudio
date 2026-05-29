# Multi-Repo Index & Color Coding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repo-scoped indexing, repo-prefixed @ref references, and color-coded repo indicators in the toolbar and code tabs.

**Architecture:** Add `repo_path` column to the symbols DB. Replace full-table clear with per-repo delete. Parse `@ref(repo:path:line:name)` with repo as first segment, legacy refs scoped to active repo. UI shows colored dots (toolbar chips) and colored underlines (code tabs) using an 8-color palette assigned by repo position in config.

**Tech Stack:** Electron, React/TypeScript, better-sqlite3, web-tree-sitter

---

### Task 1: Backend — DB schema, types, and IPC handlers

**Files:**
- Modify: `src/main/services/symbol-index.ts`
- Modify: `src/main/services/code-parser.ts:5-14`
- Modify: `src/main/ipc-handlers.ts:136-175`

- [ ] **Step 1: Add repo_path migration to symbol-index.ts**

In `initSymbolDatabase()`, add the column migration and new index after the `CREATE TABLE`:

```ts
export function initSymbolDatabase(projectPath: string): Database.Database {
  const dbPath = path.join(projectPath, '.symbols.db')
  const db = new Database(dbPath)

  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS symbols (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      file_path TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      start_column INTEGER NOT NULL,
      end_column INTEGER NOT NULL,
      parent_name TEXT
    )
  `)

  // Migration: add repo_path if the column doesn't exist yet
  try {
    db.exec(`ALTER TABLE symbols ADD COLUMN repo_path TEXT NOT NULL DEFAULT ''`)
  } catch {
    // Column already exists — ignore
  }

  db.exec(`CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_path)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_symbols_repo ON symbols(repo_path)`)

  return db
}
```

- [ ] **Step 2: Replace clearSymbols with clearRepo, update indexSymbols signature**

```ts
export function clearRepo(db: Database.Database, repoPath: string): void {
  db.prepare('DELETE FROM symbols WHERE repo_path = ?').run(repoPath)
}

export function indexSymbols(db: Database.Database, symbols: CodeSymbol[], repoPath: string): void {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO symbols (name, kind, file_path, start_line, end_line, start_column, end_column, parent_name, repo_path)
    VALUES (@name, @kind, @file_path, @start_line, @end_line, @start_column, @end_column, @parent_name, @repo_path)
  `)

  const transaction = db.transaction((syms: CodeSymbol[]) => {
    for (const sym of syms) {
      insert.run({
        name: sym.name,
        kind: sym.kind,
        file_path: sym.filePath,
        start_line: sym.startLine,
        end_line: sym.endLine,
        start_column: sym.startColumn,
        end_column: sym.endColumn,
        parent_name: sym.parentName || null,
        repo_path: repoPath
      })
    }
  })

  transaction(symbols)
}
```

- [ ] **Step 3: Update querySymbols to include repo_path and accept repoPath filter**

```ts
export function querySymbols(
  db: Database.Database,
  name?: string,
  filePath?: string,
  kind?: string,
  repoPath?: string,
  limit?: number
): (CodeSymbol & { repoPath: string })[] {
  let sql = 'SELECT name, kind, file_path, start_line, end_line, start_column, end_column, parent_name, repo_path FROM symbols WHERE 1=1'
  const params: Record<string, string> = {}

  if (name) {
    sql += ' AND name LIKE @name'
    params.name = `%${name}%`
  }
  if (filePath) {
    sql += ' AND file_path = @file_path'
    params.file_path = filePath
  }
  if (kind) {
    sql += ' AND kind = @kind'
    params.kind = kind
  }
  if (repoPath) {
    sql += ' AND repo_path = @repo_path'
    params.repo_path = repoPath
  }

  sql += ' ORDER BY start_line ASC'

  if (limit) {
    sql += ' LIMIT @limit'
    params.limit = String(limit)
  }

  const rows = db.prepare(sql).all(params) as Array<{
    name: string; kind: string; file_path: string
    start_line: number; end_line: number; start_column: number; end_column: number
    parent_name: string | null; repo_path: string
  }>

  return rows.map((row) => ({
    name: row.name,
    kind: row.kind as CodeSymbol['kind'],
    filePath: row.file_path,
    startLine: row.start_line,
    endLine: row.end_line,
    startColumn: row.start_column,
    endColumn: row.end_column,
    parentName: row.parent_name || undefined,
    repoPath: row.repo_path
  }))
}
```

- [ ] **Step 4: Add optional repoPath to CodeSymbol type**

In `src/main/services/code-parser.ts`, add to the interface:

```ts
export interface CodeSymbol {
  name: string
  kind: 'function' | 'method' | 'class' | 'interface' | 'type' | 'variable' | 'enum' | 'unknown'
  filePath: string
  startLine: number
  endLine: number
  startColumn: number
  endColumn: number
  parentName?: string
  repoPath?: string
}
```

- [ ] **Step 5: Update code:index-symbols IPC handler**

In `src/main/ipc-handlers.ts`, replace the handler (around line 136):

```ts
ipcMain.handle('code:index-symbols', async (_event, repoPath: string) => {
    const { initSymbolDatabase, indexSymbols, clearRepo } = await import('./services/symbol-index')
    const { extractSymbols, initParser } = await import('./services/code-parser')
    const { listRepoFiles } = await import('./services/file-system')

    console.log('[code:index-symbols] Starting index for:', repoPath)
    await initParser()
    const files = await listRepoFiles(repoPath)
    const codeFiles = files.filter((f) => !f.isDirectory).map((f) => f.absolutePath)
    console.log(`[code:index-symbols] Found ${codeFiles.length} code files`)

    const db = initSymbolDatabase(currentProjectPath!)
    clearRepo(db, repoPath)
    const symbols = await extractSymbols(codeFiles)
    indexSymbols(db, symbols, repoPath)
    console.log(`[code:index-symbols] Indexed ${symbols.length} symbols`)

    return { indexed: symbols.length, totalFiles: codeFiles.length }
  })
```

- [ ] **Step 6: Update code:query-symbols IPC handler**

```ts
ipcMain.handle('code:query-symbols', async (_event, name?: string, filePath?: string, kind?: string, repoPath?: string) => {
    const { initSymbolDatabase, querySymbols } = await import('./services/symbol-index')
    const db = initSymbolDatabase(currentProjectPath!)
    return querySymbols(db, name, filePath, kind, repoPath, name ? undefined : 50)
  })
```

- [ ] **Step 7: Update code:resolve-refs IPC handler**

```ts
ipcMain.handle('code:resolve-refs', async (_event, notePath: string, content: string, activeRepoPath?: string) => {
    const { parseRefs, resolveRefs } = await import('./services/ref-resolver')
    const { initSymbolDatabase, querySymbols } = await import('./services/symbol-index')
    const { saveRefCache } = await import('./services/ref-cache')

    const refs = parseRefs(content)
    if (refs.length === 0) return []

    const db = initSymbolDatabase(currentProjectPath!)
    const allSymbols = querySymbols(db)
    const mappings = await resolveRefs(refs, allSymbols, activeRepoPath)
    saveRefCache(currentProjectPath!, notePath, mappings)
    return mappings
  })
```

- [ ] **Step 8: Type check and commit**

```bash
npx tsc --noEmit
git add src/main/services/symbol-index.ts src/main/services/code-parser.ts src/main/ipc-handlers.ts
git commit -m "feat: add repo-scoped indexing, querying, and resolution to backend"
```

---

### Task 2: @ref parsing — add repo to RefSpec and classifyRef

**Files:**
- Modify: `src/main/services/ref-resolver.ts`

- [ ] **Step 1: Add repo field to RefSpec**

```ts
export interface RefSpec {
  raw: string
  repo?: string
  filePath?: string
  line?: number
  name?: string
}
```

- [ ] **Step 2: Update classifyRef to detect repo as first segment**

Replace `classifyRef`:

```ts
function classifyRef(raw: string): RefSpec {
  const parts = raw.split(':')

  let repo: string | undefined
  let filePath: string | undefined
  let line: number | undefined
  let name: string | undefined

  // First segment is a repo if it's not all-digits and doesn't contain '/'
  let startIndex = 0
  if (parts.length > 1 && !parts[0].includes('/') && !/^\d+$/.test(parts[0])) {
    repo = parts[0]
    startIndex = 1
  }

  for (let i = startIndex; i < parts.length; i++) {
    const part = parts[i]
    if (part.includes('/')) {
      filePath = part
    } else if (/^\d+$/.test(part)) {
      line = parseInt(part, 10)
    } else {
      name = part
    }
  }

  return { raw, repo, filePath, line, name }
}
```

- [ ] **Step 3: Type check and commit**

```bash
npx tsc --noEmit
git add src/main/services/ref-resolver.ts
git commit -m "feat: add repo prefix parsing to @ref references"
```

---

### Task 3: Resolution — repo-filtered resolveRefs

**Files:**
- Modify: `src/main/services/ref-resolver.ts`

- [ ] **Step 1: Rewrite resolveRefs with repo filtering**

Replace `resolveRefs` signature and body. The function now filters symbols by repo before applying T1-T5:

```ts
export async function resolveRefs(
  refs: RefSpec[],
  symbols: (CodeSymbol & { repoPath?: string })[],
  activeRepo?: string
): Promise<CodeMapping[]> {
  const mappings: CodeMapping[] = []

  for (const ref of refs) {
    const targetRepo = ref.repo ?? activeRepo ?? undefined

    let candidateSymbols = symbols
    if (targetRepo) {
      candidateSymbols = symbols.filter(
        (s) => s.repoPath && (
          s.repoPath.endsWith('/' + targetRepo) ||
          s.repoPath === targetRepo
        )
      )
    }

    // Build file lookup from filtered candidates
    const symbolsByFile = new Map<string, CodeSymbol[]>()
    for (const s of candidateSymbols) {
      const list = symbolsByFile.get(s.filePath)
      if (list) { list.push(s) }
      else { symbolsByFile.set(s.filePath, [s]) }
    }

    const getFileSymbols = (refPath: string): CodeSymbol[] | undefined => {
      const direct = symbolsByFile.get(refPath)
      if (direct) return direct
      for (const [absPath, syms] of symbolsByFile) {
        if (absPath.endsWith('/' + refPath) || absPath === refPath) {
          return syms
        }
      }
      return undefined
    }

    // T1: file + line + name
    if (ref.filePath && ref.line !== undefined && ref.name) {
      const fileSymbols = getFileSymbols(ref.filePath)
      if (fileSymbols) {
        const match = fileSymbols.find(
          (s) => s.startLine <= ref.line! && s.endLine >= ref.line! && symbolMatchesName(s, ref.name!)
        )
        if (match) {
          const mapping = toMapping(ref, match)
          if (mapping.filePath && mapping.startLine) {
            mapping.codeSnippet = await extractCodeSnippet(mapping.filePath, mapping.startLine)
          }
          mappings.push(mapping)
          continue
        }
      }
    }

    // T2: file + line
    if (ref.filePath && ref.line !== undefined) {
      const fileSymbols = getFileSymbols(ref.filePath)
      if (fileSymbols) {
        const match = fileSymbols.find((s) => s.startLine <= ref.line! && s.endLine >= ref.line!)
        if (match) {
          const mapping = toMapping(ref, match)
          if (mapping.filePath && mapping.startLine) {
            mapping.codeSnippet = await extractCodeSnippet(mapping.filePath, mapping.startLine)
          }
          mappings.push(mapping)
          continue
        }
      }
    }

    // T3: file + name
    if (ref.filePath && ref.name) {
      const fileSymbols = getFileSymbols(ref.filePath)
      if (fileSymbols) {
        const match = findSymbolByName(fileSymbols, ref.name)
        if (match) {
          const mapping = toMapping(ref, match)
          if (mapping.filePath && mapping.startLine) {
            mapping.codeSnippet = await extractCodeSnippet(mapping.filePath, mapping.startLine)
          }
          mappings.push(mapping)
          continue
        }
      }
    }

    // T4: Class.method (across candidate files)
    if (ref.name && ref.name.includes('.')) {
      const match = findSymbolByName(candidateSymbols, ref.name)
      if (match) {
        const mapping = toMapping(ref, match)
        if (mapping.filePath && mapping.startLine) {
          mapping.codeSnippet = await extractCodeSnippet(mapping.filePath, mapping.startLine)
        }
        mappings.push(mapping)
        continue
      }
    }

    // T5: name only (across candidate files)
    if (ref.name) {
      const match = candidateSymbols.find((s) => s.name === ref.name)
      if (match) {
        const mapping = toMapping(ref, match)
        if (mapping.filePath && mapping.startLine) {
          mapping.codeSnippet = await extractCodeSnippet(mapping.filePath, mapping.startLine)
        }
        mappings.push(mapping)
        continue
      }
    }

    // No match — silently drop
  }

  return mappings
}
```

- [ ] **Step 2: Type check and commit**

```bash
npx tsc --noEmit
git add src/main/services/ref-resolver.ts
git commit -m "feat: add repo-filtered resolution to resolveRefs"
```

---

### Task 4: Preload API — update resolveRefs signature

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add optional activeRepoPath parameter**

Change line 40:

```ts
resolveRefs: (notePath: string, content: string, activeRepoPath?: string) =>
  ipcRenderer.invoke('code:resolve-refs', notePath, content, activeRepoPath),
```

- [ ] **Step 2: Type check and commit**

```bash
npx tsc --noEmit
git add src/preload/index.ts
git commit -m "feat: add activeRepoPath parameter to resolveRefs preload API"
```

---

### Task 5: AppState — add codeRepos array

**Files:**
- Modify: `src/renderer/src/types/index.ts`
- Modify: `src/renderer/src/contexts/AppContext.tsx`

- [ ] **Step 1: Add codeRepos to types and AppState**

In `src/renderer/src/types/index.ts`, add to `AppState`:

```ts
export interface AppState {
  // ... existing fields ...
  codeRepos: CodeRepo[]
}
```

Add new action:

```ts
export type AppAction =
  // ... existing actions ...
  | { type: 'SET_CODE_REPOS'; repos: CodeRepo[] }
```

- [ ] **Step 2: Add to initialState and reducer**

In `AppContext.tsx`, add to `initialState`:

```ts
export const initialState: AppState = {
  // ... existing fields ...
  codeRepos: []
}
```

Add case to `appReducer`:

```ts
case 'SET_CODE_REPOS':
  return { ...state, codeRepos: action.repos }
```

- [ ] **Step 3: Type check and commit**

```bash
npx tsc --noEmit
git add src/renderer/src/types/index.ts src/renderer/src/contexts/AppContext.tsx
git commit -m "feat: add codeRepos to AppState for multi-repo awareness"
```

---

### Task 6: CodeFile type — add repoPath, update file openers

**Files:**
- Modify: `src/renderer/src/types/index.ts`
- Modify: `src/renderer/src/components/CodeDirectory.tsx`
- Modify: `src/renderer/src/hooks/useCodeNavigation.ts`

- [ ] **Step 1: Add repoPath to CodeFile**

In `src/renderer/src/types/index.ts`:

```ts
export interface CodeFile {
  path: string
  name: string
  language: string
  repoPath?: string
}
```

- [ ] **Step 2: Update CodeDirectory to set repoPath**

In `CodeDirectory.tsx`, add repo detection. First update the destructure to include `codeRepos`:

```ts
const { state, dispatch } = useAppContext()
const { codeRepoPath, codeRepos } = state
```

Update `handleFileSelect` (around line 155) to detect the repo:

```ts
const handleFileSelect = useCallback((file: RepoFileNode) => {
    if (file.isDirectory) return

    // Find which repo this file belongs to
    let fileRepoPath: string | undefined
    for (const repo of codeRepos) {
      const repoPrefix = repo.path.endsWith('/') ? repo.path : repo.path + '/'
      if (file.absolutePath.startsWith(repoPrefix)) {
        fileRepoPath = repo.path
        break
      }
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    const langMap: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
      py: 'python', rs: 'rust', go: 'go', cpp: 'cpp', c: 'c',
      css: 'css', html: 'html', json: 'json', md: 'markdown',
      png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
      webp: 'image', bmp: 'image', svg: 'image'
    }

    const codeFile: CodeFile = {
      path: file.absolutePath,
      name: file.name,
      language: langMap[ext] || 'plaintext',
      repoPath: fileRepoPath
    }

    dispatch({ type: 'OPEN_CODE_FILE', file: codeFile })
  }, [dispatch, codeRepos])
```

- [ ] **Step 3: Update useCodeNavigation to accept repoPath**

In `useCodeNavigation.ts`, update `navigateToCode`:

```ts
export function useCodeNavigation() {
  const { state, dispatch } = useAppContext()

  const navigateToCode = useCallback((filePath: string, startLine: number, repoPath?: string) => {
    const fileName = filePath.split('/').pop() || filePath
    const ext = filePath.split('.').pop()?.toLowerCase() || ''
    const langMap: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
      py: 'python', rs: 'rust', go: 'go', cpp: 'cpp', c: 'c',
      css: 'css', html: 'html', json: 'json', md: 'markdown',
      png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
      webp: 'image', bmp: 'image', svg: 'image'
    }

    const codeFile: CodeFile = {
      path: filePath,
      name: fileName,
      language: langMap[ext] || 'plaintext',
      repoPath: repoPath
    }

    dispatch({ type: 'OPEN_CODE_FILE', file: codeFile })
    dispatch({ type: 'SET_PENDING_SCROLL', filePath, line: startLine })
  }, [dispatch])

  return { navigateToCode }
}
```

- [ ] **Step 4: Type check and commit**

```bash
npx tsc --noEmit
git add src/renderer/src/types/index.ts src/renderer/src/components/CodeDirectory.tsx src/renderer/src/hooks/useCodeNavigation.ts
git commit -m "feat: add repoPath to CodeFile and detect repo when opening files"
```

---

### Task 7: WorkspaceToolbar — colored dots, per-repo re-index, sync codeRepos

**Files:**
- Modify: `src/renderer/src/components/WorkspaceToolbar.tsx`
- Modify: `src/renderer/src/components/WorkspaceToolbar.css`

- [ ] **Step 1: Add color palette constant**

At the top of `WorkspaceToolbar.tsx`:

```ts
const REPO_COLORS = ['#e06c75', '#61afef', '#98c379', '#d19a66', '#c678dd', '#56b6c2', '#e5c07b', '#abb2bf']

function getRepoColor(index: number): string {
  return REPO_COLORS[index % REPO_COLORS.length]
}
```

- [ ] **Step 2: Dispatch codeRepos to AppState wherever it changes**

After every `setCodeRepos(newRepos)` call, add:

```ts
dispatch({ type: 'SET_CODE_REPOS', repos: newRepos })
```

Do this in: `handleAddRepo`, `handleRemoveRepo`, and the `useEffect` that loads config (around line 52).

- [ ] **Step 3: Replace repo chips rendering**

Replace the `codeRepos.map(...)` section (lines 173-187) and the re-index button (lines 195-211) with:

```tsx
<div className="workspace-toolbar-repos">
  {codeRepos.map((repo, index) => (
    <span
      key={repo.path}
      className={`workspace-toolbar-repo-chip${state.codeRepoPath === repo.path ? ' active' : ''}`}
      title={repo.path}
      onClick={() => {
        dispatch({ type: 'SET_CODE_REPO', path: repo.path })
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        handleRemoveRepo(repo.path)
      }}
    >
      <span
        className="repo-chip-dot"
        style={{ backgroundColor: getRepoColor(index) }}
      />
      {repo.path.split('/').pop() || repo.path}
      <button
        className="repo-chip-reindex"
        title={`Re-index ${repo.path.split('/').pop()}`}
        onClick={(e) => {
          e.stopPropagation()
          window.electronAPI.indexSymbols(repo.path).then((result) => {
            console.log(`Indexed ${result.indexed} symbols in ${repo.path}`)
          }).catch((err) => {
            console.error('Failed to re-index symbols:', err)
          })
        }}
      >
        &#x21bb;
      </button>
    </span>
  ))}
  <button
    className="workspace-toolbar-btn workspace-toolbar-action"
    onClick={handleAddRepo}
  >
    + Add Repo
  </button>
</div>
```

Remove the old bulk "Re-index" button entirely.

- [ ] **Step 4: Add CSS**

In `WorkspaceToolbar.css`, add:

```css
.workspace-toolbar-repo-chip.active {
  border-color: var(--accent-color);
  background: rgba(255, 255, 255, 0.08);
}

.repo-chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.repo-chip-reindex {
  margin-left: 2px;
  padding: 0 2px;
  font-size: 12px;
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  opacity: 0.5;
  line-height: 1;
}

.repo-chip-reindex:hover {
  opacity: 1;
}
```

- [ ] **Step 5: Type check and commit**

```bash
npx tsc --noEmit
git add src/renderer/src/components/WorkspaceToolbar.tsx src/renderer/src/components/WorkspaceToolbar.css
git commit -m "feat: add repo colors, active state, per-repo re-index, and codeRepos sync"
```

---

### Task 8: CodeViewport — repo-colored tabs, @ref with repo prefix

**Files:**
- Modify: `src/renderer/src/components/CodeViewport.tsx`
- Modify: `src/renderer/src/components/CodeViewport.css`

- [ ] **Step 1: Add repo color helper and palette**

At the top of `CodeViewport.tsx`:

```ts
const REPO_COLORS = ['#e06c75', '#61afef', '#98c379', '#d19a66', '#c678dd', '#56b6c2', '#e5c07b', '#abb2bf']

function getRepoColorByPath(repoPath: string | undefined, codeRepos: Array<{ path: string }>): string | undefined {
  if (!repoPath) return undefined
  const index = codeRepos.findIndex((r) => r.path === repoPath)
  if (index < 0) return undefined
  return REPO_COLORS[index % REPO_COLORS.length]
}
```

- [ ] **Step 2: Render colored dots and underlines on tabs**

Replace the tab bar rendering (lines 258-273):

```tsx
<div className="code-tab-bar">
  {openCodeFiles.map((file, index) => {
    const repoColor = getRepoColorByPath(file.repoPath, state.codeRepos)
    return (
      <div
        key={file.path}
        className={`code-tab ${index === activeCodeFileIndex ? 'active' : ''}`}
        style={repoColor && index === activeCodeFileIndex
          ? { borderBottomColor: repoColor }
          : undefined
        }
        onClick={() => handleSelectTab(index)}
      >
        {repoColor && (
          <span
            className="code-tab-repo-dot"
            style={{ backgroundColor: repoColor }}
          />
        )}
        <span>{file.name}</span>
        <button
          className="code-tab-close"
          onClick={(e) => handleCloseTab(index, e)}
        >
          ×
        </button>
      </div>
    )
  })}
</div>
```

- [ ] **Step 3: Update drag handler to include repo in @ref**

Replace the `onDragStart` handler (around line 292):

```ts
onDragStart={(e) => {
  const sym = selectedSymbolRef.current
  if (!sym || !activeFile) {
    e.preventDefault()
    return
  }
  let relPath = sym.filePath
  let repoName: string | undefined
  for (const repo of state.codeRepos) {
    const prefix = repo.path.endsWith('/') ? repo.path : repo.path + '/'
    if (sym.filePath.startsWith(prefix)) {
      relPath = sym.filePath.slice(prefix.length)
      repoName = repo.path.split('/').pop() || repo.path
      break
    }
  }
  const displayName = sym.parentName ? `${sym.parentName}.${sym.name}` : sym.name
  const refText = repoName
    ? `@ref(${repoName}:${relPath}:${sym.startLine}:${displayName})`
    : `@ref(${relPath}:${sym.startLine}:${displayName})`
  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData('text/plain', refText)
}}
```

- [ ] **Step 4: Update handleSymbolSelect to include repo in @ref**

Replace `handleSymbolSelect` (around line 114):

```ts
const handleSymbolSelect = useCallback((sym: CodeSymbol) => {
  let relPath = sym.filePath
  let repoName: string | undefined
  for (const repo of state.codeRepos) {
    const prefix = repo.path.endsWith('/') ? repo.path : repo.path + '/'
    if (sym.filePath.startsWith(prefix)) {
      relPath = sym.filePath.slice(prefix.length)
      repoName = repo.path.split('/').pop() || repo.path
      break
    }
  }

  const displayName = sym.parentName ? `${sym.parentName}.${sym.name}` : sym.name
  const refText = repoName
    ? `@ref(${repoName}:${relPath}:${sym.startLine}:${displayName})`
    : `@ref(${relPath}:${sym.startLine}:${displayName})`

  window.dispatchEvent(new CustomEvent('symbol-insert', { detail: refText }))
  setSymbolPickerOpen(false)
}, [state.codeRepos])
```

- [ ] **Step 5: Add CSS for repo dot on tabs**

In `CodeViewport.css`, add:

```css
.code-tab-repo-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}
```

- [ ] **Step 6: Type check and commit**

```bash
npx tsc --noEmit
git add src/renderer/src/components/CodeViewport.tsx src/renderer/src/components/CodeViewport.css
git commit -m "feat: add repo-colored tabs and repo-prefixed @ref generation to CodeViewport"
```

---

### Task 9: NoteViewport and MdEditor — pass activeRepo to resolveRefs

**Files:**
- Modify: `src/renderer/src/components/NoteViewport.tsx`
- Modify: `src/renderer/src/components/editors/MdEditor.tsx`

- [ ] **Step 1: Add codeRepoPath to MdEditorProps**

In `MdEditor.tsx`, update the interface:

```ts
interface MdEditorProps {
  content: string
  notePath: string
  workspacePath: string | null
  codeRepoPath: string | null
  onSave: (content: string) => Promise<void>
  onRefClick?: (refName: string) => void
  codeMappings?: CodeMapping[]
}
```

Update destructure:

```ts
function MdEditor({ content, notePath, workspacePath, codeRepoPath, onSave, onRefClick, codeMappings }, ref) {
```

Update the `resolveRefs` call in the preview `useEffect` (around line 64):

```ts
window.electronAPI.resolveRefs(notePath, value, codeRepoPath ?? undefined)
```

- [ ] **Step 2: Update NoteViewport calls**

In `NoteViewport.tsx`, update the `useEffect` that resolves refs (around line 45):

```ts
window.electronAPI.resolveRefs(selectedNoteId, contentStr, state.codeRepoPath ?? undefined)
```

Pass `codeRepoPath` to `MdEditor`:

```tsx
<MdEditor
  ref={mdEditorRef}
  content={activeNoteContent as string}
  notePath={selectedNoteId}
  workspacePath={state.workspacePath}
  codeRepoPath={state.codeRepoPath}
  codeMappings={codeMappings}
  ...
/>
```

- [ ] **Step 3: Type check and commit**

```bash
npx tsc --noEmit
git add src/renderer/src/components/NoteViewport.tsx src/renderer/src/components/editors/MdEditor.tsx
git commit -m "feat: pass activeRepo to resolveRefs from NoteViewport and MdEditor"
```

---

### Task 10: live-server — update REST API endpoints

**Files:**
- Modify: `src/main/services/live-server.ts`

- [ ] **Step 1: Update /api/code/symbols to accept repoPath**

In `live-server.ts`, update line 228:

```ts
app.get('/api/code/symbols', async (req: Request, res: Response) => {
    const name = req.query.name as string | undefined
    const filePath = req.query.file as string | undefined
    const kind = req.query.kind as string | undefined
    const repoPath = req.query.repo as string | undefined

    let db: Database.Database | null = null
    try {
      db = getDb(projectPath)
      const results = querySymbols(db, name, filePath, kind, repoPath)
      res.json(results)
    } catch (e) {
      res.status(500).json({ error: String(e) })
    }
  })
```

- [ ] **Step 2: Update /api/code/resolve-refs to accept repo filter**

In `live-server.ts`, update line 244:

```ts
app.get('/api/code/resolve-refs', async (req: Request, res: Response) => {
    try {
      const { parseRefs, resolveRefs } = await import('./ref-resolver')
      const { saveRefCache } = await import('./ref-cache')
      const content = req.query.content as string
      const notePath = req.query.notePath as string | undefined
      const activeRepo = req.query.repo as string | undefined

      if (!content) { res.json([]); return }

      const refs = parseRefs(content)
      if (refs.length === 0) { res.json([]); return }

      const db = getDb(projectPath)
      const allSymbols = querySymbols(db)
      const mappings = await resolveRefs(refs, allSymbols, activeRepo)
      if (notePath) {
        saveRefCache(projectPath, notePath, mappings)
      }
      res.json(mappings)
    } catch (e) {
      res.status(500).json({ error: String(e) })
    }
  })
```

- [ ] **Step 3: Type check and commit**

```bash
npx tsc --noEmit
git add src/main/services/live-server.ts
git commit -m "feat: add repoPath support to live-server REST API"
```

---

### Task 11: Final build verification

- [ ] **Step 1: Full type check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Full production build**

```bash
npm run build
```

Expected: All three bundles build successfully.

- [ ] **Step 3: Commit verification**

```bash
git commit --allow-empty -m "chore: final integration verification for multi-repo support"
```
