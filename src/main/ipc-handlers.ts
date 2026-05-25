import { ipcMain } from 'electron'
import { loadConfig, saveConfig } from './services/notebook-config'
import {
  createNote,
  readNote,
  updateNote,
  deleteNote,
  renameNote,
  listNotes,
  noteExists
} from './services/note-service'
import { initDatabase, closeDatabase } from './services/index-db'
import type { NotebookConfig } from './types'
import type { NoteFileType, NoteListItem } from './types'
import type { NoteContent } from './services/note-service'

let currentProjectPath: string | null = null

export function registerIpcHandlers(projectPath: string): void {
  currentProjectPath = projectPath

  initDatabase(projectPath)

  // Notebook config
  ipcMain.handle('config:load', async (): Promise<NotebookConfig> => {
    return loadConfig(projectPath)
  })

  ipcMain.handle('config:save', async (_event, config: NotebookConfig): Promise<void> => {
    return saveConfig(projectPath, config)
  })

  // Notes
  ipcMain.handle('notes:list', async (_event, filterType?: NoteFileType): Promise<NoteListItem[]> => {
    return listNotes(projectPath, filterType)
  })

  ipcMain.handle('notes:create', async (_event, relativePath: string, type: NoteFileType): Promise<void> => {
    return createNote(projectPath, relativePath, type)
  })

  ipcMain.handle('notes:read', async (_event, relativePath: string): Promise<NoteContent> => {
    return readNote(projectPath, relativePath)
  })

  ipcMain.handle('notes:update', async (_event, relativePath: string, content: NoteContent): Promise<void> => {
    return updateNote(projectPath, relativePath, content)
  })

  ipcMain.handle('notes:delete', async (_event, relativePath: string): Promise<void> => {
    return deleteNote(projectPath, relativePath)
  })

  ipcMain.handle('notes:rename', async (_event, oldPath: string, newPath: string): Promise<void> => {
    return renameNote(projectPath, oldPath, newPath)
  })

  ipcMain.handle('notes:exists', async (_event, relativePath: string): Promise<boolean> => {
    return noteExists(projectPath, relativePath)
  })

  // App
  ipcMain.handle('app:get-project-path', (): string | null => {
    return currentProjectPath
  })
}

export function unregisterIpcHandlers(): void {
  closeDatabase()
  currentProjectPath = null
}
