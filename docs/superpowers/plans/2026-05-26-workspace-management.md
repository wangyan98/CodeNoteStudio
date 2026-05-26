# Workspace Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded `~/code-note-studio-workspace/` with user-selectable workspace directory, top toolbar for repo management, and configurable notes path.

**Architecture:** Single workspace = one directory containing `notebook.json` + notes. App persists last-opened path in `{userData}/workspace.json`. Three new IPC channels: folder picker dialog, workspace open/switch, get-current. New `WorkspaceToolbar` component renders above the 4-panel layout, or shows a landing page when no workspace is open.

**Tech Stack:** Electron (native dialog), React/TypeScript, better-sqlite3, existing note-service/file-system services.

---

### Task 1: Update Type Definitions

**Files:**
- Modify: `src/main/types.ts`
- Modify: `src/renderer/src/types/index.ts`

- [ ] **Step 1: Remove `lsp` from CodeRepo in both files, add `notesPath` to NotebookConfig**

In `src/main/types.ts`:
```typescript
export interface CodeRepo {
  path: string
  commit: string
}

export interface NotebookConfig {
  name: string
  notesPath: string
  codeRepos: CodeRepo[]
}

export type NoteFileType = 'mind' | 'md' | 'derive'

export interface NoteListItem {
  name: string
  relativePath: string
  type: NoteFileType
}
```

In `src/renderer/src/types/index.ts`, replace the `CodeRepo` and `NotebookConfig` interfaces:
```typescript
export interface CodeRepo {
  path: string
  commit: string
}

export interface NotebookConfig {
  name: string
  notesPath: string
  codeRepos: CodeRepo[]
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -30`
Expected: No new errors from the type changes (may show pre-existing errors).

- [ ] **Step 3: Commit**

```bash
git add src/main/types.ts src/renderer/src/types/index.ts
git commit -m "refactor: simplify CodeRepo (remove lsp), add notesPath to NotebookConfig"
```

---

### Task 2: Create Workspace Service

**Files:**
- Create: `src/main/services/workspace.ts`
- Test: `tests/main/workspace.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/main/workspace.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// We'll test the functions after implementing them
// For now, describe the expected behavior

describe('workspace', () => {
  let testDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `workspace-test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  it('saves and loads last workspace path', async () => {
    const { saveLastWorkspacePath, loadLastWorkspacePath } = await import('../../src/main/services/workspace')
    await saveLastWorkspacePath('/some/path')
    const loaded = await loadLastWorkspacePath()
    expect(loaded).toBe('/some/path')
  })

  it('returns null when no workspace.json exists', async () => {
    const { loadLastWorkspacePath } = await import('../../src/main/services/workspace')
    // testData dir path won't have workspace.json
    const result = await loadLastWorkspacePath()
    expect(result).toBeNull()
  })

  it('validates existing workspace path', () => {
    const { validateWorkspacePath } = require('../../src/main/services/workspace')
    expect(validateWorkspacePath(testDir)).toBe(true)
    expect(validateWorkspacePath('/nonexistent/path/xyz')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/workspace.test.ts 2>&1`
Expected: FAIL — module not found or function not defined.

- [ ] **Step 3: Implement workspace.ts**

Create `src/main/services/workspace.ts`:
```typescript
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const WORKSPACE_FILE = 'workspace.json'

function getWorkspaceFilePath(): string {
  return path.join(app.getPath('userData'), WORKSPACE_FILE)
}

export async function saveLastWorkspacePath(workspacePath: string): Promise<void> {
  const filePath = getWorkspaceFilePath()
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(filePath, JSON.stringify({ lastPath: workspacePath }), 'utf-8')
}

export async function loadLastWorkspacePath(): Promise<string | null> {
  const filePath = getWorkspaceFilePath()
  if (!fs.existsSync(filePath)) {
    return null
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw)
    return typeof data.lastPath === 'string' ? data.lastPath : null
  } catch {
    return null
  }
}

export function validateWorkspacePath(workspacePath: string): boolean {
  if (!workspacePath || !path.isAbsolute(workspacePath)) return false
  try {
    const stat = fs.statSync(workspacePath)
    return stat.isDirectory()
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Fix tests — workspace service uses `app.getPath` from Electron**

The test needs the `app` module from Electron. Update `tests/main/workspace.test.ts` to mock Electron's `app`:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Mock electron app.getPath
vi.mock('electron', () => ({
  app: {
    getPath: () => join(process.cwd(), 'test-temp')
  }
}))

describe('workspace', () => {
  const testDataDir = join(process.cwd(), 'test-temp')

  beforeEach(() => {
    mkdirSync(testDataDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true })
    }
  })

  it('saves and loads last workspace path', async () => {
    const { saveLastWorkspacePath, loadLastWorkspacePath } = await import('../../src/main/services/workspace')
    await saveLastWorkspacePath('/some/path')
    const loaded = await loadLastWorkspacePath()
    expect(loaded).toBe('/some/path')
  })

  it('returns null when no workspace.json exists', async () => {
    const { loadLastWorkspacePath } = await import('../../src/main/services/workspace')
    const result = await loadLastWorkspacePath()
    expect(result).toBeNull()
  })

  it('validates existing workspace path', () => {
    const { validateWorkspacePath } = require('../../src/main/services/workspace')
    const { mkdirSync } = require('node:fs')
    const { join } = require('node:path')
    const { tmpdir } = require('node:os')
    const testDir = join(tmpdir(), `ws-test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
    expect(validateWorkspacePath(testDir)).toBe(true)
    expect(validateWorkspacePath('/nonexistent/xyz')).toBe(false)
    rmSync(testDir, { recursive: true, force: true })
  })

  it('rejects non-absolute paths', () => {
    const { validateWorkspacePath } = require('../../src/main/services/workspace')
    expect(validateWorkspacePath('relative/path')).toBe(false)
    expect(validateWorkspacePath('')).toBe(false)
  })

  it('handles corrupted workspace.json gracefully', async () => {
    const { loadLastWorkspacePath, saveLastWorkspacePath } = await import('../../src/main/services/workspace')
    await saveLastWorkspacePath('/some/path')
    // Corrupt the file
    const { writeFileSync } = require('node:fs')
    const path = require('node:path')
    writeFileSync(path.join(testDataDir, 'workspace.json'), 'not json {{{')
    const result = await loadLastWorkspacePath()
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/main/workspace.test.ts 2>&1`
Expected: All 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/services/workspace.ts tests/main/workspace.test.ts
git commit -m "feat: add workspace service with save/load/validate"
```

---

### Task 3: Update notebook-config for notesPath and Corrupted JSON

**Files:**
- Modify: `src/main/services/notebook-config.ts`
- Test: `tests/main/notebook-config.test.ts` (create if needed)

- [ ] **Step 1: Update DEFAULT_CONFIG and loadConfig**

In `src/main/services/notebook-config.ts`:
```typescript
import path from 'node:path'
import { readJsonFile, writeJsonFile, fileExists } from './file-system'
import type { NotebookConfig } from '../types'

const CONFIG_FILE = 'notebook.json'

const DEFAULT_CONFIG: NotebookConfig = {
  name: '',
  notesPath: './',
  codeRepos: []
}

export async function loadConfig(projectPath: string): Promise<NotebookConfig> {
  const configPath = path.join(projectPath, CONFIG_FILE)
  const exists = await fileExists(configPath)
  if (!exists) {
    return { ...DEFAULT_CONFIG, name: path.basename(projectPath) }
  }
  try {
    const config = await readJsonFile<NotebookConfig>(configPath)
    // Merge with defaults so missing fields get default values
    return {
      notesPath: config.notesPath || DEFAULT_CONFIG.notesPath,
      name: config.name || path.basename(projectPath),
      codeRepos: Array.isArray(config.codeRepos) ? config.codeRepos : []
    }
  } catch {
    // Corrupted JSON — return defaults
    console.warn(`[notebook-config] Corrupted config at ${configPath}, using defaults`)
    return { ...DEFAULT_CONFIG, name: path.basename(projectPath) }
  }
}

export async function saveConfig(projectPath: string, config: NotebookConfig): Promise<void> {
  const configPath = path.join(projectPath, CONFIG_FILE)
  await writeJsonFile(configPath, config)
}
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `npx vitest run tests/main/ 2>&1 | tail -20`
Expected: Existing tests pass (notebook-config tests if any, workspace tests).

- [ ] **Step 3: Commit**

```bash
git add src/main/services/notebook-config.ts
git commit -m "feat: add notesPath default and corrupted JSON handling to notebook-config"
```

---

### Task 4: Add Workspace IPC Handlers

**Files:**
- Modify: `src/main/ipc-handlers.ts`
- Test: `tests/main/workspace-ipc.test.ts`

- [ ] **Step 1: Add dialog:select-folder handler**

In `src/main/ipc-handlers.ts`, add inside `registerIpcHandlers()` after the existing `app:get-project-path` handler:
```typescript
  // Workspace
  ipcMain.handle('dialog:select-folder', async (): Promise<string | null> => {
    const { dialog } = await import('electron')
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })
```

- [ ] **Step 2: Add workspace:open and workspace:get-current handlers**

Add after the `dialog:select-folder` handler:
```typescript
  ipcMain.handle('workspace:open', async (_event, newPath: string): Promise<NotebookConfig> => {
    const { saveLastWorkspacePath, validateWorkspacePath } = await import('./services/workspace')
    if (!validateWorkspacePath(newPath)) {
      throw new Error(`Invalid workspace path: ${newPath}`)
    }
    currentProjectPath = newPath
    closeDatabase()
    initDatabase(newPath)
    await saveLastWorkspacePath(newPath)
    return loadConfig(newPath)
  })

  ipcMain.handle('workspace:get-current', (): string | null => {
    return currentProjectPath
  })
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit -p tsconfig.node.json 2>&1 | head -20`
Expected: No errors related to the new handlers.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc-handlers.ts
git commit -m "feat: add workspace IPC handlers (select-folder, open, get-current)"
```

---

### Task 5: Update Preload and Type Declarations

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/types/electron.d.ts`
- Modify: `src/renderer/src/services/web-api-client.ts`

- [ ] **Step 1: Add workspace APIs to preload**

In `src/preload/index.ts`, add after `getProjectPath`:
```typescript
  // Workspace
  selectFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:select-folder'),
  openWorkspace: (newPath: string) => ipcRenderer.invoke('workspace:open', newPath),
  getWorkspacePath: (): Promise<string | null> => ipcRenderer.invoke('workspace:get-current'),
```

- [ ] **Step 2: Add type declarations**

In `src/renderer/src/types/electron.d.ts`, add inside the `electronAPI` interface:
```typescript
      selectFolder: () => Promise<string | null>
      openWorkspace: (newPath: string) => Promise<NotebookConfig>
      getWorkspacePath: () => Promise<string | null>
```

- [ ] **Step 3: Add stubs to web-api-client**

In `src/renderer/src/services/web-api-client.ts`, add inside the `createWebApiClient()` return object (after `getProjectPath`):
```typescript
    // Workspace (read-only in browser)
    selectFolder: () => Promise.resolve(null),
    openWorkspace: () => Promise.resolve(null as any),
    getWorkspacePath: () => Promise.resolve(null),
```

- [ ] **Step 4: Verify full compilation**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/preload/index.ts src/renderer/src/types/electron.d.ts src/renderer/src/services/web-api-client.ts
git commit -m "feat: expose workspace APIs through preload and type declarations"
```

---

### Task 6: Update Main Process Startup (index.ts)

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Replace hardcoded path with workspace initialization**

In `src/main/index.ts`, replace the `app.whenReady()` handler:
```typescript
import { loadLastWorkspacePath, validateWorkspacePath } from './services/workspace'
import { initDatabase } from './services/index-db'

app.whenReady().then(async () => {
  const lastPath = await loadLastWorkspacePath()
  const projectPath = lastPath && validateWorkspacePath(lastPath)
    ? lastPath
    : null

  if (projectPath) {
    registerIpcHandlers(projectPath)
  } else {
    // No valid workspace yet — register handlers with null path
    // The landing page will prompt the user to open a folder
    registerIpcHandlers('')
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})
```

Note: `registerIpcHandlers('')` with an empty string — we need to handle this in the handler. Update `registerIpcHandlers` in `src/main/ipc-handlers.ts` to skip `initDatabase` when `projectPath` is empty:
```typescript
export function registerIpcHandlers(projectPath: string): void {
  currentProjectPath = projectPath

  if (projectPath) {
    initDatabase(projectPath)
  }

  // ... rest of handlers unchanged
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit -p tsconfig.node.json 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts src/main/ipc-handlers.ts
git commit -m "feat: replace hardcoded project path with workspace-based startup"
```

---

### Task 7: Update AppContext for Workspace State

**Files:**
- Modify: `src/renderer/src/contexts/AppContext.tsx`
- Modify: `src/renderer/src/types/index.ts`

- [ ] **Step 1: Add workspace state types**

In `src/renderer/src/types/index.ts`, add to `AppState`:
```typescript
  workspacePath: string | null
  workspaceName: string
```

Update `initialState` in `AppContext.tsx`:
```typescript
export const initialState: AppState = {
  notes: [],
  selectedNoteId: null,
  noteFilter: 'all',
  noteSearchQuery: '',
  activeNoteContent: null,
  activeNoteType: null,
  openCodeFiles: [],
  activeCodeFileIndex: -1,
  codeRepoPath: null,
  codeFiles: [],
  panelWidths: { panel1: 18, panel2: 32, panel3: 32, panel4: 18 },
  workspacePath: null,
  workspaceName: ''
}
```

- [ ] **Step 2: Add workspace actions**

In `src/renderer/src/types/index.ts`, add to `AppAction`:
```typescript
  | { type: 'SET_WORKSPACE'; path: string; name: string }
  | { type: 'CLEAR_WORKSPACE' }
```

Add cases to `appReducer` in `AppContext.tsx`:
```typescript
    case 'SET_WORKSPACE':
      return { ...state, workspacePath: action.path, workspaceName: action.name }

    case 'CLEAR_WORKSPACE':
      return { ...state, workspacePath: null, workspaceName: '' }
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/contexts/AppContext.tsx src/renderer/src/types/index.ts
git commit -m "feat: add workspace state and actions to AppContext"
```

---

### Task 8: Create WorkspaceToolbar Component

**Files:**
- Create: `src/renderer/src/components/WorkspaceToolbar.tsx`
- Create: `src/renderer/src/components/WorkspaceToolbar.css`
- Test: `tests/renderer/WorkspaceToolbar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/renderer/WorkspaceToolbar.test.tsx`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AppProvider } from '../../src/renderer/src/contexts/AppContext'

// Mock electronAPI
const mockElectronAPI = {
  selectFolder: vi.fn().mockResolvedValue('/test/path'),
  openWorkspace: vi.fn().mockResolvedValue({ name: 'Test', notesPath: './', codeRepos: [] }),
  getWorkspacePath: vi.fn().mockResolvedValue('/test/path'),
  platform: 'darwin',
  getAppVersion: vi.fn().mockResolvedValue('0.1.0'),
  getProjectPath: vi.fn().mockResolvedValue('/test/path'),
  loadConfig: vi.fn().mockResolvedValue({ name: 'Test', notesPath: './', codeRepos: [] }),
  saveConfig: vi.fn(),
  listNotes: vi.fn().mockResolvedValue([]),
  createNote: vi.fn(),
  readNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  renameNote: vi.fn(),
  noteExists: vi.fn(),
  listRepoFiles: vi.fn().mockResolvedValue([]),
  readCodeFile: vi.fn(),
  getGitCommit: vi.fn(),
  parseSymbols: vi.fn(),
  indexSymbols: vi.fn(),
  resolveRefs: vi.fn(),
  startServer: vi.fn(),
  stopServer: vi.fn(),
  getServerStatus: vi.fn().mockResolvedValue({ running: false, port: 0, url: '' })
}

vi.stubGlobal('window', { electronAPI: mockElectronAPI })

// Import after mock
import { WorkspaceToolbar } from '../../src/renderer/src/components/WorkspaceToolbar'

describe('WorkspaceToolbar', () => {
  it('renders landing page when no workspace is open', () => {
    render(
      <AppProvider initialStateOverride={{
        notes: [], selectedNoteId: null, noteFilter: 'all', noteSearchQuery: '',
        activeNoteContent: null, activeNoteType: null, openCodeFiles: [],
        activeCodeFileIndex: -1, codeRepoPath: null, codeFiles: [],
        panelWidths: { panel1: 18, panel2: 32, panel3: 32, panel4: 18 },
        workspacePath: null, workspaceName: ''
      }}>
        <WorkspaceToolbar />
      </AppProvider>
    )
    expect(screen.getByText('Code Note Studio')).toBeDefined()
    expect(screen.getByText('Open Folder')).toBeDefined()
  })

  it('renders toolbar when workspace is open', () => {
    render(
      <AppProvider initialStateOverride={{
        notes: [], selectedNoteId: null, noteFilter: 'all', noteSearchQuery: '',
        activeNoteContent: null, activeNoteType: null, openCodeFiles: [],
        activeCodeFileIndex: -1, codeRepoPath: null, codeFiles: [],
        panelWidths: { panel1: 18, panel2: 32, panel3: 32, panel4: 18 },
        workspacePath: '/test/path', workspaceName: 'My Notes'
      }}>
        <WorkspaceToolbar />
      </AppProvider>
    )
    expect(screen.getByText('My Notes')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/WorkspaceToolbar.test.tsx 2>&1`
Expected: FAIL — module not found.

- [ ] **Step 3: Create WorkspaceToolbar.css**

Create `src/renderer/src/components/WorkspaceToolbar.css`:
```css
.workspace-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 14px;
  background: var(--header-bg);
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
  flex-shrink: 0;
  height: 34px;
}

.workspace-toolbar-name {
  font-weight: 600;
  color: var(--text-color);
  white-space: nowrap;
}

.workspace-toolbar-separator {
  color: var(--border-color);
}

.workspace-toolbar-label {
  color: var(--placeholder-color);
  font-size: 11px;
}

.workspace-toolbar-repos {
  display: flex;
  align-items: center;
  gap: 4px;
}

.workspace-toolbar-repo-chip {
  background: var(--panel-bg);
  padding: 2px 8px;
  border-radius: 3px;
  color: var(--text-color);
  font-size: 11px;
  cursor: pointer;
  border: 1px solid var(--border-color);
  white-space: nowrap;
}

.workspace-toolbar-repo-chip:hover {
  border-color: var(--accent-color);
}

.workspace-toolbar-repo-chip.missing {
  color: var(--placeholder-color);
  opacity: 0.6;
  text-decoration: line-through;
}

.workspace-toolbar-btn {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--header-color);
  padding: 3px 10px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
  white-space: nowrap;
}

.workspace-toolbar-btn:hover {
  border-color: var(--accent-color);
  color: var(--text-color);
}

.workspace-toolbar-btn.primary {
  background: var(--accent-color);
  color: #fff;
  border-color: var(--accent-color);
}

.workspace-toolbar-spacer {
  flex: 1;
}

/* Landing page */
.workspace-landing {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  gap: 12px;
  flex: 1;
}

.workspace-landing-icon {
  font-size: 48px;
  margin-bottom: 4px;
}

.workspace-landing-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
}

.workspace-landing-subtitle {
  color: var(--placeholder-color);
  font-size: 13px;
  text-align: center;
}

.workspace-landing-btn {
  background: var(--accent-color);
  color: #fff;
  border: none;
  padding: 10px 24px;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  margin-top: 8px;
}

.workspace-landing-btn:hover {
  opacity: 0.9;
}
```

- [ ] **Step 4: Create WorkspaceToolbar.tsx**

Create `src/renderer/src/components/WorkspaceToolbar.tsx`:
```typescript
import { useCallback, useEffect, useState } from 'react'
import { useAppContext } from '../contexts/AppContext'
import './WorkspaceToolbar.css'

export function WorkspaceToolbar() {
  const { state, dispatch } = useAppContext()
  const { workspacePath, workspaceName } = state
  const [codeRepos, setCodeRepos] = useState<Array<{ path: string; commit: string }>>([])

  useEffect(() => {
    if (workspacePath) {
      window.electronAPI.loadConfig().then((config) => {
        dispatch({ type: 'SET_WORKSPACE', path: workspacePath, name: config.name || workspacePath })
        setCodeRepos(config.codeRepos || [])
      })
    }
  }, [workspacePath])

  const handleOpenFolder = useCallback(async () => {
    const folderPath = await window.electronAPI.selectFolder()
    if (!folderPath) return
    try {
      const config = await window.electronAPI.openWorkspace(folderPath)
      dispatch({ type: 'SET_WORKSPACE', path: folderPath, name: config.name || folderPath })
      setCodeRepos(config.codeRepos || [])
      // Refresh notes for the new workspace
      const notes = await window.electronAPI.listNotes()
      dispatch({ type: 'SET_NOTES', notes })
    } catch (err) {
      console.error('Failed to open workspace:', err)
    }
  }, [dispatch])

  const handleAddRepo = useCallback(async () => {
    const repoPath = await window.electronAPI.selectFolder()
    if (!repoPath) return
    const newRepos = [...codeRepos, { path: repoPath, commit: '' }]
    setCodeRepos(newRepos)
    // Save updated config
    const config = await window.electronAPI.loadConfig()
    await window.electronAPI.saveConfig({ ...config, codeRepos: newRepos })
    // Refresh code directory
    const files = await window.electronAPI.listRepoFiles(repoPath)
    dispatch({ type: 'SET_CODE_REPO', path: repoPath })
    dispatch({ type: 'SET_CODE_FILES', files })
  }, [codeRepos, dispatch])

  const handleRemoveRepo = useCallback(async (repoPath: string) => {
    const newRepos = codeRepos.filter((r) => r.path !== repoPath)
    setCodeRepos(newRepos)
    const config = await window.electronAPI.loadConfig()
    await window.electronAPI.saveConfig({ ...config, codeRepos: newRepos })
  }, [codeRepos])

  // Landing page: no workspace open
  if (!workspacePath) {
    return (
      <div className="workspace-landing">
        <div className="workspace-landing-icon">📝</div>
        <div className="workspace-landing-title">Code Note Studio</div>
        <div className="workspace-landing-subtitle">
          Open a folder to get started — your notes and linked code repos live there.
        </div>
        <button className="workspace-landing-btn" onClick={handleOpenFolder}>
          Open Folder
        </button>
      </div>
    )
  }

  // Normal toolbar
  return (
    <div className="workspace-toolbar">
      <span className="workspace-toolbar-name">📁 {workspaceName}</span>
      <span className="workspace-toolbar-separator">|</span>
      <span className="workspace-toolbar-label">Repos:</span>
      <div className="workspace-toolbar-repos">
        {codeRepos.map((repo) => (
          <span
            key={repo.path}
            className="workspace-toolbar-repo-chip"
            title={repo.path}
            onClick={() => {
              dispatch({ type: 'SET_CODE_REPO', path: repo.path })
              window.electronAPI.listRepoFiles(repo.path).then((files) => {
                dispatch({ type: 'SET_CODE_FILES', files })
              })
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              handleRemoveRepo(repo.path)
            }}
          >
            {repo.path.split('/').pop() || repo.path}
          </span>
        ))}
        <button className="workspace-toolbar-btn" onClick={handleAddRepo}>
          + Add Repo
        </button>
      </div>
      <div className="workspace-toolbar-spacer" />
      <button className="workspace-toolbar-btn" onClick={handleOpenFolder}>
        Open Folder
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/renderer/WorkspaceToolbar.test.tsx 2>&1`
Expected: 2 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/WorkspaceToolbar.tsx src/renderer/src/components/WorkspaceToolbar.css tests/renderer/WorkspaceToolbar.test.tsx
git commit -m "feat: add WorkspaceToolbar component with landing page and repo management"
```

---

### Task 9: Update Layout to Include WorkspaceToolbar

**Files:**
- Modify: `src/renderer/src/components/Layout.tsx`
- Test: `tests/renderer/Layout.test.tsx` (update if needed)

- [ ] **Step 1: Add WorkspaceToolbar to Layout**

In `src/renderer/src/components/Layout.tsx`, add the import:
```typescript
import { WorkspaceToolbar } from './WorkspaceToolbar'
```

And render it at the top of the layout, but only if workspace is open:
```typescript
  return (
    <div className="layout-container">
      <WorkspaceToolbar />
      {state.workspacePath && (
        <div className="layout-panels">
          <PanelGroup direction="horizontal" onLayout={handleLayoutChange}>
            <Panel defaultSize={panelWidths.panel1} minSize={10} maxSize={30}>
              <NoteDirectory />
            </Panel>
            <PanelResizeHandle className="resize-handle" />
            <Panel defaultSize={panelWidths.panel2} minSize={20}>
              <NoteViewport />
            </Panel>
            <PanelResizeHandle className="resize-handle" />
            <Panel defaultSize={panelWidths.panel3} minSize={20}>
              <CodeViewport />
            </Panel>
            <PanelResizeHandle className="resize-handle" />
            <Panel defaultSize={panelWidths.panel4} minSize={10} maxSize={30}>
              <CodeDirectory />
            </Panel>
          </PanelGroup>
        </div>
      )}
      <ServerStatus />
    </div>
  )
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/Layout.tsx
git commit -m "feat: add WorkspaceToolbar to Layout, hide panels when no workspace"
```

---

### Task 10: Update CodeDirectory for Multi-Repo Support

**Files:**
- Modify: `src/renderer/src/components/CodeDirectory.tsx`

- [ ] **Step 1: Update CodeDirectory to use state.codeRepoPath and show repo list**

Replace the `useEffect` in `CodeDirectory.tsx` to load files when `state.codeRepoPath` changes:
```typescript
export function CodeDirectory() {
  const { state, dispatch } = useAppContext()
  const [repoFiles, setRepoFiles] = useState<RepoFileNode[]>([])
  const [filter, setFilter] = useState<string>('all')
  const [loading, setLoading] = useState(false)

  const fileTypes = ['all', '.ts', '.tsx', '.js', '.py', '.rs', '.go', '.cpp', '.md', '.json']

  useEffect(() => {
    async function loadRepo() {
      if (!state.codeRepoPath) {
        setRepoFiles([])
        return
      }
      setLoading(true)
      try {
        const files = await window.electronAPI.listRepoFiles(state.codeRepoPath)
        setRepoFiles(files)
      } catch {
        setRepoFiles([])
      } finally {
        setLoading(false)
      }
    }
    loadRepo()
  }, [state.codeRepoPath])

  // ... rest unchanged (handleFileSelect, filteredFiles, tree, return)
```

And update the "no repo" message:
```typescript
          <div className="code-no-repo">
            <p>No code repository selected.<br/>Use the toolbar to add a repo.</p>
          </div>
```

- [ ] **Step 2: Remove config loading from CodeDirectory (toolbar handles it)**

The config loading in `useEffect` is replaced — no more direct `loadConfig()` call or `codeRepos[0]` reference. The workspace toolbar now manages repo state and dispatches `SET_CODE_REPO` / `SET_CODE_FILES`.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/CodeDirectory.tsx
git commit -m "feat: update CodeDirectory to use state.codeRepoPath for multi-repo support"
```

---

### Task 11: Update note-service for Configurable notesPath

**Files:**
- Modify: `src/main/services/note-service.ts`

- [ ] **Step 1: Update getFullPath to use notesPath**

Currently note-service hardcodes `notes/` as the notes subdirectory. Replace the constant with a parameter derived from the config.

At the top of `note-service.ts`, remove the hardcoded `NOTES_DIR` and add a helper:
```typescript
import path from 'node:path'
import fs from 'node:fs/promises'
import {
  readJsonFile,
  writeJsonFile,
  readTextFile,
  writeTextFile,
  deleteFile,
  fileExists,
  listDirectory,
  ensureDir
} from './file-system'
import {
  createMindMapDocument,
  createDerivationDocument,
  isValidMindMapDocument,
  isValidDerivationDocument
} from '../schemas/note-types'
import type { MindMapDocument, DerivationDocument } from '../schemas/note-types'
import type { NoteFileType, NoteListItem } from '../types'
import { loadConfig } from './notebook-config'

async function getNotesRoot(projectPath: string): Promise<string> {
  const config = await loadConfig(projectPath)
  const notesPath = config.notesPath || './'
  return path.resolve(projectPath, notesPath)
}

async function getFullPath(projectPath: string, relativePath: string): Promise<string> {
  const notesRoot = await getNotesRoot(projectPath)
  return path.join(notesRoot, relativePath)
}
```

- [ ] **Step 2: Update all functions to use async getFullPath**

Update `createNote`, `readNote`, `updateNote`, `deleteNote`, `renameNote`, `noteExists`, `listNotes` to use `await getFullPath(projectPath, relativePath)` instead of the old sync version.

For `createNote`:
```typescript
export async function createNote(
  projectPath: string,
  relativePath: string,
  type: NoteFileType
): Promise<void> {
  const fullPath = await getFullPath(projectPath, relativePath)
  await ensureDir(path.dirname(fullPath))

  switch (type) {
    case 'mind': {
      const content = createMindMapDocument()
      await writeJsonFile(fullPath, content)
      break
    }
    case 'derive': {
      const content = createDerivationDocument()
      await writeJsonFile(fullPath, content)
      break
    }
    case 'md': {
      const content = `# ${path.basename(relativePath)}\n\n`
      await writeTextFile(fullPath, content)
      break
    }
  }
}
```

For `listNotes`:
```typescript
export async function listNotes(
  projectPath: string,
  filterType?: NoteFileType
): Promise<NoteListItem[]> {
  const notesRoot = await getNotesRoot(projectPath)
  const exists = await fileExists(notesRoot)
  if (!exists) return []

  const result: NoteListItem[] = []

  async function scanDir(dirPath: string, relativeDir: string): Promise<void> {
    const entries = await listDirectory(dirPath)
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry)
      const relPath = relativeDir ? `${relativeDir}/${entry}` : entry

      let stat
      try {
        stat = await fs.stat(fullPath)
      } catch {
        continue
      }

      if (stat.isDirectory()) {
        await scanDir(fullPath, relPath)
      } else {
        const type = getNoteType(entry)
        if (type && (!filterType || type === filterType)) {
          result.push({
            name: entry,
            relativePath: relPath,
            type
          })
        }
      }
    }
  }

  await scanDir(notesRoot, '')
  return result
}
```

- [ ] **Step 3: Update readNote, updateNote, deleteNote, renameNote, noteExists similarly**

Each function that uses `getFullPath` should now `await` it:
```typescript
export async function readNote(
  projectPath: string,
  relativePath: string
): Promise<NoteContent> {
  const fullPath = await getFullPath(projectPath, relativePath)
  // ... rest unchanged
}

export async function updateNote(
  projectPath: string,
  relativePath: string,
  content: NoteContent
): Promise<void> {
  const fullPath = await getFullPath(projectPath, relativePath)
  // ... rest unchanged
}

export async function deleteNote(
  projectPath: string,
  relativePath: string
): Promise<void> {
  const fullPath = await getFullPath(projectPath, relativePath)
  await deleteFile(fullPath)
}

export async function renameNote(
  projectPath: string,
  oldRelativePath: string,
  newRelativePath: string
): Promise<void> {
  const oldPath = await getFullPath(projectPath, oldRelativePath)
  const newPath = await getFullPath(projectPath, newRelativePath)
  await ensureDir(path.dirname(newPath))
  await fs.rename(oldPath, newPath)
}

export async function noteExists(
  projectPath: string,
  relativePath: string
): Promise<boolean> {
  const fullPath = await getFullPath(projectPath, relativePath)
  return fileExists(fullPath)
}
```

- [ ] **Step 4: Run tests to verify**

Run: `npx vitest run tests/main/ 2>&1 | tail -20`
Expected: All tests pass (or fix any that need updating for the async getFullPath change).

- [ ] **Step 5: Verify full build**

Run: `npx tsc --noEmit -p tsconfig.node.json 2>&1`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add src/main/services/note-service.ts
git commit -m "feat: make notes path configurable via notebook.json notesPath"
```

---

### Self-Review Checklist

1. **Spec coverage:**
   - Directory structure ✓ (Task 2: workspace service)
   - Startup flow ✓ (Task 6: index.ts)
   - Persistence ✓ (Task 2: workspace service)
   - notebook.json format ✓ (Task 1: types, Task 3: notebook-config)
   - IPC channels ✓ (Task 4: ipc-handlers)
   - Workspace toolbar ✓ (Task 8: WorkspaceToolbar)
   - Landing page ✓ (Task 8: WorkspaceToolbar)
   - Multi-repo support ✓ (Task 10: CodeDirectory)
   - Configurable notesPath ✓ (Task 11: note-service)
   - Edge cases ✓ (covered in workspace.ts validation, notebook-config corrupted JSON, landing page)

2. **Placeholder scan:** No TBD, TODO, or vague descriptions. Every step has complete code.

3. **Type consistency:**
   - `CodeRepo` has `path` and `commit` (no `lsp`) — consistent across Tasks 1, 3, 8, 10
   - `NotebookConfig` has `name`, `notesPath`, `codeRepos` — consistent across all tasks
   - `workspace:open` returns `NotebookConfig` — consistent with `loadConfig` signature
   - `AppState` fields `workspacePath` and `workspaceName` — consistent across Tasks 7, 8, 9
   - IPC channel names `dialog:select-folder`, `workspace:open`, `workspace:get-current` — consistent across Tasks 4, 5, 8
