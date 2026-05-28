// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { parseRefs, resolveRefs } from '../../src/main/services/ref-resolver'
import type { RefSpec } from '../../src/main/services/ref-resolver'
import type { CodeSymbol } from '../../src/main/services/code-parser'

describe('parseRefs', () => {
  it('parses @ref(name) as name-only', () => {
    const refs = parseRefs('see @ref(main) here')
    expect(refs).toEqual([{ raw: 'main', name: 'main' }])
  })

  it('parses @ref(file:line:name) with all segments', () => {
    const refs = parseRefs('see @ref(src/utils.cpp:42:MyClass.getValue) here')
    expect(refs).toEqual([{
      raw: 'src/utils.cpp:42:MyClass.getValue',
      filePath: 'src/utils.cpp',
      line: 42,
      name: 'MyClass.getValue'
    }])
  })

  it('parses @ref(file:line) with file and line', () => {
    const refs = parseRefs('see @ref(src/utils.cpp:42) here')
    expect(refs).toEqual([{
      raw: 'src/utils.cpp:42',
      filePath: 'src/utils.cpp',
      line: 42
    }])
  })

  it('parses @ref(file:name) with file and name', () => {
    const refs = parseRefs('see @ref(src/utils.cpp:parse) here')
    expect(refs).toEqual([{
      raw: 'src/utils.cpp:parse',
      filePath: 'src/utils.cpp',
      name: 'parse'
    }])
  })

  it('parses @ref(Class.method) as name-only with dot', () => {
    const refs = parseRefs('see @ref(MyClass.getValue) here')
    expect(refs).toEqual([{ raw: 'MyClass.getValue', name: 'MyClass.getValue' }])
  })

  it('returns empty array for no refs', () => {
    expect(parseRefs('just text')).toEqual([])
    expect(parseRefs('')).toEqual([])
  })

  it('extracts multiple refs from markdown', () => {
    const content = '# Arch\n\nSee @ref(main) and @ref(src/api.ts:10:fetchData).'
    const refs = parseRefs(content)
    expect(refs).toHaveLength(2)
    expect(refs[0]).toEqual({ raw: 'main', name: 'main' })
    expect(refs[1]).toEqual({
      raw: 'src/api.ts:10:fetchData',
      filePath: 'src/api.ts',
      line: 10,
      name: 'fetchData'
    })
  })

  it('extracts @ref from JSON content', () => {
    const content = JSON.stringify({
      root: { title: 'Auth', content: 'See @ref(src/login.cpp:42) for impl' }
    })
    const refs = parseRefs(content)
    expect(refs).toEqual([{
      raw: 'src/login.cpp:42',
      filePath: 'src/login.cpp',
      line: 42
    }])
  })
})

describe('resolveRefs', () => {
  const mockSymbols: CodeSymbol[] = [
    {
      name: 'main',
      kind: 'function',
      filePath: '/repo/src/index.ts',
      startLine: 1,
      endLine: 10,
      startColumn: 1,
      endColumn: 1
    },
    {
      name: 'fetchData',
      kind: 'function',
      filePath: '/repo/src/api.ts',
      startLine: 10,
      endLine: 20,
      startColumn: 1,
      endColumn: 1
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
    }
  ]

  it('resolves @ref names to CodeMapping objects', () => {
    const refs = ['main', 'fetchData']
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(2)
    expect(mappings[0]).toEqual({
      functionName: 'main',
      filePath: '/repo/src/index.ts',
      startLine: 1,
      endLine: 10
    })
    expect(mappings[1]).toEqual({
      functionName: 'fetchData',
      filePath: '/repo/src/api.ts',
      startLine: 10,
      endLine: 20
    })
  })

  it('handles unresolved refs gracefully', () => {
    const refs = ['main', 'nonexistent']
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].functionName).toBe('main')
  })

  it('handles Class.method notation', () => {
    const refs = ['MyClass.getValue']
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0]).toEqual({
      functionName: 'MyClass.getValue',
      filePath: '/repo/src/api.ts',
      startLine: 25,
      endLine: 27
    })
  })

  it('returns empty array for empty refs', () => {
    expect(resolveRefs([], mockSymbols)).toEqual([])
  })
})
