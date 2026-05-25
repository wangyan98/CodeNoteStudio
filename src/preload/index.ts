import { contextBridge, ipcRenderer } from 'electron'

const api = {
  platform: process.platform,

  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),

  getProjectPath: (): Promise<string | null> => ipcRenderer.invoke('app:get-project-path'),

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

  // Code
  listRepoFiles: (repoPath: string) => ipcRenderer.invoke('code:list-repo-files', repoPath),
  readCodeFile: (absolutePath: string) => ipcRenderer.invoke('code:read-file', absolutePath),
  getGitCommit: (repoPath: string) => ipcRenderer.invoke('code:get-git-commit', repoPath)
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
