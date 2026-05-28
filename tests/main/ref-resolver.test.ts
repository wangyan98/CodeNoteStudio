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
      filePath: 'src/index.ts',
      startLine: 1,
      endLine: 10,
      startColumn: 1,
      endColumn: 1
    },
    {
      name: 'fetchData',
      kind: 'function',
      filePath: 'src/api.ts',
      startLine: 10,
      endLine: 20,
      startColumn: 1,
      endColumn: 1
    },
    {
      name: 'getValue',
      kind: 'method',
      filePath: 'src/api.ts',
      startLine: 25,
      endLine: 27,
      startColumn: 3,
      endColumn: 3,
      parentName: 'MyClass'
    },
    {
      name: 'parse',
      kind: 'function',
      filePath: 'src/utils.cpp',
      startLine: 42,
      endLine: 56,
      startColumn: 1,
      endColumn: 1
    },
    {
      name: 'parse',
      kind: 'function',
      filePath: 'src/parser.cpp',
      startLine: 100,
      endLine: 130,
      startColumn: 1,
      endColumn: 1
    }
  ]

  // Tier 1: file + line + name
  it('T1: resolves @ref(file:line:name) to exact symbol', () => {
    const refs: RefSpec[] = [
      { raw: 'src/utils.cpp:42:parse', filePath: 'src/utils.cpp', line: 42, name: 'parse' }
    ]
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].raw).toBe('src/utils.cpp:42:parse')
    expect(mappings[0].filePath).toBe('src/utils.cpp')
    expect(mappings[0].startLine).toBe(42)
  })

  // Tier 1: file+line+name with Class.method name
  it('T1: resolves @ref(file:line:Class.method)', () => {
    const refs: RefSpec[] = [
      { raw: 'src/api.ts:25:MyClass.getValue', filePath: 'src/api.ts', line: 25, name: 'MyClass.getValue' }
    ]
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].functionName).toBe('MyClass.getValue')
    expect(mappings[0].filePath).toBe('src/api.ts')
  })

  // Tier 2: file + line
  it('T2: resolves @ref(file:line) to symbol at that line', () => {
    const refs: RefSpec[] = [
      { raw: 'src/utils.cpp:42', filePath: 'src/utils.cpp', line: 42 }
    ]
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].functionName).toBe('parse')
  })

  // Tier 2: file+line with no symbol at that line => no match
  it('T2: returns empty for @ref(file:line) with no symbol at that line', () => {
    const refs: RefSpec[] = [
      { raw: 'src/utils.cpp:999', filePath: 'src/utils.cpp', line: 999 }
    ]
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(0)
  })

  // Tier 3: file + name
  it('T3: resolves @ref(file:name) to named symbol in file', () => {
    const refs: RefSpec[] = [
      { raw: 'src/parser.cpp:parse', filePath: 'src/parser.cpp', name: 'parse' }
    ]
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].filePath).toBe('src/parser.cpp')
    expect(mappings[0].startLine).toBe(100)
  })

  // Tier 3: file+name with Class.method in file
  it('T3: resolves @ref(file:Class.method) within file', () => {
    const refs: RefSpec[] = [
      { raw: 'src/api.ts:MyClass.getValue', filePath: 'src/api.ts', name: 'MyClass.getValue' }
    ]
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].functionName).toBe('MyClass.getValue')
    expect(mappings[0].filePath).toBe('src/api.ts')
  })

  // Tier 3: file+name with no match
  it('T3: returns empty for @ref(file:name) with no match', () => {
    const refs: RefSpec[] = [
      { raw: 'src/api.ts:nonexistent', filePath: 'src/api.ts', name: 'nonexistent' }
    ]
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(0)
  })

  // Tier 4: Class.method across all files
  it('T4: resolves @ref(Class.method) across all files', () => {
    const refs: RefSpec[] = [
      { raw: 'MyClass.getValue', name: 'MyClass.getValue' }
    ]
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].functionName).toBe('MyClass.getValue')
    expect(mappings[0].filePath).toBe('src/api.ts')
  })

  // Tier 5: name only across all files (first match)
  it('T5: resolves @ref(name) to first matching symbol', () => {
    const refs: RefSpec[] = [
      { raw: 'main', name: 'main' }
    ]
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].functionName).toBe('main')
  })

  // Tier 5: duplicate name returns first by line order
  it('T5: resolves duplicate name to first match', () => {
    const refs: RefSpec[] = [
      { raw: 'parse', name: 'parse' }
    ]
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
  })

  // Tier 6: no match at all
  it('returns empty for completely unmatched ref', () => {
    const refs: RefSpec[] = [
      { raw: 'nonexistent', name: 'nonexistent' }
    ]
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(0)
  })

  // Fallthrough: T1 fails file+line+name match, falls to T2 (file+line)
  it('falls through T1->T2 when file+line+name name mismatch but file+line matches', () => {
    const refs: RefSpec[] = [
      { raw: 'src/utils.cpp:50:wrongName', filePath: 'src/utils.cpp', line: 50, name: 'wrongName' }
    ]
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].functionName).toBe('parse')
  })

  // Mixed: some match, some don't
  it('handles mixed matched/unmatched refs', () => {
    const refs: RefSpec[] = [
      { raw: 'main', name: 'main' },
      { raw: 'nonexistent', name: 'nonexistent' }
    ]
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].raw).toBe('main')
  })

  // Backward compat: old-style Class.method format
  it('resolves old-style Class.method format', () => {
    const refs: RefSpec[] = [
      { raw: 'MyClass.getValue', name: 'MyClass.getValue' }
    ]
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0]).toMatchObject({
      functionName: 'MyClass.getValue',
      filePath: 'src/api.ts',
      startLine: 25,
      endLine: 27
    })
  })

  it('returns empty for empty refs', () => {
    expect(resolveRefs([], mockSymbols)).toEqual([])
  })
})
