import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { registerIpcHandlers, unregisterIpcHandlers } from './ipc-handlers'
import { stopServer } from './services/live-server'
import { loadLastWorkspacePath, validateWorkspacePath } from './services/workspace'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    show: false,
    title: 'Code Note Studio',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('get-app-version', () => app.getVersion())

app.whenReady().then(async () => {
  let projectPath = ''

  try {
    const lastPath = await loadLastWorkspacePath()
    if (lastPath && validateWorkspacePath(lastPath)) {
      projectPath = lastPath
    }
  } catch (err) {
    console.error('[workspace] Failed to load last workspace:', err)
  }

  registerIpcHandlers(projectPath)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', async () => {
  await stopServer()
  unregisterIpcHandlers()
})
