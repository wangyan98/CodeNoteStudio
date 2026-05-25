// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { startServer, stopServer, getServerStatus } from '../../src/main/services/live-server'

describe('live-server', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'cns-server-'))
    mkdirSync(join(testDir, 'notes'), { recursive: true })
    writeFileSync(join(testDir, 'notebook.json'), JSON.stringify({
      name: 'test',
      codeRepos: []
    }))

    // Create minimal renderer build so static serving works
    const outRenderer = join(testDir, 'out', 'renderer')
    mkdirSync(outRenderer, { recursive: true })
    writeFileSync(join(outRenderer, 'index.html'), '<!doctype html><html><body>Test</body></html>')
  })

  afterEach(async () => {
    await stopServer()
    rmSync(testDir, { recursive: true, force: true })
  })

  describe('startServer / stopServer', () => {
    it('starts and stops the server', async () => {
      const originalCwd = process.cwd()
      process.chdir(testDir)
      try {
        const status = await startServer(testDir, 9876)
        expect(status.running).toBe(true)
        expect(status.port).toBe(9876)
        expect(status.url).toContain('localhost:9876')

        expect(getServerStatus().running).toBe(true)

        await stopServer()
        expect(getServerStatus().running).toBe(false)
      } finally {
        process.chdir(originalCwd)
      }
    })

    it('returns existing status when already running', async () => {
      const originalCwd = process.cwd()
      process.chdir(testDir)
      try {
        const s1 = await startServer(testDir, 9877)
        const s2 = await startServer(testDir, 9877)
        expect(s2.port).toBe(s1.port)
      } finally {
        process.chdir(originalCwd)
      }
    })

    it('stopServer is a no-op when not running', async () => {
      await stopServer()
      expect(getServerStatus().running).toBe(false)
    })
  })

  describe('REST API', () => {
    it('GET /api/config returns notebook config', async () => {
      const originalCwd = process.cwd()
      process.chdir(testDir)
      try {
        await startServer(testDir, 9878)
        const res = await fetch('http://localhost:9878/api/config')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.name).toBe('test')
      } finally {
        process.chdir(originalCwd)
      }
    })

    it('GET /api/notes returns notes list', async () => {
      const originalCwd = process.cwd()
      process.chdir(testDir)
      try {
        await startServer(testDir, 9879)
        const res = await fetch('http://localhost:9879/api/notes')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(Array.isArray(body)).toBe(true)
      } finally {
        process.chdir(originalCwd)
      }
    })

    it('serves static index.html', async () => {
      const originalCwd = process.cwd()
      process.chdir(testDir)
      try {
        await startServer(testDir, 9880)
        const res = await fetch('http://localhost:9880/')
        expect(res.status).toBe(200)
        const body = await res.text()
        expect(body).toContain('Test')
      } finally {
        process.chdir(originalCwd)
      }
    })

    it('rejects file access outside project directory', async () => {
      const originalCwd = process.cwd()
      process.chdir(testDir)
      try {
        await startServer(testDir, 9881)
        const res = await fetch('http://localhost:9881/api/code/file?path=/etc/passwd')
        expect(res.status).toBe(403)
      } finally {
        process.chdir(originalCwd)
      }
    })
  })
})
