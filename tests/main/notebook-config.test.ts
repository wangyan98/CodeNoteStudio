import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadConfig, saveConfig } from '../../src/main/services/notebook-config'
import type { NotebookConfig } from '../../src/main/types'

describe('notebook-config', () => {
  let testDir: string

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'cns-config-'))
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('loadConfig returns default config when notebook.json does not exist', async () => {
    const config = await loadConfig(testDir)
    expect(config.name).toBeTruthy()
    expect(config.codeRepos).toEqual([])
    expect(config.notesPath).toBe('./')
  })

  it('saveConfig writes notebook.json and loadConfig reads it back', async () => {
    const config: NotebookConfig = {
      name: 'my-notes',
      notesPath: './notes',
      codeRepos: [
        {
          path: '/home/user/projects/algo',
          commit: 'a1b2c3d4'
        }
      ]
    }
    await saveConfig(testDir, config)
    const loaded = await loadConfig(testDir)
    expect(loaded).toEqual(config)
  })

  it('saveConfig overwrites existing config', async () => {
    await saveConfig(testDir, { name: 'first', notesPath: './', codeRepos: [] })
    await saveConfig(testDir, { name: 'second', notesPath: './', codeRepos: [] })
    const loaded = await loadConfig(testDir)
    expect(loaded.name).toBe('second')
  })
})
