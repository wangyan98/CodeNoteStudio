// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import { initSymbolDatabase, indexSymbols, querySymbols, clearSymbols } from '../../src/main/services/symbol-index'
import type { CodeSymbol } from '../../src/main/services/code-parser'

describe('symbol-index', () => {
  let testDir: string
  let db: Database.Database

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'cns-symbol-'))
    db = initSymbolDatabase(testDir)
  })

  afterEach(() => {
    db.close()
    rmSync(testDir, { recursive: true, force: true })
  })

  const sampleSymbols: CodeSymbol[] = [
    {
      name: 'fetchData',
      kind: 'function',
      filePath: '/repo/src/api.ts',
      startLine: 10,
      endLine: 20,
      startColumn: 1,
      endColumn: 1,
      parentName: undefined
    },
    {
      name: 'getValue',
      kind: 'method',
      filePath: '/repo/src/api.ts',
      startLine: 25,
      endLine: 27,
      startColumn: 3,
      endColumn: 3,
      parentName: 'MyClass'
    },
    {
      name: 'MyClass',
      kind: 'class',
      filePath: '/repo/src/api.ts',
      startLine: 22,
      endLine: 30,
      startColumn: 1,
      endColumn: 1,
      parentName: undefined
    }
  ]

  it('indexes and queries symbols by name', () => {
    indexSymbols(db, sampleSymbols)

    const results = querySymbols(db, 'fetchData')
    expect(results).toHaveLength(1)
    expect(results[0].kind).toBe('function')
    expect(results[0].filePath).toBe('/repo/src/api.ts')
    expect(results[0].startLine).toBe(10)
  })

  it('returns empty array for non-existent symbol', () => {
    const results = querySymbols(db, 'nonexistent')
    expect(results).toEqual([])
  })

  it('clears all symbols', () => {
    indexSymbols(db, sampleSymbols)
    clearSymbols(db)
    const results = querySymbols(db, 'fetchData')
    expect(results).toEqual([])
  })

  it('queries by file path', () => {
    indexSymbols(db, sampleSymbols)
    const results = querySymbols(db, '', '/repo/src/api.ts')
    expect(results.length).toBeGreaterThanOrEqual(3)
  })
})
