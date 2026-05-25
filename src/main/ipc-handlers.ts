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

  // Code repo
  ipcMain.handle('code:list-repo-files', async (_event, repoPath: string) => {
    const { listRepoFiles } = await import('./services/file-system')
    return listRepoFiles(repoPath)
  })

  ipcMain.handle('code:read-file', async (_event, absolutePath: string) => {
    const { readTextFile } = await import('./services/file-system')
    return readTextFile(absolutePath)
  })

  ipcMain.handle('code:get-git-commit', async (_event, repoPath: string) => {
    const { getCommitInfo } = await import('./services/git-service')
    return getCommitInfo(repoPath)
  })

  ipcMain.handle('code:parse-symbols', async (_event, filePaths: string[]) => {
    const { extractSymbols } = await import('./services/code-parser')
    return extractSymbols(filePaths)
  })

  ipcMain.handle('code:index-symbols', async (_event, repoPath: string) => {
    const { initSymbolDatabase, indexSymbols } = await import('./services/symbol-index')
    const { extractSymbols, initParser } = await import('./services/code-parser')
    const { listRepoFiles } = await import('./services/file-system')

    await initParser()
    const files = await listRepoFiles(repoPath)
    const codeFiles = files.filter((f) => !f.isDirectory).map((f) => f.absolutePath)

    const db = initSymbolDatabase(currentProjectPath!)
    const symbols = await extractSymbols(codeFiles)
    indexSymbols(db, symbols)

    return { indexed: symbols.length, totalFiles: codeFiles.length }
  })

  ipcMain.handle('code:resolve-refs', async (_event, _notePath: string, content: string) => {
    const { parseRefs, resolveRefs } = await import('./services/ref-resolver')
    const { initSymbolDatabase, querySymbols } = await import('./services/symbol-index')

    const refs = parseRefs(content)
    if (refs.length === 0) return []

    const db = initSymbolDatabase(currentProjectPath!)
    const allSymbols = querySymbols(db)
    return resolveRefs(refs, allSymbols)
  })
}

export function unregisterIpcHandlers(): void {
  closeDatabase()
  currentProjectPath = null
}
