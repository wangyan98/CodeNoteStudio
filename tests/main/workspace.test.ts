import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Mock electron app.getPath — tests run outside Electron
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

  it('saves and loads last workspace path', async () => {
    const { saveLastWorkspacePath, loadLastWorkspacePath } =
      await import('../../src/main/services/workspace')
    await saveLastWorkspacePath('/some/path')
    const loaded = await loadLastWorkspacePath()
    expect(loaded).toBe('/some/path')
  })

  it('returns null when no workspace.json exists', async () => {
    const { loadLastWorkspacePath } = await import('../../src/main/services/workspace')
    const result = await loadLastWorkspacePath()
    expect(result).toBeNull()
  })

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

  it('handles corrupted workspace.json gracefully', async () => {
    const { loadLastWorkspacePath, saveLastWorkspacePath } =
      await import('../../src/main/services/workspace')
    await saveLastWorkspacePath('/some/path')
    // Corrupt the file
    writeFileSync(join(testDataDir, 'workspace.json'), 'not json {{{')
    const result = await loadLastWorkspacePath()
    expect(result).toBeNull()
  })
})
