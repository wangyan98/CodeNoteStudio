import { contextBridge, ipcRenderer } from 'electron'

const api = {
  platform: process.platform,

  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version')
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
