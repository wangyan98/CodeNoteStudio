// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { parseRefs, resolveRefs } from '../../src/main/services/ref-resolver'
import type { CodeSymbol } from '../../src/main/services/code-parser'

describe('parseRefs', () => {
  it('extracts @ref annotations from markdown', () => {
    const content = `
# Architecture

The main entry point is @ref(main). For data fetching, see @ref(fetchData).

Some code:

\`\`\`ts
@ref(MyClass.getValue)
\`\`\`
`
    const refs = parseRefs(content)
    expect(refs).toHaveLength(3)
    expect(refs).toContain('main')
    expect(refs).toContain('fetchData')
    expect(refs).toContain('MyClass.getValue')
  })

  it('returns empty array when no @ref present', () => {
    expect(parseRefs('just some text without refs')).toEqual([])
    expect(parseRefs('')).toEqual([])
  })

  it('extracts @ref from mind map content', () => {
    const content = JSON.stringify({
      root: {
        title: 'Auth Flow',
        content: 'See @ref(authenticate) for the implementation',
        children: [
          { title: 'Login', content: '@ref(loginHandler)', children: [] }
        ]
      }
    })
    const refs = parseRefs(content)
    expect(refs).toContain('authenticate')
    expect(refs).toContain('loginHandler')
  })

  it('extracts @ref from derivation nodes', () => {
    const content = JSON.stringify({
      nodes: [
        { title: 'Step 1', content: 'Start with @ref(init)', stepNumber: 1 },
        { title: 'Step 2', content: '@ref(process)', stepNumber: 2 }
      ]
    })
    const refs = parseRefs(content)
    expect(refs).toContain('init')
    expect(refs).toContain('process')
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
