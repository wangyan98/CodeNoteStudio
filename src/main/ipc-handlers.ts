import { ipcMain, BrowserWindow } from 'electron'
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
import { loadUiState, saveUiState } from './services/ui-state'
import { startWatching, stopWatching } from './services/file-watcher'
import type { UiState } from './services/ui-state'
import type { NotebookConfig } from './types'
import type { NoteFileType, NoteListItem } from './types'
import type { NoteContent } from './services/note-service'
import path from 'node:path'

let currentProjectPath: string | null = null

function notifyRenderers(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('notes:changed')
  }
}

async function restartWatcher(): Promise<void> {
  stopWatching()
  if (!currentProjectPath) return
  const config = await loadConfig(currentProjectPath)
  const notesPath = path.resolve(currentProjectPath, config.notesPath || './')
  startWatching(notesPath, notifyRenderers)
}

export function registerIpcHandlers(projectPath: string): void {
  currentProjectPath = projectPath

  if (projectPath) {
    initDatabase(projectPath)
    restartWatcher()
  }

  // Notebook config
  ipcMain.handle('config:load', async (): Promise<NotebookConfig> => {
    return loadConfig(currentProjectPath!)
  })

  ipcMain.handle('config:save', async (_event, config: NotebookConfig): Promise<void> => {
    return saveConfig(currentProjectPath!, config)
  })

  // Notes
  ipcMain.handle('notes:list', async (_event, filterType?: NoteFileType): Promise<NoteListItem[]> => {
    return listNotes(currentProjectPath!, filterType)
  })

  ipcMain.handle('notes:create', async (_event, relativePath: string, type: NoteFileType): Promise<void> => {
    await createNote(currentProjectPath!, relativePath, type)
    const { broadcastMessage } = await import('./services/live-server')
    broadcastMessage('note-created', { relativePath, type })
  })

  ipcMain.handle('notes:read', async (_event, relativePath: string): Promise<NoteContent> => {
    return readNote(currentProjectPath!, relativePath)
  })

  ipcMain.handle('notes:update', async (_event, relativePath: string, content: NoteContent): Promise<void> => {
    await updateNote(currentProjectPath!, relativePath, content)
    const { broadcastMessage } = await import('./services/live-server')
    broadcastMessage('note-updated', { relativePath, content })
  })

  ipcMain.handle('notes:delete', async (_event, relativePath: string): Promise<void> => {
    await deleteNote(currentProjectPath!, relativePath)
    const { broadcastMessage } = await import('./services/live-server')
    broadcastMessage('note-deleted', { relativePath })
  })

  ipcMain.handle('notes:rename', async (_event, oldPath: string, newPath: string): Promise<void> => {
    return renameNote(currentProjectPath!, oldPath, newPath)
  })

  ipcMain.handle('notes:exists', async (_event, relativePath: string): Promise<boolean> => {
    return noteExists(currentProjectPath!, relativePath)
  })

  ipcMain.handle('notes:create-folder', async (_event, relativePath: string): Promise<void> => {
    const { createFolder } = await import('./services/note-service')
    return createFolder(currentProjectPath!, relativePath)
  })

  ipcMain.handle('notes:copy-file', async (_event, sourcePath: string, targetDirRelative: string): Promise<void> => {
    const { copyFileToNotes } = await import('./services/note-service')
    return copyFileToNotes(currentProjectPath!, sourcePath, targetDirRelative)
  })

  ipcMain.handle('notes:delete-folder', async (_event, relativePath: string): Promise<void> => {
    const { deleteFolder } = await import('./services/note-service')
    await deleteFolder(currentProjectPath!, relativePath)
    const { broadcastMessage } = await import('./services/live-server')
    broadcastMessage('note-deleted', { relativePath })
  })

  // App
  ipcMain.handle('app:get-project-path', (): string | null => {
    return currentProjectPath
  })

  // Workspace
  ipcMain.handle('dialog:select-folder', async (): Promise<string | null> => {
    const { dialog } = await import('electron')
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('workspace:create', async (_event, dirPath: string): Promise<string> => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    // Ensure directory is empty
    const entries = await fs.readdir(dirPath)
    const nonHidden = entries.filter((e) => e !== '.DS_Store')
    if (nonHidden.length > 0) {
      throw new Error('Selected directory is not empty. Please choose an empty folder.')
    }
    // Initialize notebook.json
    const name = path.basename(dirPath)
    const configPath = path.join(dirPath, 'notebook.json')
    await fs.writeFile(configPath, JSON.stringify({ name, notesPath: './', codeRepos: [] }, null, 2), 'utf-8')
    // Create notes directory
    await fs.mkdir(path.join(dirPath, 'notes'), { recursive: true })
    return dirPath
  })

  ipcMain.handle('workspace:open', async (_event, newPath: string): Promise<NotebookConfig> => {
    const { validateWorkspacePath, addToHistory } = await import('./services/workspace')
    const path = await import('node:path')
    const fs = await import('node:fs/promises')

    if (!validateWorkspacePath(newPath)) {
      throw new Error(`Invalid workspace path: ${newPath}`)
    }

    // Validate it's a real workspace (has notebook.json)
    const configPath = path.join(newPath, 'notebook.json')
    try {
      await fs.access(configPath)
    } catch {
      throw new Error('Selected folder is not a valid workspace')
    }

    currentProjectPath = newPath
    closeDatabase()
    initDatabase(newPath)
    const config = await loadConfig(newPath)
    await addToHistory(newPath, config.name || path.basename(newPath))
    restartWatcher()
    return config
  })

  ipcMain.handle('workspace:get-current', (): string | null => {
    return currentProjectPath
  })

  // Workspace history
  ipcMain.handle('workspace:get-history', async () => {
    const { getHistory } = await import('./services/workspace')
    return getHistory()
  })

  ipcMain.handle('workspace:remove-from-history', async (_event, workspacePath: string) => {
    const { removeFromHistory } = await import('./services/workspace')
    return removeFromHistory(workspacePath)
  })

  ipcMain.handle('workspace:clear', async () => {
    closeDatabase()
    stopWatching()
    currentProjectPath = null
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

  ipcMain.handle('code:read-binary-file', async (_event, absolutePath: string) => {
    const { readBinaryFile } = await import('./services/file-system')
    return readBinaryFile(absolutePath)
  })

  ipcMain.handle('code:get-git-commit', async (_event, repoPath: string) => {
    const { getCommitInfo } = await import('./services/git-service')
    return getCommitInfo(repoPath)
  })

  ipcMain.handle('code:get-remote-url', async (_event, repoPath: string) => {
    const { getRemoteUrl } = await import('./services/git-service')
    return getRemoteUrl(repoPath)
  })

  ipcMain.handle('code:parse-symbols', async (_event, filePaths: string[]) => {
    try {
      const { extractSymbols } = await import('./services/code-parser')
      return extractSymbols(filePaths)
    } catch (err) {
      console.error('[code:parse-symbols] Parse failed:', err)
      return []
    }
  })

  ipcMain.handle('code:index-symbols', async (_event, repoPath: string) => {
    try {
      const { initSymbolDatabase, indexSymbols, clearRepo } = await import('./services/symbol-index')
      const { extractSymbols, initParser, clearParserPoison } = await import('./services/code-parser')
      const { listRepoFiles } = await import('./services/file-system')

      console.log('[code:index-symbols] Starting index for:', repoPath)
      clearParserPoison()
      await initParser()
      const files = await listRepoFiles(repoPath)
      const codeFiles = files.filter((f) => !f.isDirectory).map((f) => f.absolutePath)
      console.log(`[code:index-symbols] Found ${codeFiles.length} code files`)

      const db = initSymbolDatabase(currentProjectPath!)
      clearRepo(db, repoPath)
      const symbols = await extractSymbols(codeFiles)
      indexSymbols(db, symbols, repoPath)
      console.log(`[code:index-symbols] Indexed ${symbols.length} symbols`)

      return { indexed: symbols.length, totalFiles: codeFiles.length }
    } catch (err) {
      console.error('[code:index-symbols] Indexing failed:', err)
      return { indexed: 0, totalFiles: 0, error: String(err) }
    }
  })

  ipcMain.handle('code:query-symbols', async (_event, name?: string, filePath?: string, kind?: string, repoPath?: string) => {
    const { initSymbolDatabase, querySymbols } = await import('./services/symbol-index')
    const db = initSymbolDatabase(currentProjectPath!)
    return querySymbols(db, name, filePath, kind, repoPath, name ? undefined : 50)
  })

  ipcMain.handle('code:resolve-refs', async (_event, notePath: string, content: string, activeRepoPath?: string) => {
    const { parseRefs, resolveRefs } = await import('./services/ref-resolver')
    const { initSymbolDatabase, querySymbols } = await import('./services/symbol-index')
    const { saveRefCache } = await import('./services/ref-cache')

    const refs = parseRefs(content)
    if (refs.length === 0) return []

    const db = initSymbolDatabase(currentProjectPath!)
    const allSymbols = querySymbols(db)
    const mappings = await resolveRefs(refs, allSymbols, activeRepoPath)
    saveRefCache(currentProjectPath!, notePath, mappings)
    return mappings
  })

  // Layer catalog
  ipcMain.handle('catalog:read-layer-catalog', async (_event, projectPath: string) => {
    const { readTextFile, fileExists } = await import('./services/file-system')
    const path = await import('node:path')
    const catalogPath = path.join(projectPath, 'notes', '.layer-catalog.json')
    const exists = await fileExists(catalogPath)
    if (!exists) return null
    const raw = await readTextFile(catalogPath)
    return JSON.parse(raw)
  })

  ipcMain.handle('code:copy-file-to-assets', async (_event, sourcePath: string) => {
    const { copyFileToAssets } = await import('./services/file-system')
    return copyFileToAssets(sourcePath, currentProjectPath!)
  })

  // UI state persistence
  ipcMain.handle('ui-state:load', async (): Promise<UiState | null> => {
    return loadUiState(currentProjectPath!)
  })

  ipcMain.handle('ui-state:save', async (_event, workspacePath: string, state: UiState): Promise<void> => {
    return saveUiState(workspacePath, state)
  })

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

  // Agent
  ipcMain.handle('agent:start', async () => {
    const { startAgent } = await import('./agent-manager')
    return startAgent()
  })

  ipcMain.handle('agent:stop', async () => {
    const { stopAgent } = await import('./agent-manager')
    return stopAgent()
  })

  ipcMain.handle('agent:get-port', async () => {
    const { getAgentPort, startAgent } = await import('./agent-manager')
    let port = getAgentPort()
    if (!port) {
      const result = await startAgent()
      port = result.port
    }
    return port
  })

  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    const { shell } = await import('electron')
    return shell.openExternal(url)
  })

  ipcMain.handle('shell:open-path', async (_event, dirPath: string) => {
    const { shell } = await import('electron')
    return shell.openPath(dirPath)
  })
}

export function unregisterIpcHandlers(): void {
  closeDatabase()
  stopWatching()
  currentProjectPath = null
}
