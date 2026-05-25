import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { initDatabase, closeDatabase } from '../../src/main/services/index-db'

describe('index-db', () => {
  let testDir: string

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'cns-db-'))
  })

  afterEach(() => {
    closeDatabase()
    rmSync(testDir, { recursive: true, force: true })
  })

  it('initDatabase creates the index.db file', () => {
    initDatabase(testDir)
    expect(existsSync(join(testDir, '.index.db'))).toBe(true)
  })

  it('initDatabase creates the code_mappings table', () => {
    const db = initDatabase(testDir)
    const result = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='code_mappings'"
    ).get() as { name: string } | undefined
    expect(result).toBeDefined()
    expect(result!.name).toBe('code_mappings')
  })

  it('initDatabase is idempotent', () => {
    initDatabase(testDir)
    const db = initDatabase(testDir)
    const result = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='code_mappings'"
    ).get() as { name: string } | undefined
    expect(result).toBeDefined()
  })
})
