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

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  return res.json()
}

async function getWorkspacePathFromServer(): Promise<string | null> {
  try {
    const data = await get<{ path: string }>('/api/workspace')
    return data.path || null
  } catch {
    return null
  }
}

export function createWebApiClient() {
  return {
    platform: 'browser',

    getAppVersion: () => Promise.resolve('web'),

    getProjectPath: () => getWorkspacePathFromServer(),

    // Workspace (read-only in browser)
    selectFolder: () => Promise.resolve(null),
    createWorkspace: () => Promise.resolve(''),
    openWorkspace: () => Promise.resolve(null as any),
    getWorkspacePath: () => getWorkspacePathFromServer(),

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
    resolveRefs: (notePath: string, content: string) => {
      const params = new URLSearchParams({ content })
      if (notePath) params.set('notePath', notePath)
      return get(`/api/code/resolve-refs?${params.toString()}`)
    },
    querySymbols: (name?: string, filePath?: string, kind?: string) => {
      const params = new URLSearchParams()
      if (name) params.set('name', name)
      if (filePath) params.set('file', filePath)
      if (kind) params.set('kind', kind)
      return get(`/api/code/symbols?${params.toString()}`)
    },

    // UI state
    loadUiState: () => get('/api/ui-state').catch(() => null),
    saveUiState: (state: unknown) => post('/api/ui-state', state).catch(() => {}),

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
