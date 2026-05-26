# Web Live Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Web Live Server that starts from the desktop app, serves the renderer UI over HTTP, exposes REST APIs for read-only note/code browsing, and pushes live updates via WebSocket — enabling browser-based viewing of notes and code on the local network.

**Architecture:** An Express server runs in the Electron main process alongside the existing IPC handlers. It serves the production renderer build as static files and exposes REST endpoints that mirror the read-only IPC channels. A `ws` WebSocket server pushes note/config changes to connected browser clients. The renderer detects browser mode (no `window.electronAPI`) and creates a `WebApiClient` that mimics the electronAPI interface using `fetch()`, so existing components work unchanged. A `ServerStatus` component in the desktop UI shows start/stop controls, port number, and a copyable URL.

**Tech Stack:** express, ws (already installed), @types/express, @types/ws

---

### File Structure Map

```
src/main/
├── index.ts                              # unchanged
├── ipc-handlers.ts                       # Modify: add server:start, server:stop, server:status
├── services/
│   └── live-server.ts                    # New: Express + ws server management
src/preload/
├── index.ts                              # Modify: add startServer, stopServer, getServerStatus APIs
src/renderer/src/
├── main.tsx                              # Modify: detect browser mode, create WebApiClient before render
├── services/
│   └── web-api-client.ts                 # New: browser-side fetch()-based API client
├── hooks/
│   └── useLiveServer.ts                  # New: React hook for server state
├── components/
│   ├── Layout.tsx                        # Modify: conditionally render ServerStatus toolbar
│   └── ServerStatus.tsx                  # New: start/stop button + URL display
│   └── ServerStatus.css                  # New: styles
├── contexts/
│   └── AppContext.tsx                     # Modify: add isReadOnly to state, update reducer
tests/main/
├── live-server.test.ts                   # New: server start/stop + REST API tests
```

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install npm packages**

```bash
cd /Users/wangyan/Desktop/note && npm install express @types/express @types/ws
```

Note: `ws` is already installed as a transitive dependency. We pin it explicitly as a direct dependency:

```bash
npm install ws
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add express, ws, and type definitions for web live server"
```

---

### Task 2: Build live-server service

**Files:**
- Create: `src/main/services/live-server.ts`

- [ ] **Step 1: Write the live-server service**

Create `src/main/services/live-server.ts`:

```typescript
import express, { type Express, type Request, type Response } from 'express'
import { createServer, type Server as HttpServer } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import path from 'node:path'
import fs from 'node:fs'

export interface ServerStatus {
  running: boolean
  port: number
  url: string
}

interface LiveServerState {
  httpServer: HttpServer | null
  app: Express | null
  wss: WebSocketServer | null
  port: number
  projectPath: string
  connectedClients: Set<WebSocket>
}

let state: LiveServerState = {
  httpServer: null,
  app: null,
  wss: null,
  port: 0,
  projectPath: '',
  connectedClients: new Set()
}

function getRendererDir(): string {
  // In production, the renderer build output is at out/renderer/
  const candidates = [
    path.join(process.cwd(), 'out', 'renderer'),
    path.join(__dirname, '..', '..', '..', 'out', 'renderer')
  ]
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) {
      return dir
    }
  }
  return path.join(process.cwd(), 'out', 'renderer')
}

function createApp(projectPath: string): Express {
  const app = express()
  const rendererDir = getRendererDir()

  // Serve static files from the renderer build
  app.use(express.static(rendererDir))

  // ===== REST API (read-only mirrors of IPC handlers) =====

  // Config
  app.get('/api/config', async (_req: Request, res: Response) => {
    try {
      const { loadConfig } = await import('./notebook-config')
      const config = await loadConfig(projectPath)
      res.json(config)
    } catch (e) {
      res.status(500).json({ error: String(e) })
    }
  })

  // Notes
  app.get('/api/notes', async (req: Request, res: Response) => {
    try {
      const { listNotes } = await import('./note-service')
      const filterType = req.query.filter as string | undefined
      const notes = await listNotes(projectPath, filterType as any)
      res.json(notes)
    } catch (e) {
      res.status(500).json({ error: String(e) })
    }
  })

  app.get('/api/notes/*', async (req: Request, res: Response) => {
    try {
      const { readNote } = await import('./note-service')
      const relativePath = req.params[0] || req.path.slice('/api/notes/'.length)
      const content = await readNote(projectPath, relativePath)
      res.json(content)
    } catch (e) {
      res.status(500).json({ error: String(e) })
    }
  })

  // Code
  app.get('/api/code/files', async (req: Request, res: Response) => {
    try {
      const { listRepoFiles } = await import('./file-system')
      const repoPath = (req.query.repo as string) || projectPath
      const files = await listRepoFiles(repoPath)
      res.json(files)
    } catch (e) {
      res.status(500).json({ error: String(e) })
    }
  })

  app.get('/api/code/file', async (req: Request, res: Response) => {
    try {
      const { readTextFile } = await import('./file-system')
      const filePath = req.query.path as string
      if (!filePath) {
        res.status(400).json({ error: 'Missing path parameter' })
        return
      }
      const content = await readTextFile(filePath)
      res.type('text/plain').send(content)
    } catch (e) {
      res.status(500).json({ error: String(e) })
    }
  })

  app.get('/api/code/git-commit', async (req: Request, res: Response) => {
    try {
      const { getCommitInfo } = await import('./git-service')
      const repoPath = (req.query.repo as string) || projectPath
      const info = await getCommitInfo(repoPath)
      res.json(info)
    } catch (e) {
      res.status(500).json({ error: String(e) })
    }
  })

  app.get('/api/code/symbols', async (req: Request, res: Response) => {
    try {
      const { initSymbolDatabase, querySymbols } = await import('./symbol-index')
      const name = req.query.name as string | undefined
      const filePath = req.query.file as string | undefined
      const kind = req.query.kind as string | undefined

      const db = initSymbolDatabase(projectPath)
      const results = querySymbols(db, name, filePath, kind)
      db.close()
      res.json(results)
    } catch (e) {
      res.status(500).json({ error: String(e) })
    }
  })

  app.get('/api/code/resolve-refs', async (req: Request, res: Response) => {
    try {
      const { parseRefs, resolveRefs } = await import('./ref-resolver')
      const { initSymbolDatabase, querySymbols } = await import('./symbol-index')
      const content = req.query.content as string

      if (!content) {
        res.json([])
        return
      }

      const refs = parseRefs(content)
      if (refs.length === 0) {
        res.json([])
        return
      }

      const db = initSymbolDatabase(projectPath)
      const allSymbols = querySymbols(db)
      db.close()
      res.json(resolveRefs(refs, allSymbols))
    } catch (e) {
      res.status(500).json({ error: String(e) })
    }
  })

  // SPA fallback: serve index.html for all non-API, non-static routes
  app.get('*', (_req: Request, res: Response) => {
    const indexPath = path.join(rendererDir, 'index.html')
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath)
    } else {
      res.status(404).send('Not found')
    }
  })

  return app
}

export async function startServer(projectPath: string, port = 3456): Promise<ServerStatus> {
  if (state.httpServer) {
    return { running: true, port: state.port, url: `http://localhost:${state.port}` }
  }

  state.projectPath = projectPath
  state.port = port

  const app = createApp(projectPath)
  const httpServer = createServer(app)

  // WebSocket server for live updates
  const wss = new WebSocketServer({ server: httpServer })

  wss.on('connection', (ws: WebSocket) => {
    state.connectedClients.add(ws)

    ws.on('close', () => {
      state.connectedClients.delete(ws)
    })
  })

  return new Promise((resolve, reject) => {
    httpServer.listen(port, () => {
      state.httpServer = httpServer
      state.app = app
      state.wss = wss

      resolve({
        running: true,
        port,
        url: `http://localhost:${port}`
      })
    })

    httpServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        // Try next port
        startServer(projectPath, port + 1).then(resolve).catch(reject)
      } else {
        reject(err)
      }
    })
  })
}

export async function stopServer(): Promise<void> {
  if (!state.httpServer) return

  return new Promise((resolve) => {
    // Close all WebSocket connections
    for (const client of state.connectedClients) {
      client.close()
    }
    state.connectedClients.clear()

    if (state.wss) {
      state.wss.close()
      state.wss = null
    }

    state.httpServer!.close(() => {
      state.httpServer = null
      state.app = null
      state.port = 0
      resolve()
    })
  })
}

export function getServerStatus(): ServerStatus {
  return {
    running: state.httpServer !== null,
    port: state.port,
    url: state.httpServer ? `http://localhost:${state.port}` : ''
  }
}

export function broadcastMessage(type: string, payload: unknown): void {
  if (!state.wss) return

  const message = JSON.stringify({ type, payload })
  for (const client of state.connectedClients) {
    if (client.readyState === client.OPEN) {
      client.send(message)
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/services/live-server.ts
git commit -m "feat: add live server service with Express + WebSocket"
```

---

### Task 3: Write live-server tests

**Files:**
- Create: `tests/main/live-server.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/main/live-server.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { startServer, stopServer, getServerStatus } from '../../src/main/services/live-server'

describe('live-server', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'cns-server-'))
    // Create minimal project structure for the server
    mkdirSync(join(testDir, 'notes'), { recursive: true })
    writeFileSync(join(testDir, 'notebook.json'), JSON.stringify({
      name: 'test',
      codeRepos: []
    }))

    // Create a minimal renderer build so static serving works
    const outRenderer = join(testDir, 'out', 'renderer')
    mkdirSync(outRenderer, { recursive: true })
    writeFileSync(join(outRenderer, 'index.html'), '<!doctype html><html><body>Test</body></html>')
  })

  afterEach(async () => {
    await stopServer()
    rmSync(testDir, { recursive: true, force: true })
  })

  describe('startServer / stopServer', () => {
    it('starts and stops the server', async () => {
      const originalCwd = process.cwd()
      process.chdir(testDir)
      try {
        const status = await startServer(testDir, 9876)
        expect(status.running).toBe(true)
        expect(status.port).toBe(9876)
        expect(status.url).toContain('localhost:9876')

        expect(getServerStatus().running).toBe(true)

        await stopServer()
        expect(getServerStatus().running).toBe(false)
      } finally {
        process.chdir(originalCwd)
      }
    })

    it('returns existing status when already running', async () => {
      const originalCwd = process.cwd()
      process.chdir(testDir)
      try {
        const s1 = await startServer(testDir, 9877)
        const s2 = await startServer(testDir, 9877)
        expect(s2.port).toBe(s1.port)
      } finally {
        process.chdir(originalCwd)
      }
    })

    it('stopServer is a no-op when not running', async () => {
      await stopServer() // should not throw
      expect(getServerStatus().running).toBe(false)
    })
  })

  describe('REST API', () => {
    it('GET /api/config returns notebook config', async () => {
      const originalCwd = process.cwd()
      process.chdir(testDir)
      try {
        await startServer(testDir, 9878)
        const res = await fetch('http://localhost:9878/api/config')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.name).toBe('test')
      } finally {
        process.chdir(originalCwd)
      }
    })

    it('GET /api/notes returns notes list', async () => {
      const originalCwd = process.cwd()
      process.chdir(testDir)
      try {
        await startServer(testDir, 9879)
        const res = await fetch('http://localhost:9878/api/notes')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(Array.isArray(body)).toBe(true)
      } finally {
        process.chdir(originalCwd)
      }
    })

    it('serves static index.html', async () => {
      const originalCwd = process.cwd()
      process.chdir(testDir)
      try {
        await startServer(testDir, 9880)
        const res = await fetch('http://localhost:9880/')
        expect(res.status).toBe(200)
        const body = await res.text()
        expect(body).toContain('Test')
      } finally {
        process.chdir(originalCwd)
      }
    })

    it('handles missing query params gracefully', async () => {
      const originalCwd = process.cwd()
      process.chdir(testDir)
      try {
        await startServer(testDir, 9881)
        const res = await fetch('http://localhost:9881/api/code/file')
        expect(res.status).toBe(400)
      } finally {
        process.chdir(originalCwd)
      }
    })
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

The test uses `fetch()` to hit the server but the server looks for `out/renderer` relative to `process.cwd()`. Since we `chdir` into the test dir, the renderer static files need to be findable. The test creates the `out/renderer/index.html` in the test dir for this purpose.

```bash
cd /Users/wangyan/Desktop/note && npx vitest run tests/main/live-server.test.ts
```

Expected: FAIL — `startServer` not exported (file doesn't exist yet)

- [ ] **Step 3: Run tests — expect PASS**

```bash
cd /Users/wangyan/Desktop/note && npx vitest run tests/main/live-server.test.ts
```

Expected: PASS (7 tests)

- [ ] **Step 4: Commit**

```bash
git add tests/main/live-server.test.ts
git commit -m "test: add live-server integration tests"
```

---

### Task 4: Add IPC handlers

**Files:**
- Modify: `src/main/ipc-handlers.ts`

- [ ] **Step 1: Add server IPC handlers**

In `src/main/ipc-handlers.ts`, add after the `code:resolve-refs` handler (inside the `registerIpcHandlers` function, before the closing brace):

```typescript
  // Live server
  ipcMain.handle('server:start', async (_event, port?: number) => {
    const { startServer } = await import('./services/live-server')
    return startServer(currentProjectPath!, port)
  })

  ipcMain.handle('server:stop', async () => {
    const { stopServer } = await import('./services/live-server')
    return stopServer()
  })

  ipcMain.handle('server:status', async () => {
    const { getServerStatus } = await import('./services/live-server')
    return getServerStatus()
  })
```

- [ ] **Step 2: Stop server on quit**

In `src/main/index.ts`, add a call to stop the server before app quits. Add an import at the top:

```typescript
import { stopServer } from './services/live-server'
```

And in the `app.on('will-quit', ...)` handler, add `stopServer()`:

```typescript
app.on('will-quit', async () => {
  unregisterIpcHandlers()
  await stopServer()
})
```

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc-handlers.ts src/main/index.ts
git commit -m "feat: add IPC handlers for live server start/stop/status"
```

---

### Task 5: Add preload APIs and type declarations

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/types/electron.d.ts`

- [ ] **Step 1: Add preload APIs**

In `src/preload/index.ts`, add to the `api` object:

```typescript
  // Server
  startServer: (port?: number) => ipcRenderer.invoke('server:start', port),
  stopServer: () => ipcRenderer.invoke('server:stop'),
  getServerStatus: () => ipcRenderer.invoke('server:status')
```

- [ ] **Step 2: Update electron.d.ts**

In `src/renderer/src/types/electron.d.ts`, add to the `Window.electronAPI` interface:

```typescript
      startServer: (port?: number) => Promise<{ running: boolean; port: number; url: string }>
      stopServer: () => Promise<void>
      getServerStatus: () => Promise<{ running: boolean; port: number; url: string }>
```

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts src/renderer/src/types/electron.d.ts
git commit -m "feat: add preload APIs and types for live server"
```

---

### Task 6: Build web API client for browser mode

**Files:**
- Create: `src/renderer/src/services/web-api-client.ts`

- [ ] **Step 1: Write the web API client**

Create `src/renderer/src/services/web-api-client.ts`:

```typescript
const BASE = ''

async function get<T>(url: string): Promise<T> {
  const res = await fetch(BASE + url)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return res.json()
  }
  return res.text() as unknown as T
}

export function createWebApiClient() {
  return {
    platform: 'browser',

    getAppVersion: () => Promise.resolve('web'),

    getProjectPath: () => Promise.resolve(null),

    // Config
    loadConfig: () => get('/api/config'),
    saveConfig: () => Promise.resolve(),

    // Notes
    listNotes: (filterType?: string) =>
      get(`/api/notes${filterType ? `?filter=${filterType}` : ''}`),
    readNote: (relativePath: string) =>
      get(`/api/notes/${encodeURIComponent(relativePath)}`),
    createNote: () => Promise.resolve(),
    updateNote: () => Promise.resolve(),
    deleteNote: () => Promise.resolve(),
    renameNote: () => Promise.resolve(),
    noteExists: () => Promise.resolve(true),

    // Code
    listRepoFiles: (repoPath: string) =>
      get(`/api/code/files?repo=${encodeURIComponent(repoPath)}`),
    readCodeFile: (absolutePath: string) =>
      get(`/api/code/file?path=${encodeURIComponent(absolutePath)}`),
    getGitCommit: (repoPath: string) =>
      get(`/api/code/git-commit?repo=${encodeURIComponent(repoPath)}`),
    parseSymbols: () => Promise.resolve([]),
    indexSymbols: () => Promise.resolve({ indexed: 0, totalFiles: 0 }),
    resolveRefs: (_notePath: string, content: string) =>
      get(`/api/code/resolve-refs?content=${encodeURIComponent(content)}`),

    // Server (no-op in browser)
    startServer: () => Promise.resolve({ running: false, port: 0, url: '' }),
    stopServer: () => Promise.resolve(),
    getServerStatus: () => Promise.resolve({ running: false, port: 0, url: '' })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/services/web-api-client.ts
git commit -m "feat: add web API client for browser mode"
```

---

### Task 7: Modify renderer entry for browser mode detection

**Files:**
- Modify: `src/renderer/src/main.tsx`
- Modify: `src/renderer/src/contexts/AppContext.tsx`

- [ ] **Step 1: Detect browser mode in main.tsx**

In `src/renderer/src/main.tsx`, add browser detection before rendering. The file currently reads:

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

Change to:

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { createWebApiClient } from './services/web-api-client'

const IS_BROWSER = typeof window.electronAPI === 'undefined'

if (IS_BROWSER) {
  ;(window as any).electronAPI = createWebApiClient()
  console.log('[web-live-server] Running in browser mode')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App isReadOnly={IS_BROWSER} />
  </StrictMode>
)
```

- [ ] **Step 2: Update App.tsx to accept isReadOnly**

In `src/renderer/src/App.tsx`, the current `App` function takes no props. Update it:

```typescript
export function App({ isReadOnly = false }: { isReadOnly?: boolean }) {
  return (
    <AppProvider isReadOnly={isReadOnly}>
      <Layout />
    </AppProvider>
  )
}
```

- [ ] **Step 3: Update AppContext for isReadOnly**

In `src/renderer/src/contexts/AppContext.tsx`, add `isReadOnly` to the provider. Read the file to find the `AppProvider` function and update its props:

```typescript
interface AppProviderProps {
  children: React.ReactNode
  initialStateOverride?: AppState
  isReadOnly?: boolean
}

export function AppProvider({ children, initialStateOverride, isReadOnly = false }: AppProviderProps) {
  const [state, dispatch] = useReducer(appReducer, initialStateOverride || initialState)

  return (
    <AppContext.Provider value={{ state, dispatch, isReadOnly }}>
      {children}
    </AppContext.Provider>
  )
}
```

And update the context value type to include `isReadOnly`:

```typescript
interface AppContextValue {
  state: AppState
  dispatch: React.Dispatch<AppAction>
  isReadOnly: boolean
}
```

Update the `useAppContext` hook return type accordingly — it already returns `{ state, dispatch }`, add `isReadOnly`.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/main.tsx src/renderer/src/App.tsx src/renderer/src/contexts/AppContext.tsx
git commit -m "feat: add browser mode detection and isReadOnly context"
```

---

### Task 8: Add server status UI component

**Files:**
- Create: `src/renderer/src/hooks/useLiveServer.ts`
- Create: `src/renderer/src/components/ServerStatus.tsx`
- Create: `src/renderer/src/components/ServerStatus.css`
- Modify: `src/renderer/src/components/Layout.tsx`

- [ ] **Step 1: Create useLiveServer hook**

Create `src/renderer/src/hooks/useLiveServer.ts`:

```typescript
import { useState, useCallback, useEffect } from 'react'

interface ServerState {
  running: boolean
  port: number
  url: string
  loading: boolean
}

export function useLiveServer(isReadOnly: boolean) {
  const [server, setServer] = useState<ServerState>({
    running: false,
    port: 0,
    url: '',
    loading: false
  })

  useEffect(() => {
    if (isReadOnly) return
    window.electronAPI.getServerStatus().then((status) => {
      setServer((prev) => ({ ...prev, ...status, loading: false }))
    })
  }, [isReadOnly])

  const startServer = useCallback(async () => {
    if (isReadOnly) return
    setServer((prev) => ({ ...prev, loading: true }))
    const status = await window.electronAPI.startServer()
    setServer({ ...status, loading: false })
  }, [isReadOnly])

  const stopServer = useCallback(async () => {
    if (isReadOnly) return
    setServer((prev) => ({ ...prev, loading: true }))
    await window.electronAPI.stopServer()
    setServer({ running: false, port: 0, url: '', loading: false })
  }, [isReadOnly])

  return { ...server, startServer, stopServer }
}
```

- [ ] **Step 2: Create ServerStatus component**

Create `src/renderer/src/components/ServerStatus.tsx`:

```typescript
import { useLiveServer } from '../hooks/useLiveServer'
import { useAppContext } from '../contexts/AppContext'
import './ServerStatus.css'

export function ServerStatus() {
  const { isReadOnly } = useAppContext()
  const { running, url, loading, startServer, stopServer } = useLiveServer(isReadOnly)

  if (isReadOnly) return null

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(url)
  }

  return (
    <div className="server-status-bar">
      {running ? (
        <>
          <span className="server-status-indicator server-running"></span>
          <span className="server-url">{url}</span>
          <button className="server-btn" onClick={handleCopyUrl}>Copy</button>
          <button
            className="server-btn server-stop"
            onClick={stopServer}
            disabled={loading}
          >
            Stop
          </button>
        </>
      ) : (
        <>
          <span className="server-status-indicator server-stopped"></span>
          <span className="server-label">Web server offline</span>
          <button
            className="server-btn server-start"
            onClick={startServer}
            disabled={loading}
          >
            Start Live Server
          </button>
        </>
      )}
    </div>
  )
}
```

Create `src/renderer/src/components/ServerStatus.css`:

```css
.server-status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  font-size: 12px;
  height: 28px;
  flex-shrink: 0;
}

.server-status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.server-running {
  background: #4caf50;
  box-shadow: 0 0 4px #4caf50;
}

.server-stopped {
  background: #888;
}

.server-label {
  color: var(--text-muted);
}

.server-url {
  color: var(--text-primary);
  font-family: monospace;
}

.server-btn {
  padding: 2px 8px;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  background: var(--bg-primary);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 11px;
}

.server-btn:hover {
  background: var(--bg-hover);
}

.server-start {
  background: #1a73e8;
  color: white;
  border-color: #1a73e8;
}

.server-stop {
  background: #d93025;
  color: white;
  border-color: #d93025;
}
```

- [ ] **Step 3: Add ServerStatus to Layout**

In `src/renderer/src/components/Layout.tsx`, add `<ServerStatus />` at the bottom of the layout (after the four-panel PanelGroup, as a footer bar). Import the component:

```typescript
import { ServerStatus } from './ServerStatus'
```

And render it after the closing `</PanelGroup>` tag:

```typescript
      </PanelGroup>
      <ServerStatus />
    </div>
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/hooks/useLiveServer.ts src/renderer/src/components/ServerStatus.tsx src/renderer/src/components/ServerStatus.css src/renderer/src/components/Layout.tsx
git commit -m "feat: add live server start/stop UI with status bar"
```

---

### Task 9: Broadcast note changes via WebSocket

**Files:**
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/renderer/src/services/web-api-client.ts`

- [ ] **Step 1: Broadcast on note save/update**

In `src/main/ipc-handlers.ts`, modify the `notes:update` handler to broadcast to WebSocket clients after saving:

```typescript
  ipcMain.handle('notes:update', async (_event, relativePath: string, content: NoteContent): Promise<void> => {
    await updateNote(projectPath, relativePath, content)
    const { broadcastMessage } = await import('./services/live-server')
    broadcastMessage('note-updated', { relativePath, content })
  })
```

Also broadcast in `notes:create` and `notes:delete`:

```typescript
  ipcMain.handle('notes:create', async (_event, relativePath: string, type: NoteFileType): Promise<void> => {
    await createNote(projectPath, relativePath, type)
    const { broadcastMessage } = await import('./services/live-server')
    broadcastMessage('note-created', { relativePath, type })
  })

  ipcMain.handle('notes:delete', async (_event, relativePath: string): Promise<void> => {
    await deleteNote(projectPath, relativePath)
    const { broadcastMessage } = await import('./services/live-server')
    broadcastMessage('note-deleted', { relativePath })
  })
```

- [ ] **Step 2: Add WebSocket listener to web API client**

In `src/renderer/src/services/web-api-client.ts`, add a WebSocket connection and event dispatch. Add at the bottom of the file:

```typescript
type LiveEventHandler = (type: string, payload: unknown) => void
const listeners: Set<LiveEventHandler> = new Set()

export function onLiveEvent(handler: LiveEventHandler) {
  listeners.add(handler)
  return () => listeners.delete(handler)
}

// Connect WebSocket when in browser mode
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//${window.location.host}`
  const ws = new WebSocket(wsUrl)

  ws.onmessage = (event) => {
    try {
      const { type, payload } = JSON.parse(event.data)
      for (const listener of listeners) {
        listener(type, payload)
      }
    } catch { /* ignore malformed messages */ }
  }

  ws.onclose = () => {
    // Reconnect after 3 seconds
    setTimeout(connectWebSocket, 3000)
  }
}

if (typeof window.electronAPI === 'undefined') {
  connectWebSocket()
}
```

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc-handlers.ts src/renderer/src/services/web-api-client.ts
git commit -m "feat: broadcast note changes to browser clients via WebSocket"
```

---

### Task 10: Final verification

**Files:**
- None (verification only)

- [ ] **Step 1: TypeScript check**

```bash
cd /Users/wangyan/Desktop/note && npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json
```

Fix any type errors.

- [ ] **Step 2: Run all tests**

```bash
cd /Users/wangyan/Desktop/note && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Build**

```bash
cd /Users/wangyan/Desktop/note && npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit any remaining changes**

```bash
git status
# If there are any uncommitted fixes from Steps 1-3:
git add -A
git commit -m "chore: fix type errors and finalize web live server"
```

---

### Verification Checklist

```
[ ] express starts and stops on IPC command
[ ] REST API returns notebook config
[ ] REST API returns notes list
[ ] REST API returns note content for all 3 types
[ ] REST API returns code file listing
[ ] REST API returns code file content
[ ] REST API returns git commit info
[ ] REST API returns code symbols
[ ] REST API resolves @ref annotations
[ ] Static files served from out/renderer/
[ ] SPA fallback serves index.html for unknown routes
[ ] WebSocket broadcasts on note create/update/delete
[ ] Browser mode detected (no window.electronAPI)
[ ] WebApiClient created before React render
[ ] Server status bar shows controls in desktop mode
[ ] Server status bar hidden in browser mode
[ ] Copy URL button works
[ ] Port conflict auto-increments to next port
[ ] All tests pass
[ ] TypeScript check passes
[ ] Build succeeds
```
