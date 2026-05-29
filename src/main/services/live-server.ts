import express, { type Express, type Request, type Response } from 'express'
import { createServer, type Server as HttpServer } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import path from 'node:path'
import fs from 'node:fs'
import Database from 'better-sqlite3'
import { initSymbolDatabase, querySymbols } from './symbol-index'
import type { NoteFileType } from '../types'

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

// ===== Cached reusable DB connection for symbols/resolve-refs endpoints =====
let cachedDb: Database.Database | null = null
let cachedDbProjectPath: string = ''

function getDb(projectPath: string): Database.Database {
  if (cachedDb && cachedDbProjectPath === projectPath) {
    return cachedDb
  }
  // Close old connection if project path changed
  if (cachedDb) {
    cachedDb.close()
    cachedDb = null
  }
  cachedDb = initSymbolDatabase(projectPath)
  cachedDbProjectPath = projectPath
  return cachedDb
}

function closeDb(): void {
  if (cachedDb) {
    cachedDb.close()
    cachedDb = null
    cachedDbProjectPath = ''
  }
}

// ===== Path validation helpers =====

function isPathWithin(parent: string, child: string): boolean {
  const resolvedParent = path.resolve(parent)
  const resolvedChild = path.resolve(child)
  return (
    resolvedChild.startsWith(resolvedParent + path.sep) ||
    resolvedChild === resolvedParent
  )
}

// ===== Type validation =====

const VALID_NOTE_FILTERS: ReadonlySet<string> = new Set(['mind', 'md', 'derive'])

function validateNoteFilter(value: unknown): NoteFileType | undefined {
  if (value === undefined || value === '') return undefined
  if (typeof value === 'string' && VALID_NOTE_FILTERS.has(value)) {
    return value as NoteFileType
  }
  return undefined
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
  const notesDir = path.resolve(projectPath, 'notes')

  app.use(express.json())

  // ===== CORS middleware for all /api/* routes =====
  app.use('/api', (_req: Request, res: Response, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    next()
  })

  app.use(express.static(rendererDir))

  // Serve monaco-editor locally (avoids CDN load blocked by CSP)
  const monacoVsDir = (() => {
    const candidates = [
      path.join(process.cwd(), 'node_modules', 'monaco-editor', 'min', 'vs'),
      path.join(__dirname, '..', '..', '..', 'node_modules', 'monaco-editor', 'min', 'vs')
    ]
    for (const dir of candidates) {
      if (fs.existsSync(dir)) return dir
    }
    return null
  })()
  if (monacoVsDir) {
    app.use('/monaco-vs', express.static(monacoVsDir))
  }

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

  app.get('/api/workspace', (_req: Request, res: Response) => {
    res.json({ path: projectPath })
  })

  app.get('/api/notes', async (req: Request, res: Response) => {
    try {
      const { listNotes } = await import('./note-service')
      const filterType = validateNoteFilter(req.query.filter)
      const notes = await listNotes(projectPath, filterType)
      res.json(notes)
    } catch (e) {
      res.status(500).json({ error: String(e) })
    }
  })

  app.get('/api/notes/*notePath', async (req: Request, res: Response) => {
    try {
      const { readNote } = await import('./note-service')
      const rawPath = req.params.notePath || req.path.slice('/api/notes/'.length)
      const relativePath = Array.isArray(rawPath) ? rawPath.join('/') : rawPath

      // Prevent path traversal: resolved path must stay within notes directory
      const resolvedPath = path.resolve(notesDir, relativePath)
      if (!isPathWithin(notesDir, resolvedPath)) {
        res.status(403).json({ error: 'Path traversal not allowed' })
        return
      }

      const content = await readNote(projectPath, relativePath)
      // Use res.send() for strings (markdown), res.json() for objects
      if (typeof content === 'string') {
        res.type('text/plain').send(content)
      } else {
        res.json(content)
      }
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
      const { loadConfig } = await import('./notebook-config')
      const filePath = req.query.path as string
      if (!filePath) {
        res.status(400).json({ error: 'Missing path parameter' })
        return
      }

      // Verify filePath is within projectPath or a configured code repo
      const resolvedPath = path.resolve(filePath)
      const config = await loadConfig(projectPath)
      const allowedDirs = [projectPath, ...config.codeRepos.map((r) => r.path)]

      const isAllowed = allowedDirs.some((dir) => isPathWithin(dir, resolvedPath))
      if (!isAllowed) {
        res.status(403).json({ error: 'Access to this file path is not allowed' })
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
    const name = req.query.name as string | undefined
    const filePath = req.query.file as string | undefined
    const kind = req.query.kind as string | undefined
    const repoPath = req.query.repo as string | undefined

    let db: Database.Database | null = null
    try {
      db = getDb(projectPath)
      const results = querySymbols(db, name, filePath, kind, repoPath)
      res.json(results)
    } catch (e) {
      res.status(500).json({ error: String(e) })
    }
    // No db.close() here — connection is cached and reused
  })

  app.get('/api/code/resolve-refs', async (req: Request, res: Response) => {
    try {
      const { parseRefs, resolveRefs } = await import('./ref-resolver')
      const { saveRefCache } = await import('./ref-cache')
      const content = req.query.content as string
      const notePath = req.query.notePath as string | undefined
      const activeRepo = req.query.repo as string | undefined

      if (!content) {
        res.json([])
        return
      }

      const refs = parseRefs(content)
      if (refs.length === 0) {
        res.json([])
        return
      }

      const db = getDb(projectPath)
      const allSymbols = querySymbols(db)
      const mappings = await resolveRefs(refs, allSymbols, activeRepo)
      if (notePath) {
        saveRefCache(projectPath, notePath, mappings)
      }
      res.json(mappings)
    } catch (e) {
      res.status(500).json({ error: String(e) })
    }
  })

  // UI state persistence
  app.get('/api/ui-state', (_req: Request, res: Response) => {
    try {
      const { loadUiState } = require('./ui-state')
      res.json(loadUiState(projectPath))
    } catch {
      res.json(null)
    }
  })

  app.post('/api/ui-state', (req: Request, res: Response) => {
    try {
      const { saveUiState } = require('./ui-state')
      saveUiState(projectPath, req.body)
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ error: String(e) })
    }
  })

  // SPA fallback
  app.get('*splat', (_req: Request, res: Response) => {
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

  const app = createApp(projectPath)

  // Defer state mutation until after createApp succeeds
  state.projectPath = projectPath
  state.port = port

  const httpServer = createServer(app)

  const wss = new WebSocketServer({ server: httpServer })

  wss.on('connection', (ws: WebSocket) => {
    state.connectedClients.add(ws)

    // Prevent unhandled error crashes
    ws.on('error', () => {})

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
      // Close the cached DB connection
      closeDb()

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
