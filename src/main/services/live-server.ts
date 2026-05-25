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

  app.use(express.static(rendererDir))

  // ===== REST API =====

  app.get('/api/config', async (_req: Request, res: Response) => {
    try {
      const { loadConfig } = await import('./notebook-config')
      const config = await loadConfig(projectPath)
      res.json(config)
    } catch (e) {
      res.status(500).json({ error: String(e) })
    }
  })

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

  // SPA fallback
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
