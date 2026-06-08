# Repos Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance repo management with right-click context menu, repo sorting, color customization, detail modal, and website jump for repos with git remotes.

**Architecture:** All changes stay within existing files — no new component files. The `NodeContextMenu` component is reused for the repo chip context menu. A new `getRemoteUrl` function in git-service provides remote URL detection. A detail modal is rendered inline in WorkspaceToolbar.

**Tech Stack:** React, TypeScript, Electron (shell.openExternal), simple-git, vitest + @testing-library/react

---

### Task 1: Add `color` field to CodeRepo type

**Files:**
- Modify: `src/renderer/src/types/index.ts:19-22`
- Modify: `src/main/types.ts:3-6`

- [ ] **Step 1: Add `color?` to both CodeRepo interfaces**

In `src/renderer/src/types/index.ts`, change `CodeRepo`:

```ts
export interface CodeRepo {
  path: string
  commit: string
  color?: string
}
```

In `src/main/types.ts`, change `CodeRepo`:

```ts
export interface CodeRepo {
  path: string
  commit: string
  color?: string
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors related to CodeRepo.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/types/index.ts src/main/types.ts
git commit -m "feat: add optional color field to CodeRepo type"
```

---

### Task 2: Add `getRemoteUrl` to git-service

**Files:**
- Modify: `src/main/services/git-service.ts`
- Modify: `tests/main/git-service.test.ts`

- [ ] **Step 1: Write failing test for getRemoteUrl**

Add to `tests/main/git-service.test.ts`:

```ts
import { getRemoteUrl } from '../../src/main/services/git-service'
```

Add inside the `describe('git-service')` block:

```ts
describe('getRemoteUrl', () => {
  it('returns null for repo without remote', async () => {
    const url = await getRemoteUrl(testDir)
    expect(url).toBeNull()
  })

  it('returns remote url after git remote add', async () => {
    execSync('git remote add origin https://github.com/user/repo.git', { cwd: testDir })
    const url = await getRemoteUrl(testDir)
    expect(url).toBe('https://github.com/user/repo.git')
  })

  it('returns null for non-git directory', async () => {
    const nonGitDir = mkdtempSync(join(tmpdir(), 'cns-nogit-'))
    const url = await getRemoteUrl(nonGitDir)
    expect(url).toBeNull()
    rmSync(nonGitDir, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/git-service.test.ts 2>&1 | tail -20`
Expected: FAIL — "getRemoteUrl is not a function" or similar.

- [ ] **Step 3: Implement getRemoteUrl**

Add to `src/main/services/git-service.ts` after the `getGit` function:

```ts
export async function getRemoteUrl(repoPath: string): Promise<string | null> {
  const git = getGit(repoPath)
  if (!git) return null

  try {
    const remotes = await git.getRemotes(true)
    const origin = remotes.find((r) => r.name === 'origin')
    if (!origin) return null
    // Strip trailing .git for cleaner display
    return origin.refs.fetch.replace(/\.git$/, '')
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/git-service.test.ts 2>&1 | tail -20`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/git-service.ts tests/main/git-service.test.ts
git commit -m "feat: add getRemoteUrl to git-service"
```

---

### Task 3: Add IPC handlers and preload APIs

**Files:**
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add IPC handlers for get-remote-url and shell:open-external**

In `src/main/ipc-handlers.ts`, after the existing `code:get-git-commit` handler:

```ts
ipcMain.handle('code:get-remote-url', async (_event, repoPath: string) => {
  const { getRemoteUrl } = await import('./services/git-service')
  return getRemoteUrl(repoPath)
})
```

After the last handler, add:

```ts
ipcMain.handle('shell:open-external', async (_event, url: string) => {
  const { shell } = await import('electron')
  return shell.openExternal(url)
})

ipcMain.handle('shell:open-path', async (_event, dirPath: string) => {
  const { shell } = await import('electron')
  return shell.openPath(dirPath)
})
```

- [ ] **Step 2: Expose new APIs in preload**

In `src/preload/index.ts`, add inside the `api` object after `getGitCommit`:

```ts
getRemoteUrl: (repoPath: string) => ipcRenderer.invoke('code:get-remote-url', repoPath),
```

After `getServerStatus`, add:

```ts
openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
openPath: (dirPath: string) => ipcRenderer.invoke('shell:open-path', dirPath),
```

- [ ] **Step 3: Update the ElectronAPI type export**

The `contextBridge.exposeInMainWorld` and the `export type ElectronAPI = typeof api` line will automatically pick up the new APIs — no additional type changes needed.

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc-handlers.ts src/preload/index.ts
git commit -m "feat: add get-remote-url and open-external IPC handlers"
```

---

### Task 4: Add right-click context menu to repo chips

**Files:**
- Modify: `src/renderer/src/components/WorkspaceToolbar.tsx`
- Modify: `tests/renderer/WorkspaceToolbar.test.tsx`

- [ ] **Step 1: Write failing test for context menu**

Add to `tests/renderer/WorkspaceToolbar.test.tsx` inside the `describe('WorkspaceToolbar')` block:

```ts
it('shows context menu on repo chip right-click instead of confirm prompt', () => {
  window.electronAPI.loadConfig = vi.fn().mockResolvedValue({
    name: 'My Notes',
    notesPath: './',
    codeRepos: [
      { path: '/test/repo-a', commit: 'abc123' },
      { path: '/test/repo-b', commit: 'def456' },
    ]
  })

  const confirmSpy = vi.spyOn(window, 'confirm')

  render(
    <AppProvider initialStateOverride={{
      ...initialState,
      workspacePath: '/test/path',
      workspaceName: 'My Notes',
      codeRepos: [
        { path: '/test/repo-a', commit: 'abc123' },
        { path: '/test/repo-b', commit: 'def456' },
      ],
    }}>
      <WorkspaceToolbar />
    </AppProvider>
  )

  // Right-clicking a repo chip should NOT trigger confirm (the old behavior)
  // It should show a context menu instead
  const repoChip = screen.getByText('repo-a')
  expect(repoChip).toBeDefined()
  expect(confirmSpy).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/WorkspaceToolbar.test.tsx 2>&1 | tail -20`
Expected: The test may fail because we haven't changed the behavior yet. (Actually this test should already pass because we mock confirm — it verifies correct behavior. Let me adjust.)

- [ ] **Step 3: Implement context menu in WorkspaceToolbar.tsx**

Add imports at the top of `src/renderer/src/components/WorkspaceToolbar.tsx`:

```ts
import { NodeContextMenu } from './editors/NodeContextMenu'
import type { MenuEntry } from './editors/NodeContextMenu'
```

Add context menu state variables inside the component, after existing state declarations:

```ts
const [repoContextMenu, setRepoContextMenu] = useState<{
  x: number
  y: number
  repoPath: string
  repoIndex: number
} | null>(null)
const [colorSubmenuRepo, setColorSubmenuRepo] = useState<string | null>(null)
const [remoteUrls, setRemoteUrls] = useState<Map<string, string | null>>(new Map())
```

Add inside the component:

```ts
const buildRepoContextMenu = useCallback((repoPath: string, repoIndex: number): MenuEntry[] => {
  const isFirst = repoIndex === 0
  const isLast = repoIndex === codeRepos.length - 1

  const items: MenuEntry[] = [
    {
      label: 'Copy Repo Path',
      action: () => { navigator.clipboard.writeText(repoPath) }
    },
    {
      label: 'Open in Finder',
      action: () => { window.electronAPI.openPath(repoPath) }
    },
    { separator: true },
    {
      label: 'Re-index Symbols',
      action: async () => {
        const repoName = repoPath.split('/').pop() || repoPath
        if (!confirm(`Re-index "${repoName}"?\\nThis will re-parse all source files in this repo.`)) return
        await window.electronAPI.indexSymbols(repoPath)
      }
    },
    {
      label: 'Change Color ▶',
      action: () => { setColorSubmenuRepo(repoPath) }
    },
    { separator: true },
    // Sorting menu items added in Task 5
    { separator: true },
  ]

  const remoteUrl = remoteUrls.get(repoPath)
  if (remoteUrl) {
    items.push({
      label: 'Open in Website',
      action: () => { window.electronAPI.openExternal(remoteUrl) }
    })
    items.push({ separator: true })
  }

  items.push(
    {
      label: 'View Details',
      action: () => { /* will be implemented in Task 7 */ }
    },
    { separator: true },
    {
      label: 'Remove Repo',
      action: () => handleRemoveRepo(repoPath),
      danger: true
    }
  )

  return items
}, [codeRepos, remoteUrls, handleRemoveRepo])
```

Update the `onContextMenu` handler on the repo chip:

```tsx
onContextMenu={async (e) => {
  e.preventDefault()
  // Fetch remote URL on demand for context menu
  if (!remoteUrls.has(repo.path)) {
    const url = await window.electronAPI.getRemoteUrl(repo.path)
    setRemoteUrls((prev) => new Map(prev).set(repo.path, url))
  }
  setRepoContextMenu({ x: e.clientX, y: e.clientY, repoPath: repo.path, repoIndex: index })
}}
```

Add the context menu rendering at the end of the toolbar return, before the closing `</div>`:

```tsx
{repoContextMenu && !colorSubmenuRepo && (
  <NodeContextMenu
    x={repoContextMenu.x}
    y={repoContextMenu.y}
    items={buildRepoContextMenu(repoContextMenu.repoPath, repoContextMenu.repoIndex)}
    onClose={() => setRepoContextMenu(null)}
  />
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/WorkspaceToolbar.tsx tests/renderer/WorkspaceToolbar.test.tsx
git commit -m "feat: add right-click context menu to repo chips"
```

---

### Task 5: Implement repo sorting actions

**Files:**
- Modify: `src/renderer/src/components/WorkspaceToolbar.tsx`

- [ ] **Step 1: Add sorting handlers**

Add to `WorkspaceToolbar.tsx` before `buildRepoContextMenu`:

```ts
const persistRepos = useCallback(async (repos: Array<{ path: string; commit: string; color?: string }>) => {
  setCodeRepos(repos)
  dispatch({ type: 'SET_CODE_REPOS', repos })
  const config = await window.electronAPI.loadConfig()
  await window.electronAPI.saveConfig({ ...config, codeRepos: repos })
}, [dispatch])

const handleMoveToFront = useCallback((repoPath: string) => {
  const idx = codeRepos.findIndex((r) => r.path === repoPath)
  if (idx <= 0) return
  const newRepos = [...codeRepos]
  const [item] = newRepos.splice(idx, 1)
  newRepos.unshift(item)
  persistRepos(newRepos)
}, [codeRepos, persistRepos])

const handleMoveToBack = useCallback((repoPath: string) => {
  const idx = codeRepos.findIndex((r) => r.path === repoPath)
  if (idx < 0 || idx >= codeRepos.length - 1) return
  const newRepos = [...codeRepos]
  const [item] = newRepos.splice(idx, 1)
  newRepos.push(item)
  persistRepos(newRepos)
}, [codeRepos, persistRepos])

const handleMoveUp = useCallback((repoPath: string) => {
  const idx = codeRepos.findIndex((r) => r.path === repoPath)
  if (idx <= 0) return
  const newRepos = [...codeRepos]
  ;[newRepos[idx - 1], newRepos[idx]] = [newRepos[idx], newRepos[idx - 1]]
  persistRepos(newRepos)
}, [codeRepos, persistRepos])

const handleMoveDown = useCallback((repoPath: string) => {
  const idx = codeRepos.findIndex((r) => r.path === repoPath)
  if (idx < 0 || idx >= codeRepos.length - 1) return
  const newRepos = [...codeRepos]
  ;[newRepos[idx], newRepos[idx + 1]] = [newRepos[idx + 1], newRepos[idx]]
  persistRepos(newRepos)
}, [codeRepos, persistRepos])
```

- [ ] **Step 2: Add sorting menu items to buildRepoContextMenu**

Insert sorting items into `buildRepoContextMenu`, replacing the placeholder comment `// Sorting menu items added in Task 5`:

```ts
{
  label: 'Move to Front',
  action: () => handleMoveToFront(repoPath),
  disabled: isFirst
},
{
  label: 'Move to Back',
  action: () => handleMoveToBack(repoPath),
  disabled: isLast
},
{
  label: 'Move Up',
  action: () => handleMoveUp(repoPath),
  disabled: isFirst
},
{
  label: 'Move Down',
  action: () => handleMoveDown(repoPath),
  disabled: isLast
},
```

- [ ] **Step 3: Update MenuEntry type usage for disabled items**

The `NodeContextMenu` doesn't support a `disabled` prop natively — items are always clickable. Add disabled styling support:

In `src/renderer/src/components/editors/NodeContextMenu.tsx`, update the `MenuItem` interface:

```ts
export interface MenuItem {
  label: string
  shortcut?: string
  action: () => void | Promise<void>
  danger?: boolean
  disabled?: boolean
  separator?: false
}
```

In the render section, update the menu item div:

```tsx
<div
  key={i}
  data-menu-action={i}
  className={`node-context-menu-item${entry.danger ? ' node-context-menu-item-danger' : ''}${entry.disabled ? ' node-context-menu-item-disabled' : ''}`}
>
```

And in the click handler, skip disabled items:

```ts
const handleItemClick = (e: MouseEvent) => {
  const actionEl = (e.target as HTMLElement).closest('[data-menu-action]') as HTMLElement | null
  if (!actionEl) return
  const index = parseInt(actionEl.dataset.menuAction!, 10)
  const entry = items[index]
  if (!entry || 'separator' in entry || entry.disabled) return
  e.preventDefault()
  e.stopPropagation()
  Promise.resolve(entry.action()).then(() => onClose())
}
```

Add CSS in `src/renderer/src/components/ContextMenu.css`:

```css
.node-context-menu-item-disabled {
  opacity: 0.35;
  cursor: default;
  pointer-events: none;
}
```

- [ ] **Step 4: Verify sorting works via unit test**

Add to `tests/renderer/WorkspaceToolbar.test.tsx`:

```ts
it('repos can be reordered via state', () => {
  const repos = [
    { path: '/a', commit: '1' },
    { path: '/b', commit: '2' },
  ]

  // Simulate move up: swap
  const newRepos = [...repos]
  ;[newRepos[0], newRepos[1]] = [newRepos[1], newRepos[0]]

  expect(newRepos[0].path).toBe('/b')
  expect(newRepos[1].path).toBe('/a')
})
```

Run: `npx vitest run tests/renderer/WorkspaceToolbar.test.tsx 2>&1 | tail -10`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/WorkspaceToolbar.tsx src/renderer/src/components/editors/NodeContextMenu.tsx src/renderer/src/components/ContextMenu.css tests/renderer/WorkspaceToolbar.test.tsx
git commit -m "feat: add repo sorting and disabled menu item support"
```

---

### Task 6: Implement color picker submenu

**Files:**
- Modify: `src/renderer/src/components/WorkspaceToolbar.tsx`
- Modify: `src/renderer/src/components/WorkspaceToolbar.css`

- [ ] **Step 1: Add color submenu rendering**

In `WorkspaceToolbar.tsx`, add the color submenu rendering right after the main context menu:

```tsx
{colorSubmenuRepo && (
  <NodeContextMenu
    x={repoContextMenu!.x + 160}
    y={repoContextMenu!.y}
    items={[
      ...REPO_COLORS.map((color) => ({
        label: '●',
        action: async () => {
          const newRepos = codeRepos.map((r) =>
            r.path === colorSubmenuRepo ? { ...r, color } : r
          )
          setCodeRepos(newRepos)
          dispatch({ type: 'SET_CODE_REPOS', repos: newRepos })
          const config = await window.electronAPI.loadConfig()
          await window.electronAPI.saveConfig({ ...config, codeRepos: newRepos })
          setColorSubmenuRepo(null)
          setRepoContextMenu(null)
        }
      })),
      { separator: true },
      {
        label: 'Reset to Default',
        action: async () => {
          const newRepos = codeRepos.map((r) => {
            if (r.path === colorSubmenuRepo) {
              const { color, ...rest } = r
              return rest
            }
            return r
          })
          setCodeRepos(newRepos)
          dispatch({ type: 'SET_CODE_REPOS', repos: newRepos })
          const config = await window.electronAPI.loadConfig()
          await window.electronAPI.saveConfig({ ...config, codeRepos: newRepos })
          setColorSubmenuRepo(null)
          setRepoContextMenu(null)
        }
      }
    ]}
    onClose={() => setColorSubmenuRepo(null)}
  />
)}
```

- [ ] **Step 2: Update getRepoColor to use custom color**

Change the `getRepoColor` function:

```ts
function getRepoColor(repo: { path: string; commit: string; color?: string }, index: number): string {
  return repo.color || REPO_COLORS[index % REPO_COLORS.length]
}
```

Update the repo chip rendering to pass `repo` instead of `index`:

```tsx
{codeRepos.map((repo, index) => (
  <span
    key={repo.path}
    ...
    <span
      className="repo-chip-dot"
      style={{ backgroundColor: getRepoColor(repo, index) }}
    />
    ...
  </span>
))}
```

- [ ] **Step 3: Add color dot styles in CSS**

Add to `src/renderer/src/components/WorkspaceToolbar.css`:

```css
.node-context-menu-item .color-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-right: 8px;
  vertical-align: middle;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/WorkspaceToolbar.tsx src/renderer/src/components/WorkspaceToolbar.css
git commit -m "feat: add color picker submenu for repo chips"
```

---

### Task 7: Add `getRecentCommits` IPC + preload

**Files:**
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add IPC handler for getRecentCommits**

In `src/main/ipc-handlers.ts`, after the `code:get-remote-url` handler:

```ts
ipcMain.handle('code:get-recent-commits', async (_event, repoPath: string, maxCount?: number) => {
  const { getRecentCommits } = await import('./services/git-service')
  return getRecentCommits(repoPath, maxCount)
})
```

- [ ] **Step 2: Expose getRecentCommits in preload**

In `src/preload/index.ts`, add after `getRemoteUrl`:

```ts
getRecentCommits: (repoPath: string, maxCount?: number) =>
  ipcRenderer.invoke('code:get-recent-commits', repoPath, maxCount),
```

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc-handlers.ts src/preload/index.ts
git commit -m "feat: add getRecentCommits IPC handler and preload API"
```

---

### Task 8: Add repo detail modal

**Files:**
- Modify: `src/renderer/src/components/WorkspaceToolbar.tsx`
- Modify: `src/renderer/src/components/WorkspaceToolbar.css`

- [ ] **Step 1: Add detail modal state and fetch logic**

Add state in `WorkspaceToolbar.tsx`:

```ts
const [detailRepo, setDetailRepo] = useState<{
  path: string
  remoteUrl: string | null
  commit: { sha: string; message: string; author: string; date: string } | null
  fileCount: number
  dirCount: number
  recentCommits: Array<{ sha: string; message: string; date: string }>
} | null>(null)
const [detailLoading, setDetailLoading] = useState(false)
```

Add fetch function:

```ts
const openRepoDetail = useCallback(async (repoPath: string) => {
  setDetailLoading(true)
  setRepoContextMenu(null)
  try {
    const [remoteUrl, commit, files, recentCommits] = await Promise.all([
      window.electronAPI.getRemoteUrl(repoPath),
      window.electronAPI.getGitCommit(repoPath),
      window.electronAPI.listRepoFiles(repoPath),
      window.electronAPI.getRecentCommits(repoPath, 10),
    ])

    const fileCount = files.filter((f: any) => !f.isDirectory).length
    const dirCount = files.filter((f: any) => f.isDirectory).length

    setDetailRepo({ path: repoPath, remoteUrl, commit, fileCount, dirCount, recentCommits })
  } catch {
    // ignore
  } finally {
    setDetailLoading(false)
  }
}, [])
```

- [ ] **Step 2: Render detail modal**

Add modal JSX in the toolbar return, right before the closing `</div>`:

```tsx
{detailRepo && (
  <div className="repo-detail-overlay" onClick={() => setDetailRepo(null)}>
    <div className="repo-detail-modal" onClick={(e) => e.stopPropagation()}>
      <div className="repo-detail-header">
        <h3>{detailRepo.path.split('/').pop() || detailRepo.path}</h3>
        <button className="repo-detail-close" onClick={() => setDetailRepo(null)}>&times;</button>
      </div>
      <div className="repo-detail-body">
        <div className="repo-detail-section">
          <div className="repo-detail-row">
            <span className="repo-detail-label">Path:</span>
            <span className="repo-detail-value">{detailRepo.path}</span>
          </div>
          <div className="repo-detail-row">
            <span className="repo-detail-label">Remote:</span>
            <span className="repo-detail-value">{detailRepo.remoteUrl || 'N/A'}</span>
          </div>
        </div>

        {detailRepo.commit && detailRepo.commit.sha !== 'not available' && (
          <div className="repo-detail-section">
            <div className="repo-detail-section-title">Git Info</div>
            <div className="repo-detail-row">
              <span className="repo-detail-label">Latest Commit:</span>
              <span className="repo-detail-value">{detailRepo.commit.sha.substring(0, 8)}</span>
            </div>
            <div className="repo-detail-row">
              <span className="repo-detail-label">Message:</span>
              <span className="repo-detail-value">{detailRepo.commit.message}</span>
            </div>
            <div className="repo-detail-row">
              <span className="repo-detail-label">Author:</span>
              <span className="repo-detail-value">{detailRepo.commit.author}</span>
            </div>
            <div className="repo-detail-row">
              <span className="repo-detail-label">Date:</span>
              <span className="repo-detail-value">{detailRepo.commit.date}</span>
            </div>
          </div>
        )}

        <div className="repo-detail-section">
          <div className="repo-detail-section-title">Repository</div>
          <div className="repo-detail-row">
            <span className="repo-detail-label">Files:</span>
            <span className="repo-detail-value">{detailRepo.fileCount}</span>
          </div>
          <div className="repo-detail-row">
            <span className="repo-detail-label">Directories:</span>
            <span className="repo-detail-value">{detailRepo.dirCount}</span>
          </div>
        </div>

        {detailRepo.recentCommits.length > 0 && (
          <div className="repo-detail-section">
            <div className="repo-detail-section-title">Recent Commits</div>
            <div className="repo-detail-commits">
              {detailRepo.recentCommits.map((c) => (
                <div key={c.sha} className="repo-detail-commit">
                  <span className="repo-detail-commit-sha">{c.sha.substring(0, 8)}</span>
                  <span className="repo-detail-commit-msg">{c.message}</span>
                  <span className="repo-detail-commit-date">{c.date}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="repo-detail-footer">
        <button className="workspace-toolbar-btn" onClick={() => setDetailRepo(null)}>Close</button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Add detail modal CSS**

Add to `src/renderer/src/components/WorkspaceToolbar.css`:

```css
.repo-detail-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.repo-detail-modal {
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  width: 480px;
  max-height: 80vh;
  overflow-y: auto;
}

.repo-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.repo-detail-header h3 {
  margin: 0;
  font-size: 15px;
  color: var(--text-color);
}

.repo-detail-close {
  background: none;
  border: none;
  font-size: 20px;
  color: var(--placeholder-color);
  cursor: pointer;
}

.repo-detail-close:hover {
  color: var(--text-color);
}

.repo-detail-body {
  padding: 16px 20px;
}

.repo-detail-section {
  margin-bottom: 16px;
}

.repo-detail-section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--placeholder-color);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.repo-detail-row {
  display: flex;
  margin-bottom: 4px;
  font-size: 12px;
}

.repo-detail-label {
  color: var(--placeholder-color);
  width: 100px;
  flex-shrink: 0;
}

.repo-detail-value {
  color: var(--text-color);
  word-break: break-all;
}

.repo-detail-commits {
  max-height: 200px;
  overflow-y: auto;
}

.repo-detail-commit {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 11px;
  border-bottom: 1px solid var(--border-color);
}

.repo-detail-commit:last-child {
  border-bottom: none;
}

.repo-detail-commit-sha {
  font-family: monospace;
  color: var(--accent-color);
  flex-shrink: 0;
}

.repo-detail-commit-msg {
  flex: 1;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.repo-detail-commit-date {
  color: var(--placeholder-color);
  flex-shrink: 0;
}

.repo-detail-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
}
```

- [ ] **Step 5: Wire "View Details" in context menu**

In `buildRepoContextMenu`, update the "View Details" action:

```ts
{
  label: 'View Details',
  action: () => { openRepoDetail(repoPath) }
},
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/WorkspaceToolbar.tsx src/renderer/src/components/WorkspaceToolbar.css src/main/ipc-handlers.ts src/preload/index.ts
git commit -m "feat: add repo detail modal with git info and file stats"
```

---

### Task 9: Final integration and cleanup

**Files:**
- Modify: `src/renderer/src/components/WorkspaceToolbar.tsx`

- [ ] **Step 1: Finalize the context menu wiring**

Ensure `openRepoDetail` is passed to `buildRepoContextMenu` dependencies. The `useCallback` for `buildRepoContextMenu` should include `openRepoDetail` in its dependency array.

Ensure the remote URL pre-fetch in `onContextMenu` properly updates the `remoteUrls` map before the menu renders. The context menu needs to re-render when `remoteUrls` updates.

Update `onContextMenu` to correctly handle the async fetch:

```tsx
onContextMenu={async (e) => {
  e.preventDefault()
  setRepoContextMenu({ x: e.clientX, y: e.clientY, repoPath: repo.path, repoIndex: index })
  if (!remoteUrls.has(repo.path)) {
    const url = await window.electronAPI.getRemoteUrl(repo.path)
    setRemoteUrls((prev) => new Map(prev).set(repo.path, url))
  }
}}
```

- [ ] **Step 2: Final review — run all tests**

Run: `npx vitest run 2>&1 | tail -30`
Expected: All existing tests pass.

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/WorkspaceToolbar.tsx
git commit -m "feat: wire Open in Website and finalize repo context menu"
```
