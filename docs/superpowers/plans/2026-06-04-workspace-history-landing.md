# Workspace History & Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add workspace history (LRU, max 10) to the landing page, allow navigating back via toolbar project name click, improve Create Workspace flow (name-first), and validate workspace directories on open.

**Architecture:** Main process manages history in `workspace.json` (userData dir). LRU logic is centralized in `workspace.ts` — all history mutations go through main process IPC. Renderer is a thin display layer.

**Tech Stack:** Electron, React 18, TypeScript, vitest, @testing-library/react

---

### Task 1: Rewrite workspace.ts with history CRUD and LRU

**Files:**
- Modify: `src/main/services/workspace.ts`
- Modify: `tests/main/workspace.test.ts`

- [ ] **Step 1: Write the failing tests for new history functions**

```ts
// tests/main/workspace.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('electron', () => ({
  app: {
    getPath: () => join(process.cwd(), 'test-temp', 'workspace-test'),
  },
}))

describe('workspace', () => {
  const testDataDir = join(process.cwd(), 'test-temp', 'workspace-test')

  beforeEach(() => {
    mkdirSync(testDataDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true })
    }
  })

  it('adds entry to history', async () => {
    const { addToHistory, getHistory } = await import('../../src/main/services/workspace')
    await addToHistory('/path/a', 'Project A')
    const history = await getHistory()
    expect(history).toHaveLength(1)
    expect(history[0].path).toBe('/path/a')
    expect(history[0].name).toBe('Project A')
    expect(history[0].lastOpened).toBeGreaterThan(0)
  })

  it('upserts existing entry and moves it to front (LRU)', async () => {
    const { addToHistory, getHistory } = await import('../../src/main/services/workspace')
    await addToHistory('/path/a', 'Project A')
    await addToHistory('/path/b', 'Project B')
    await addToHistory('/path/a', 'Project A') // re-open A — should move to front
    const history = await getHistory()
    expect(history).toHaveLength(2)
    expect(history[0].path).toBe('/path/a')
    expect(history[1].path).toBe('/path/b')
  })

  it('trims history to 10 entries', async () => {
    const { addToHistory, getHistory } = await import('../../src/main/services/workspace')
    for (let i = 0; i < 12; i++) {
      await addToHistory(`/path/${i}`, `Project ${i}`)
    }
    const history = await getHistory()
    expect(history).toHaveLength(10)
    // Most recent should be first
    expect(history[0].path).toBe('/path/11')
  })

  it('removes entry from history', async () => {
    const { addToHistory, removeFromHistory, getHistory } = await import('../../src/main/services/workspace')
    await addToHistory('/path/a', 'Project A')
    await addToHistory('/path/b', 'Project B')
    await removeFromHistory('/path/a')
    const history = await getHistory()
    expect(history).toHaveLength(1)
    expect(history[0].path).toBe('/path/b')
  })

  it('getHistory returns empty array when no history exists', async () => {
    const { getHistory } = await import('../../src/main/services/workspace')
    const history = await getHistory()
    expect(history).toEqual([])
  })

  it('loadLastWorkspacePath returns first entry path', async () => {
    const { addToHistory, loadLastWorkspacePath } = await import('../../src/main/services/workspace')
    await addToHistory('/path/a', 'Project A')
    await addToHistory('/path/b', 'Project B')
    const result = await loadLastWorkspacePath()
    expect(result).toBe('/path/b')
  })

  it('loadLastWorkspacePath returns null when history is empty', async () => {
    const { loadLastWorkspacePath } = await import('../../src/main/services/workspace')
    const result = await loadLastWorkspacePath()
    expect(result).toBeNull()
  })

  it('migrates old { lastPath } format to new history format', async () => {
    // Write old-format workspace.json
    writeFileSync(join(testDataDir, 'workspace.json'), JSON.stringify({ lastPath: '/old/path' }))
    const { getHistory, loadLastWorkspacePath } = await import('../../src/main/services/workspace')
    const history = await getHistory()
    expect(history).toHaveLength(1)
    expect(history[0].path).toBe('/old/path')
    expect(history[0].name).toBe('path')
    const lastPath = await loadLastWorkspacePath()
    expect(lastPath).toBe('/old/path')
  })

  it('handles corrupted workspace.json gracefully', async () => {
    writeFileSync(join(testDataDir, 'workspace.json'), 'not json {{{')
    const { getHistory } = await import('../../src/main/services/workspace')
    const history = await getHistory()
    expect(history).toEqual([])
  })

  // Keep existing validateWorkspacePath tests
  it('validates existing workspace path', async () => {
    const { validateWorkspacePath } = await import('../../src/main/services/workspace')
    const { tmpdir } = await import('node:os')
    const testDir = join(tmpdir(), `ws-test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
    expect(validateWorkspacePath(testDir)).toBe(true)
    expect(validateWorkspacePath('/nonexistent/xyz')).toBe(false)
    rmSync(testDir, { recursive: true, force: true })
  })

  it('rejects non-absolute paths', async () => {
    const { validateWorkspacePath } = await import('../../src/main/services/workspace')
    expect(validateWorkspacePath('relative/path')).toBe(false)
    expect(validateWorkspacePath('')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/main/workspace.test.ts`
Expected: FAIL — `addToHistory`, `getHistory`, `removeFromHistory` not exported

- [ ] **Step 3: Rewrite workspace.ts with full history support**

```ts
// src/main/services/workspace.ts
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const WORKSPACE_FILE = 'workspace.json'

export interface WorkspaceHistoryEntry {
  path: string
  name: string
  lastOpened: number
}

interface WorkspaceData {
  history: WorkspaceHistoryEntry[]
}

const MAX_HISTORY = 10

function getWorkspaceFilePath(): string {
  return path.join(app.getPath('userData'), WORKSPACE_FILE)
}

function readWorkspaceData(): WorkspaceData {
  const filePath = getWorkspaceFilePath()
  if (!fs.existsSync(filePath)) {
    return { history: [] }
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw)
    // Migration: old format { lastPath: "..." }
    if (data.lastPath && !data.history) {
      return {
        history: [{ path: data.lastPath, name: path.basename(data.lastPath), lastOpened: Date.now() }]
      }
    }
    if (Array.isArray(data.history)) {
      return { history: data.history }
    }
    return { history: [] }
  } catch {
    return { history: [] }
  }
}

function writeWorkspaceData(data: WorkspaceData): void {
  const filePath = getWorkspaceFilePath()
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

export async function addToHistory(workspacePath: string, name: string): Promise<void> {
  const data = readWorkspaceData()
  // Remove existing entry with same path
  data.history = data.history.filter((e) => e.path !== workspacePath)
  // Insert at front
  data.history.unshift({ path: workspacePath, name, lastOpened: Date.now() })
  // Trim to max
  if (data.history.length > MAX_HISTORY) {
    data.history = data.history.slice(0, MAX_HISTORY)
  }
  writeWorkspaceData(data)
}

export async function getHistory(): Promise<WorkspaceHistoryEntry[]> {
  return readWorkspaceData().history
}

export async function removeFromHistory(workspacePath: string): Promise<void> {
  const data = readWorkspaceData()
  data.history = data.history.filter((e) => e.path !== workspacePath)
  writeWorkspaceData(data)
}

export async function loadLastWorkspacePath(): Promise<string | null> {
  const { history } = readWorkspaceData()
  if (history.length === 0) return null
  return history[0].path
}

// Deprecated — kept for backward compat only during migration
export async function saveLastWorkspacePath(workspacePath: string): Promise<void> {
  await addToHistory(workspacePath, path.basename(workspacePath))
}

export function validateWorkspacePath(workspacePath: string): boolean {
  if (!workspacePath || !path.isAbsolute(workspacePath)) return false
  try {
    fs.accessSync(workspacePath, fs.constants.R_OK | fs.constants.W_OK)
    const stat = fs.statSync(workspacePath)
    return stat.isDirectory()
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/main/workspace.test.ts`
Expected: All 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/workspace.ts tests/main/workspace.test.ts
git commit -m "feat: add workspace history CRUD with LRU and migration from old format"
```

---

### Task 2: Add new IPC handlers and update existing ones

**Files:**
- Modify: `src/main/ipc-handlers.ts`

- [ ] **Step 1: Update ipc-handlers.ts with history handlers and validation**

No test file here — IPC handlers are integration-tested via the app. Changes are straightforward wiring.

In `src/main/ipc-handlers.ts`, add the following handlers inside `registerIpcHandlers`:

**After `workspace:get-current` block (line ~125), add:**

```ts
// Workspace history
ipcMain.handle('workspace:get-history', async () => {
  const { getHistory } = await import('./services/workspace')
  return getHistory()
})

ipcMain.handle('workspace:remove-from-history', async (_event, workspacePath: string) => {
  const { removeFromHistory } = await import('./services/workspace')
  return removeFromHistory(workspacePath)
})
```

**Replace the `workspace:create` handler (line ~103-109) with:**

```ts
ipcMain.handle('workspace:create', async (_event, dirPath: string): Promise<string> => {
  const fs = await import('node:fs/promises')
  const path = await import('node:path')
  // Ensure directory is empty
  const entries = await fs.readdir(dirPath)
  const nonHidden = entries.filter((e) => e !== '.DS_Store')
  if (nonHidden.length > 0) {
    throw new Error('Selected directory is not empty. Please choose an empty folder.')
  }
  // Initialize notebook.json
  const name = path.basename(dirPath)
  const configPath = path.join(dirPath, 'notebook.json')
  await fs.writeFile(configPath, JSON.stringify({ name, notesPath: './', codeRepos: [] }, null, 2), 'utf-8')
  // Create notes directory
  await fs.mkdir(path.join(dirPath, 'notes'), { recursive: true })
  return dirPath
})
```

**Replace the `workspace:open` handler (line ~111-121) with:**

```ts
ipcMain.handle('workspace:open', async (_event, newPath: string): Promise<NotebookConfig> => {
  const { validateWorkspacePath, addToHistory } = await import('./services/workspace')
  const path = await import('node:path')
  const fs = await import('node:fs/promises')

  if (!validateWorkspacePath(newPath)) {
    throw new Error(`Invalid workspace path: ${newPath}`)
  }

  // Validate it's a real workspace (has notebook.json)
  const configPath = path.join(newPath, 'notebook.json')
  try {
    await fs.access(configPath)
  } catch {
    throw new Error('Selected folder is not a valid workspace')
  }

  currentProjectPath = newPath
  closeDatabase()
  initDatabase(newPath)
  const config = await loadConfig(newPath)
  await addToHistory(newPath, config.name || path.basename(newPath))
  return config
})
```

**Add a clear-workspace handler after the history handlers:**

```ts
ipcMain.handle('workspace:clear', async () => {
  currentProjectPath = null
})
```

- [ ] **Step 2: Run existing tests to verify no regressions**

Run: `npx vitest run tests/main/`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc-handlers.ts
git commit -m "feat: add workspace history IPC handlers, validation, and create/open flow changes"
```

---

### Task 3: Update preload API and type declarations

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/types/electron.d.ts`

- [ ] **Step 1: Add new API methods to preload**

In `src/preload/index.ts`, add to the `api` object (after `getWorkspacePath`):

```ts
getWorkspaceHistory: (): Promise<Array<{ path: string; name: string; lastOpened: number }>> =>
  ipcRenderer.invoke('workspace:get-history'),
removeFromWorkspaceHistory: (workspacePath: string): Promise<void> =>
  ipcRenderer.invoke('workspace:remove-from-history', workspacePath),
clearWorkspace: (): Promise<void> =>
  ipcRenderer.invoke('workspace:clear'),
```

- [ ] **Step 2: Update electron.d.ts with new API types**

In `src/renderer/src/types/electron.d.ts`, add to the `Window.electronAPI` interface (after `getWorkspacePath`):

```ts
getWorkspaceHistory: () => Promise<Array<{ path: string; name: string; lastOpened: number }>>
removeFromWorkspaceHistory: (workspacePath: string) => Promise<void>
clearWorkspace: () => Promise<void>
```

- [ ] **Step 3: Add WorkspaceHistoryEntry to renderer types**

In `src/renderer/src/types/index.ts`, add:

```ts
export interface WorkspaceHistoryEntry {
  path: string
  name: string
  lastOpened: number
}
```

Add to `AppAction` union type:

```ts
| { type: 'SET_WORKSPACE_HISTORY'; history: WorkspaceHistoryEntry[] }
```

Add to `AppState` interface:

```ts
workspaceHistory: WorkspaceHistoryEntry[]
```

Update `initialState` in `src/renderer/src/contexts/AppContext.tsx` by adding:

```ts
workspaceHistory: [],
```

And add the reducer case:

```ts
case 'SET_WORKSPACE_HISTORY':
  return { ...state, workspaceHistory: action.history }
```

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/renderer/src/types/electron.d.ts src/renderer/src/types/index.ts src/renderer/src/contexts/AppContext.tsx
git commit -m "feat: add workspace history types, preload API, and context state"
```

---

### Task 4: Update renderer tests

**Files:**
- Modify: `tests/renderer/AppContext.test.tsx`
- Modify: `tests/renderer/WorkspaceToolbar.test.tsx`

- [ ] **Step 1: Add reducer test for SET_WORKSPACE_HISTORY**

In `tests/renderer/AppContext.test.tsx`, add:

```ts
it('SET_WORKSPACE_HISTORY updates workspace history', () => {
  const entries = [
    { path: '/a', name: 'A', lastOpened: 1000 },
    { path: '/b', name: 'B', lastOpened: 2000 },
  ]
  const state = appReducer(initialState, { type: 'SET_WORKSPACE_HISTORY', history: entries })
  expect(state.workspaceHistory).toEqual(entries)
})
```

- [ ] **Step 2: Update WorkspaceToolbar tests for new API mocks and features**

In `tests/renderer/WorkspaceToolbar.test.tsx`, add to the `beforeEach` mock setup:

```ts
getWorkspaceHistory: vi.fn().mockResolvedValue([]),
removeFromWorkspaceHistory: vi.fn().mockResolvedValue(undefined),
clearWorkspace: vi.fn().mockResolvedValue(undefined),
```

Also update the existing `electornAPI` mock to include `createWorkspace`:

```ts
createWorkspace: vi.fn().mockResolvedValue('/test/new-workspace'),
```

Add new test for history display:

```ts
it('renders history list when history is available', async () => {
  window.electronAPI.getWorkspaceHistory = vi.fn().mockResolvedValue([
    { path: '/path/a', name: 'Project A', lastOpened: 2000 },
    { path: '/path/b', name: 'Project B', lastOpened: 1000 },
  ])
  render(
    <AppProvider initialStateOverride={{
      ...initialState,
      workspaceHistory: [
        { path: '/path/a', name: 'Project A', lastOpened: 2000 },
        { path: '/path/b', name: 'Project B', lastOpened: 1000 },
      ],
    }}>
      <WorkspaceToolbar />
    </AppProvider>
  )
  expect(screen.getByText('Recent Workspaces')).toBeDefined()
  expect(screen.getByText('Project A')).toBeDefined()
  expect(screen.getByText('Project B')).toBeDefined()
})
```

Add test for history hidden when empty:

```ts
it('hides recent workspaces section when history is empty', () => {
  render(
    <AppProvider initialStateOverride={{
      ...initialState,
      workspaceHistory: [],
    }}>
      <WorkspaceToolbar />
    </AppProvider>
  )
  expect(screen.queryByText('Recent Workspaces')).toBeNull()
})
```

Update the landing page test to check for "Open Workspace" instead of "Open Folder":

```ts
it('renders landing page when no workspace is open', () => {
  render(
    <AppProvider initialStateOverride={{
      ...initialState,
      workspacePath: null, workspaceName: '',
    }}>
      <WorkspaceToolbar />
    </AppProvider>
  )
  expect(screen.getByText('Code Note Studio')).toBeDefined()
  expect(screen.getByText('Open Workspace')).toBeDefined()
})
```

- [ ] **Step 3: Run tests to verify they fail (new UI not yet implemented)**

Run: `npx vitest run tests/renderer/`
Expected: FAIL on new tests

- [ ] **Step 4: Commit**

```bash
git add tests/renderer/AppContext.test.tsx tests/renderer/WorkspaceToolbar.test.tsx
git commit -m "test: add tests for workspace history state, landing page history list, and new API mocks"
```

---

### Task 5: Implement WorkspaceToolbar UI changes

**Files:**
- Modify: `src/renderer/src/components/WorkspaceToolbar.tsx`
- Modify: `src/renderer/src/components/WorkspaceToolbar.css`

- [ ] **Step 1: Update WorkspaceToolbar.tsx**

Replace the entire `WorkspaceToolbar` component with the updated version. Key changes:

1. **Load history on mount** — fetch `getWorkspaceHistory()` and dispatch
2. **Click workspace name → landing** — add onClick to `📁 {workspaceName}` span
3. **New Workspace flow** — select folder, then prompt for name, create via IPC
4. **Open Workspace** — rename button text, add validation error handling
5. **History list in landing page** — render history items below buttons
6. **History item click** — validate + open or alert + remove

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppContext } from '../contexts/AppContext'
import type { WorkspaceHistoryEntry } from '../types'
import './WorkspaceToolbar.css'

const REPO_COLORS = ['#e06c75', '#61afef', '#98c379', '#d19a66', '#c678dd', '#56b6c2', '#e5c07b', '#abb2bf']

function getRepoColor(index: number): string {
  return REPO_COLORS[index % REPO_COLORS.length]
}

export function WorkspaceToolbar() {
  const { state, dispatch } = useAppContext()
  const { workspacePath, workspaceName, workspaceHistory } = state
  const [codeRepos, setCodeRepos] = useState<Array<{ path: string; commit: string }>>([])
  const restoringRef = useRef(false)

  // Load history on mount
  useEffect(() => {
    window.electronAPI.getWorkspaceHistory().then((history) => {
      dispatch({ type: 'SET_WORKSPACE_HISTORY', history })
    })
  }, [dispatch])

  const restoreUiState = useCallback(async () => {
    const saved = await window.electronAPI.loadUiState()
    if (!saved) return

    restoringRef.current = true

    if (saved.selectedNoteId) {
      const notes = await window.electronAPI.listNotes()
      dispatch({ type: 'SET_NOTES', notes })
      const note = notes.find((n) => n.relativePath === saved.selectedNoteId)
      if (note) {
        dispatch({ type: 'SELECT_NOTE', noteId: saved.selectedNoteId })
        const content = await window.electronAPI.readNote(saved.selectedNoteId)
        dispatch({ type: 'SET_ACTIVE_NOTE_CONTENT', content, noteType: note.type })
      }
    }

    if (saved.codeRepoPath) {
      dispatch({ type: 'SET_CODE_REPO', path: saved.codeRepoPath })
    }

    if (saved.openCodeFiles && saved.openCodeFiles.length > 0) {
      for (const file of saved.openCodeFiles) {
        dispatch({ type: 'OPEN_CODE_FILE', file })
      }
      if (saved.activeCodeFileIndex >= 0) {
        dispatch({ type: 'SET_ACTIVE_CODE_FILE', index: saved.activeCodeFileIndex })
      }
    }

    restoringRef.current = false
  }, [dispatch])

  useEffect(() => {
    window.electronAPI.getWorkspacePath().then((savedPath) => {
      if (savedPath) {
        window.electronAPI.loadConfig().then((config) => {
          dispatch({ type: 'SET_WORKSPACE', path: savedPath, name: config.name || savedPath })
          setCodeRepos(config.codeRepos || [])
          dispatch({ type: 'SET_CODE_REPOS', repos: config.codeRepos || [] })
          restoreUiState()
        })
      }
    })
  }, [])

  const openWorkspaceByPath = useCallback(async (wsPath: string) => {
    try {
      const config = await window.electronAPI.openWorkspace(wsPath)
      dispatch({ type: 'SET_WORKSPACE', path: wsPath, name: config.name || wsPath })
      setCodeRepos(config.codeRepos || [])
      const notes = await window.electronAPI.listNotes()
      dispatch({ type: 'SET_NOTES', notes })
      for (const repo of config.codeRepos || []) {
        window.electronAPI.indexSymbols(repo.path).catch((err) => {
          console.error('Failed to index symbols for repo:', repo.path, err)
        })
      }
      // Refresh history after opening
      const history = await window.electronAPI.getWorkspaceHistory()
      dispatch({ type: 'SET_WORKSPACE_HISTORY', history })
      restoreUiState()
    } catch (err: any) {
      alert(err.message || 'Failed to open workspace')
      // Remove invalid entry from history
      await window.electronAPI.removeFromWorkspaceHistory(wsPath)
      const history = await window.electronAPI.getWorkspaceHistory()
      dispatch({ type: 'SET_WORKSPACE_HISTORY', history })
    }
  }, [dispatch, restoreUiState])

  const handleNewWorkspace = useCallback(async () => {
    const dirPath = await window.electronAPI.selectFolder()
    if (!dirPath) return
    try {
      await window.electronAPI.createWorkspace(dirPath)
      await openWorkspaceByPath(dirPath)
    } catch (err: any) {
      alert(err.message || 'Failed to create workspace')
    }
  }, [openWorkspaceByPath])

  const handleOpenWorkspace = useCallback(async () => {
    const folderPath = await window.electronAPI.selectFolder()
    if (!folderPath) return
    await openWorkspaceByPath(folderPath)
  }, [openWorkspaceByPath])

  const handleHistoryItemClick = useCallback(async (entry: WorkspaceHistoryEntry) => {
    await openWorkspaceByPath(entry.path)
  }, [openWorkspaceByPath])

  const handleRemoveHistory = useCallback(async (e: React.MouseEvent, entryPath: string) => {
    e.stopPropagation()
    await window.electronAPI.removeFromWorkspaceHistory(entryPath)
    const history = await window.electronAPI.getWorkspaceHistory()
    dispatch({ type: 'SET_WORKSPACE_HISTORY', history })
  }, [dispatch])

  const handleWorkspaceNameClick = useCallback(async () => {
    dispatch({ type: 'CLEAR_WORKSPACE' })
    await window.electronAPI.clearWorkspace()
    // Refresh history when returning to landing
    const history = await window.electronAPI.getWorkspaceHistory()
    dispatch({ type: 'SET_WORKSPACE_HISTORY', history })
  }, [dispatch])

  const handleAddRepo = useCallback(async () => {
    const repoPath = await window.electronAPI.selectFolder()
    if (!repoPath) return
    const newRepos = [...codeRepos, { path: repoPath, commit: '' }]
    setCodeRepos(newRepos)
    dispatch({ type: 'SET_CODE_REPOS', repos: newRepos })
    const config = await window.electronAPI.loadConfig()
    await window.electronAPI.saveConfig({ ...config, codeRepos: newRepos })
    dispatch({ type: 'SET_CODE_REPO', path: repoPath })
    window.electronAPI.indexSymbols(repoPath).catch((err) => {
      console.error('Failed to index symbols for repo:', repoPath, err)
    })
  }, [codeRepos, dispatch])

  const handleRemoveRepo = useCallback(async (repoPath: string) => {
    const repoName = repoPath.split('/').pop() || repoPath.split('\\').pop() || repoPath
    if (!confirm(`Remove code repository "${repoName}"?`)) return
    const newRepos = codeRepos.filter((r) => r.path !== repoPath)
    setCodeRepos(newRepos)
    dispatch({ type: 'SET_CODE_REPOS', repos: newRepos })
    if (state.codeRepoPath === repoPath) {
      dispatch({ type: 'SET_CODE_REPO', path: '' })
    }
    const config = await window.electronAPI.loadConfig()
    await window.electronAPI.saveConfig({ ...config, codeRepos: newRepos })
  }, [codeRepos, state.codeRepoPath, dispatch])

  // Persist UI state on changes
  useEffect(() => {
    if (!workspacePath || restoringRef.current) return
    const timer = setTimeout(() => {
      window.electronAPI.saveUiState({
        selectedNoteId: state.selectedNoteId,
        codeRepoPath: state.codeRepoPath,
        openCodeFiles: state.openCodeFiles,
        activeCodeFileIndex: state.activeCodeFileIndex
      })
    }, 500)
    return () => clearTimeout(timer)
  }, [workspacePath, state.selectedNoteId, state.codeRepoPath, state.openCodeFiles, state.activeCodeFileIndex])

  // Landing page: no workspace open
  if (!workspacePath) {
    return (
      <div className="workspace-landing">
        <div className="workspace-landing-icon">📝</div>
        <div className="workspace-landing-title">Code Note Studio</div>
        <div className="workspace-landing-subtitle">
          Create a new workspace or open an existing one to get started.
        </div>
        <div className="workspace-landing-actions">
          <button className="workspace-landing-btn primary" onClick={handleNewWorkspace}>
            New Workspace
          </button>
          <button className="workspace-landing-btn" onClick={handleOpenWorkspace}>
            Open Workspace
          </button>
        </div>

        {workspaceHistory.length > 0 && (
          <>
            <div className="workspace-history-divider">
              <span className="workspace-history-divider-line" />
              <span className="workspace-history-divider-label">Recent Workspaces</span>
              <span className="workspace-history-divider-line" />
            </div>
            <div className="workspace-history-list">
              {workspaceHistory.map((entry) => (
                <div
                  key={entry.path}
                  className="workspace-history-item"
                  onClick={() => handleHistoryItemClick(entry)}
                >
                  <span className="workspace-history-item-icon">📁</span>
                  <div className="workspace-history-item-info">
                    <span className="workspace-history-item-name">{entry.name}</span>
                    <span className="workspace-history-item-path">{entry.path}</span>
                  </div>
                  <button
                    className="workspace-history-item-remove"
                    onClick={(e) => handleRemoveHistory(e, entry.path)}
                    title="Remove from history"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  // Normal toolbar
  return (
    <div className="workspace-toolbar">
      <span
        className="workspace-toolbar-name workspace-toolbar-name-clickable"
        onClick={handleWorkspaceNameClick}
        title="Back to home"
      >
        📁 {workspaceName}
      </span>
      <span className="workspace-toolbar-separator">|</span>
      <button className="workspace-toolbar-btn" onClick={handleOpenWorkspace}>
        Open Workspace
      </button>
      <div className="workspace-toolbar-spacer" />
      <span className="workspace-toolbar-label">Repos:</span>
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
                const repoName = repo.path.split('/').pop() || repo.path
                if (!confirm(`Re-index "${repoName}"?\nThis will re-parse all source files in this repo.`)) return
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
    </div>
  )
}
```

- [ ] **Step 2: Add CSS for new landing page elements**

In `src/renderer/src/components/WorkspaceToolbar.css`, add after the existing `.workspace-landing-actions` block:

```css
/* Clickable workspace name in toolbar */
.workspace-toolbar-name-clickable {
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.workspace-toolbar-name-clickable:hover {
  color: var(--accent-color);
}

/* History section on landing page */
.workspace-history-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  max-width: 400px;
  margin-top: 36px;
  margin-bottom: 16px;
}

.workspace-history-divider-line {
  flex: 1;
  height: 1px;
  background: var(--border-color);
}

.workspace-history-divider-label {
  font-size: 11px;
  color: var(--placeholder-color);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

.workspace-history-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  max-width: 400px;
}

.workspace-history-item {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: border-color 0.15s;
}

.workspace-history-item:hover {
  border-color: var(--accent-color);
}

.workspace-history-item-icon {
  font-size: 18px;
  margin-right: 12px;
  flex-shrink: 0;
}

.workspace-history-item-info {
  flex: 1;
  min-width: 0;
}

.workspace-history-item-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.workspace-history-item-path {
  font-size: 11px;
  color: var(--placeholder-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.workspace-history-item-remove {
  font-size: 16px;
  color: var(--placeholder-color);
  cursor: pointer;
  padding: 4px;
  background: none;
  border: none;
  line-height: 1;
  flex-shrink: 0;
}

.workspace-history-item-remove:hover {
  color: #e06c75;
}
```

- [ ] **Step 3: Run renderer tests to verify they pass**

Run: `npx vitest run tests/renderer/`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/WorkspaceToolbar.tsx src/renderer/src/components/WorkspaceToolbar.css tests/renderer/WorkspaceToolbar.test.tsx
git commit -m "feat: add workspace history list, click-to-landing, and improved create/open flows"
```

---

### Task 6: Verify with full test suite

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No type errors (may need to run per tsconfig)

- [ ] **Step 3: Commit any final fixes**

```bash
git commit -m "chore: final verification — all tests pass, build compiles"
```
