import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('electron', () => ({
  app: {
    getPath: () => join(process.cwd(), 'test-temp', 'workspace-test'),
  },
}))

describe('workspace', () => {
  const testDataDir = join(process.cwd(), 'test-temp', 'workspace-test')

  beforeEach(() => {
    mkdirSync(testDataDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true })
    }
  })

  it('adds entry to history', async () => {
    const { addToHistory, getHistory } = await import('../../src/main/services/workspace')
    await addToHistory('/path/a', 'Project A')
    const history = await getHistory()
    expect(history).toHaveLength(1)
    expect(history[0].path).toBe('/path/a')
    expect(history[0].name).toBe('Project A')
    expect(history[0].lastOpened).toBeGreaterThan(0)
  })

  it('upserts existing entry and moves it to front (LRU)', async () => {
    const { addToHistory, getHistory } = await import('../../src/main/services/workspace')
    await addToHistory('/path/a', 'Project A')
    await addToHistory('/path/b', 'Project B')
    await addToHistory('/path/a', 'Project A') // re-open A — should move to front
    const history = await getHistory()
    expect(history).toHaveLength(2)
    expect(history[0].path).toBe('/path/a')
    expect(history[1].path).toBe('/path/b')
  })

  it('trims history to 10 entries', async () => {
    const { addToHistory, getHistory } = await import('../../src/main/services/workspace')
    for (let i = 0; i < 12; i++) {
      await addToHistory(`/path/${i}`, `Project ${i}`)
    }
    const history = await getHistory()
    expect(history).toHaveLength(10)
    // Most recent should be first
    expect(history[0].path).toBe('/path/11')
  })

  it('removes entry from history', async () => {
    const { addToHistory, removeFromHistory, getHistory } = await import('../../src/main/services/workspace')
    await addToHistory('/path/a', 'Project A')
    await addToHistory('/path/b', 'Project B')
    await removeFromHistory('/path/a')
    const history = await getHistory()
    expect(history).toHaveLength(1)
    expect(history[0].path).toBe('/path/b')
  })

  it('getHistory returns empty array when no history exists', async () => {
    const { getHistory } = await import('../../src/main/services/workspace')
    const history = await getHistory()
    expect(history).toEqual([])
  })

  it('loadLastWorkspacePath returns first entry path', async () => {
    const { addToHistory, loadLastWorkspacePath } = await import('../../src/main/services/workspace')
    await addToHistory('/path/a', 'Project A')
    await addToHistory('/path/b', 'Project B')
    const result = await loadLastWorkspacePath()
    expect(result).toBe('/path/b')
  })

  it('loadLastWorkspacePath returns null when history is empty', async () => {
    const { loadLastWorkspacePath } = await import('../../src/main/services/workspace')
    const result = await loadLastWorkspacePath()
    expect(result).toBeNull()
  })

  it('migrates old { lastPath } format to new history format', async () => {
    // Write old-format workspace.json
    writeFileSync(join(testDataDir, 'workspace.json'), JSON.stringify({ lastPath: '/old/path' }))
    const { getHistory, loadLastWorkspacePath } = await import('../../src/main/services/workspace')
    const history = await getHistory()
    expect(history).toHaveLength(1)
    expect(history[0].path).toBe('/old/path')
    expect(history[0].name).toBe('path')
    const lastPath = await loadLastWorkspacePath()
    expect(lastPath).toBe('/old/path')
  })

  it('handles corrupted workspace.json gracefully', async () => {
    writeFileSync(join(testDataDir, 'workspace.json'), 'not json {{{')
    const { getHistory } = await import('../../src/main/services/workspace')
    const history = await getHistory()
    expect(history).toEqual([])
  })

  // Keep existing validateWorkspacePath tests
  it('validates existing workspace path', async () => {
    const { validateWorkspacePath } = await import('../../src/main/services/workspace')
    const { tmpdir } = await import('node:os')
    const testDir = join(tmpdir(), `ws-test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
    expect(validateWorkspacePath(testDir)).toBe(true)
    expect(validateWorkspacePath('/nonexistent/xyz')).toBe(false)
    rmSync(testDir, { recursive: true, force: true })
  })

  it('rejects non-absolute paths', async () => {
    const { validateWorkspacePath } = await import('../../src/main/services/workspace')
    expect(validateWorkspacePath('relative/path')).toBe(false)
    expect(validateWorkspacePath('')).toBe(false)
  })
})
