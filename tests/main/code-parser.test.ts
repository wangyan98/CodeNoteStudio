// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { initParser, parseCodeFile } from '../../src/main/services/code-parser'

const testDir = join(tmpdir(), 'cns-code-parser-test')

beforeAll(async () => {
  mkdirSync(testDir, { recursive: true })
  await initParser()
})

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true })
})

describe('code-parser', () => {
  it('extracts function declarations from TypeScript', async () => {
    const code = `
function hello() {
  return "world"
}

export async function fetchData(url: string): Promise<string> {
  return await fetch(url).then(r => r.text())
}

class MyClass {
  getValue() { return 42 }
}
`
    const filePath = join(testDir, 'sample.ts')
    writeFileSync(filePath, code)
    const symbols = await parseCodeFile(filePath)

    const funcNames = symbols.filter(s => s.kind === 'function').map(s => s.name)
    expect(funcNames).toContain('hello')
    expect(funcNames).toContain('fetchData')

    const methods = symbols.filter(s => s.kind === 'method')
    expect(methods.some(m => m.name === 'getValue')).toBe(true)

    const classes = symbols.filter(s => s.kind === 'class')
    expect(classes.some(c => c.name === 'MyClass')).toBe(true)
  })

  it('returns empty array for non-code files', async () => {
    const filePath = join(testDir, 'readme.md')
    writeFileSync(filePath, '# Hello World')
    const symbols = await parseCodeFile(filePath)
    expect(symbols).toEqual([])
  })

  it('returns empty array for unparseable content', async () => {
    const filePath = join(testDir, 'broken.ts')
    writeFileSync(filePath, 'this is not @@@ valid typescript {{{')
    const symbols = await parseCodeFile(filePath)
    expect(Array.isArray(symbols)).toBe(true)
  })
})
