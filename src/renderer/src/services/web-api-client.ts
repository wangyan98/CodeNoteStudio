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

    // Workspace (read-only in browser)
    selectFolder: () => Promise.resolve(null),
    createWorkspace: () => Promise.resolve(''),
    openWorkspace: () => Promise.resolve(null as any),
    getWorkspacePath: () => Promise.resolve(null),

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

// WebSocket live events support
type LiveEventHandler = (type: string, payload: unknown) => void
const listeners: Set<LiveEventHandler> = new Set()

export function onLiveEvent(handler: LiveEventHandler) {
  listeners.add(handler)
  return () => listeners.delete(handler)
}

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
    setTimeout(connectWebSocket, 3000)
  }

  ws.onerror = () => { /* silently handle errors */ }
}

if (typeof window.electronAPI === 'undefined') {
  connectWebSocket()
}
