import { contextBridge, ipcRenderer } from 'electron'

const api = {
  platform: process.platform,

  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),

  getProjectPath: (): Promise<string | null> => ipcRenderer.invoke('app:get-project-path'),

  // Workspace
  selectFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:select-folder'),
  createWorkspace: (dirPath: string): Promise<string> =>
    ipcRenderer.invoke('workspace:create', dirPath),
  openWorkspace: (newPath: string) => ipcRenderer.invoke('workspace:open', newPath),
  getWorkspacePath: (): Promise<string | null> => ipcRenderer.invoke('workspace:get-current'),
  getWorkspaceHistory: (): Promise<Array<{ path: string; name: string; lastOpened: number }>> =>
    ipcRenderer.invoke('workspace:get-history'),
  removeFromWorkspaceHistory: (workspacePath: string): Promise<void> =>
    ipcRenderer.invoke('workspace:remove-from-history', workspacePath),
  clearWorkspace: (): Promise<void> =>
    ipcRenderer.invoke('workspace:clear'),

  // Config
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (config: unknown) => ipcRenderer.invoke('config:save', config),

  // Notes
  listNotes: (filterType?: string) => ipcRenderer.invoke('notes:list', filterType),
  createNote: (relativePath: string, type: string) =>
    ipcRenderer.invoke('notes:create', relativePath, type),
  readNote: (relativePath: string) => ipcRenderer.invoke('notes:read', relativePath),
  updateNote: (relativePath: string, content: unknown) =>
    ipcRenderer.invoke('notes:update', relativePath, content),
  deleteNote: (relativePath: string) => ipcRenderer.invoke('notes:delete', relativePath),
  renameNote: (oldPath: string, newPath: string) =>
    ipcRenderer.invoke('notes:rename', oldPath, newPath),
  noteExists: (relativePath: string) => ipcRenderer.invoke('notes:exists', relativePath),
  createFolder: (relativePath: string) => ipcRenderer.invoke('notes:create-folder', relativePath),
  copyFile: (sourcePath: string, targetDir: string) =>
    ipcRenderer.invoke('notes:copy-file', sourcePath, targetDir),
  deleteFolder: (relativePath: string) => ipcRenderer.invoke('notes:delete-folder', relativePath),

  // Code
  listRepoFiles: (repoPath: string) => ipcRenderer.invoke('code:list-repo-files', repoPath),
  readCodeFile: (absolutePath: string) => ipcRenderer.invoke('code:read-file', absolutePath),
  readBinaryFile: (absolutePath: string) => ipcRenderer.invoke('code:read-binary-file', absolutePath),
  getGitCommit: (repoPath: string) => ipcRenderer.invoke('code:get-git-commit', repoPath),
  getRemoteUrl: (repoPath: string) => ipcRenderer.invoke('code:get-remote-url', repoPath),
  getRecentCommits: (repoPath: string, maxCount?: number) =>
    ipcRenderer.invoke('code:get-recent-commits', repoPath, maxCount),
  parseSymbols: (filePaths: string[]) => ipcRenderer.invoke('code:parse-symbols', filePaths),
  indexSymbols: (repoPath: string) => ipcRenderer.invoke('code:index-symbols', repoPath),
  resolveRefs: (notePath: string, content: string, activeRepoPath?: string) =>
    ipcRenderer.invoke('code:resolve-refs', notePath, content, activeRepoPath),
  querySymbols: (name?: string, filePath?: string, kind?: string) =>
    ipcRenderer.invoke('code:query-symbols', name, filePath, kind),
  copyFileToAssets: (sourcePath: string) =>
    ipcRenderer.invoke('code:copy-file-to-assets', sourcePath),

  // Layer catalog
  readLayerCatalog: (projectPath: string) => ipcRenderer.invoke('catalog:read-layer-catalog', projectPath),

  // Server
  startServer: (port?: number) => ipcRenderer.invoke('server:start', port),
  stopServer: () => ipcRenderer.invoke('server:stop'),
  getServerStatus: () => ipcRenderer.invoke('server:status'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  openPath: (dirPath: string) => ipcRenderer.invoke('shell:open-path', dirPath),

  // UI state
  loadUiState: () => ipcRenderer.invoke('ui-state:load'),
  saveUiState: (workspacePath: string, state: unknown) => ipcRenderer.invoke('ui-state:save', workspacePath, state),

  // Agent
  startAgent: () => ipcRenderer.invoke('agent:start'),
  stopAgent: () => ipcRenderer.invoke('agent:stop'),
  getAgentPort: () => ipcRenderer.invoke('agent:get-port'),

  // File watcher
  onNotesChanged: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('notes:changed', handler)
    return () => { ipcRenderer.removeListener('notes:changed', handler) }
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
