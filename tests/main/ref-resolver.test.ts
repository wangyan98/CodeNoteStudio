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

  it('parses @ref(repo#filePath) with # separator', () => {
    const refs = parseRefs('see @ref(claude-code-sourcemap-main#restored-src/src/components/PromptInput/PromptInput.tsx) here')
    expect(refs).toEqual([{
      raw: 'claude-code-sourcemap-main#restored-src/src/components/PromptInput/PromptInput.tsx',
      repo: 'claude-code-sourcemap-main',
      filePath: 'restored-src/src/components/PromptInput/PromptInput.tsx'
    }])
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
  it('T1: resolves @ref(file:line:name) to exact symbol', async () => {
    const refs: RefSpec[] = [
      { raw: 'src/utils.cpp:42:parse', filePath: 'src/utils.cpp', line: 42, name: 'parse' }
    ]
    const mappings = await resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].raw).toBe('src/utils.cpp:42:parse')
    expect(mappings[0].filePath).toBe('src/utils.cpp')
    expect(mappings[0].startLine).toBe(42)
  })

  // Tier 1: file+line+name with Class.method name
  it('T1: resolves @ref(file:line:Class.method)', async () => {
    const refs: RefSpec[] = [
      { raw: 'src/api.ts:25:MyClass.getValue', filePath: 'src/api.ts', line: 25, name: 'MyClass.getValue' }
    ]
    const mappings = await resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].functionName).toBe('MyClass.getValue')
    expect(mappings[0].filePath).toBe('src/api.ts')
  })

  // Tier 2: file + line
  it('T2: resolves @ref(file:line) to symbol at that line', async () => {
    const refs: RefSpec[] = [
      { raw: 'src/utils.cpp:42', filePath: 'src/utils.cpp', line: 42 }
    ]
    const mappings = await resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].functionName).toBe('parse')
  })

  // Tier 2: file+line with no symbol at that line => still resolves via fallback
  it('T2: resolves @ref(file:line) via fallback when no symbol at that line', async () => {
    const refs: RefSpec[] = [
      { raw: 'src/utils.cpp:999', filePath: 'src/utils.cpp', line: 999 }
    ]
    const mappings = await resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].filePath).toBe('src/utils.cpp')
    expect(mappings[0].startLine).toBe(999)
  })

  // Tier 3: file + name
  it('T3: resolves @ref(file:name) to named symbol in file', async () => {
    const refs: RefSpec[] = [
      { raw: 'src/parser.cpp:parse', filePath: 'src/parser.cpp', name: 'parse' }
    ]
    const mappings = await resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].filePath).toBe('src/parser.cpp')
    expect(mappings[0].startLine).toBe(100)
  })

  // Tier 3: file+name with Class.method in file
  it('T3: resolves @ref(file:Class.method) within file', async () => {
    const refs: RefSpec[] = [
      { raw: 'src/api.ts:MyClass.getValue', filePath: 'src/api.ts', name: 'MyClass.getValue' }
    ]
    const mappings = await resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].functionName).toBe('MyClass.getValue')
    expect(mappings[0].filePath).toBe('src/api.ts')
  })

  // Tier 3: file+name with no match => resolves via fallback to file start
  it('T3: resolves @ref(file:name) via fallback when symbol not found in file', async () => {
    const refs: RefSpec[] = [
      { raw: 'src/api.ts:nonexistent', filePath: 'src/api.ts', name: 'nonexistent' }
    ]
    const mappings = await resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].filePath).toBe('src/api.ts')
    expect(mappings[0].startLine).toBe(1)
  })

  // Tier 4: Class.method across all files
  it('T4: resolves @ref(Class.method) across all files', async () => {
    const refs: RefSpec[] = [
      { raw: 'MyClass.getValue', name: 'MyClass.getValue' }
    ]
    const mappings = await resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].functionName).toBe('MyClass.getValue')
    expect(mappings[0].filePath).toBe('src/api.ts')
  })

  // Tier 5: name only across all files (first match)
  it('T5: resolves @ref(name) to first matching symbol', async () => {
    const refs: RefSpec[] = [
      { raw: 'main', name: 'main' }
    ]
    const mappings = await resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].functionName).toBe('main')
  })

  // Tier 5: duplicate name returns first match (stable by symbol iteration order)
  it('T5: resolves duplicate name to first match', async () => {
    const refs: RefSpec[] = [
      { raw: 'parse', name: 'parse' }
    ]
    const mappings = await resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].filePath).toBe('src/utils.cpp')
    expect(mappings[0].startLine).toBe(42)
    expect(mappings[0].functionName).toBe('parse')
  })

  // Tier 6: no match at all
  it('returns empty for completely unmatched ref', async () => {
    const refs: RefSpec[] = [
      { raw: 'nonexistent', name: 'nonexistent' }
    ]
    const mappings = await resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(0)
  })

  // Fallthrough: T1 fails file+line+name match, falls to T2 (file+line)
  it('falls through T1->T2 when file+line+name name mismatch but file+line matches', async () => {
    const refs: RefSpec[] = [
      { raw: 'src/utils.cpp:50:wrongName', filePath: 'src/utils.cpp', line: 50, name: 'wrongName' }
    ]
    const mappings = await resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].functionName).toBe('parse')
  })

  // Mixed: some match, some don't
  it('handles mixed matched/unmatched refs', async () => {
    const refs: RefSpec[] = [
      { raw: 'main', name: 'main' },
      { raw: 'nonexistent', name: 'nonexistent' }
    ]
    const mappings = await resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].raw).toBe('main')
  })

  // Backward compat: old-style Class.method format
  it('resolves old-style Class.method format', async () => {
    const refs: RefSpec[] = [
      { raw: 'MyClass.getValue', name: 'MyClass.getValue' }
    ]
    const mappings = await resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0]).toMatchObject({
      functionName: 'MyClass.getValue',
      filePath: 'src/api.ts',
      startLine: 25,
      endLine: 27
    })
  })

  // Repo prefix: resolves when target repo symbols exist in index
  it('resolves @ref(repo#file#line#name) when target repo is in symbol index', async () => {
    const symbolsWithRepo: (CodeSymbol & { repoPath: string })[] = [
      {
        name: 'UpdateWaveEquation',
        kind: 'function',
        filePath: 'Core_Source_Preview/HanPiWater/FluidDynamics/HPWaterWaveEquation.compute',
        startLine: 40,
        endLine: 50,
        startColumn: 1,
        endColumn: 1,
        repoPath: '/Users/user/Engine/HPWater'
      },
      {
        name: 'main',
        kind: 'function',
        filePath: 'src/index.ts',
        startLine: 1,
        endLine: 10,
        startColumn: 1,
        endColumn: 1,
        repoPath: '/Users/user/Engine/Nilou-main'
      }
    ]
    const refs: RefSpec[] = [{
      raw: 'HPWater#Core_Source_Preview/HanPiWater/FluidDynamics/HPWaterWaveEquation.compute#42#UpdateWaveEquation',
      repo: 'HPWater',
      filePath: 'Core_Source_Preview/HanPiWater/FluidDynamics/HPWaterWaveEquation.compute',
      line: 42,
      name: 'UpdateWaveEquation'
    }]
    const mappings = await resolveRefs(refs, symbolsWithRepo)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].filePath).toBe('Core_Source_Preview/HanPiWater/FluidDynamics/HPWaterWaveEquation.compute')
    expect(mappings[0].functionName).toBe('UpdateWaveEquation')
  })

  // Repo prefix: does NOT fall back to unrelated repo when target repo not in index and no codeRepos config
  it('returns empty when target repo not in symbol index and no codeRepos config', async () => {
    const symbolsWithNilou: (CodeSymbol & { repoPath: string })[] = [
      {
        name: 'main',
        kind: 'function',
        filePath: 'src/index.ts',
        startLine: 1,
        endLine: 10,
        startColumn: 1,
        endColumn: 1,
        repoPath: '/Users/user/Engine/Nilou-main'
      }
    ]
    const refs: RefSpec[] = [{
      raw: 'HPWater#Core_Source_Preview/HanPiWater/FluidDynamics/HPWaterWaveEquation.compute#42#UpdateWaveEquation',
      repo: 'HPWater',
      filePath: 'Core_Source_Preview/HanPiWater/FluidDynamics/HPWaterWaveEquation.compute',
      line: 42,
      name: 'UpdateWaveEquation'
    }]
    const mappings = await resolveRefs(refs, symbolsWithNilou)
    // Should NOT resolve to Nilou-main/.../HPWaterWaveEquation.compute
    expect(mappings).toHaveLength(0)
  })

  // Repo prefix: resolves via codeRepos config when target repo not in symbol index
  it('resolves via codeRepos config when target repo not in symbol index', async () => {
    const symbolsWithNilou: (CodeSymbol & { repoPath: string })[] = [
      {
        name: 'main',
        kind: 'function',
        filePath: 'src/index.ts',
        startLine: 1,
        endLine: 10,
        startColumn: 1,
        endColumn: 1,
        repoPath: '/Users/user/Engine/Nilou-main'
      }
    ]
    const refs: RefSpec[] = [{
      raw: 'HPWater#Core_Source_Preview/HanPiWater/FluidDynamics/HPWaterWaveEquation.compute#42#UpdateWaveEquation',
      repo: 'HPWater',
      filePath: 'Core_Source_Preview/HanPiWater/FluidDynamics/HPWaterWaveEquation.compute',
      line: 42,
      name: 'UpdateWaveEquation'
    }]
    const codeRepos = [{ path: '/Users/user/Engine/HPWater', commit: 'abc123' }]
    const mappings = await resolveRefs(refs, symbolsWithNilou, undefined, codeRepos)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].filePath).toBe('/Users/user/Engine/HPWater/Core_Source_Preview/HanPiWater/FluidDynamics/HPWaterWaveEquation.compute')
    expect(mappings[0].startLine).toBe(42)
  })

  // T6: filePath only (no line, no name) — navigate to file start
  it('T6: resolves @ref(repo#filePath) to file start when file is in symbol index', async () => {
    const symbolsWithRepo: (CodeSymbol & { repoPath: string })[] = [
      {
        name: 'PromptInput',
        kind: 'function',
        filePath: 'restored-src/src/components/PromptInput/PromptInput.tsx',
        startLine: 42,
        endLine: 80,
        startColumn: 1,
        endColumn: 1,
        repoPath: '/Users/user/projects/claude-code-sourcemap-main'
      }
    ]
    const refs: RefSpec[] = [{
      raw: 'claude-code-sourcemap-main#restored-src/src/components/PromptInput/PromptInput.tsx',
      repo: 'claude-code-sourcemap-main',
      filePath: 'restored-src/src/components/PromptInput/PromptInput.tsx'
    }]
    const mappings = await resolveRefs(refs, symbolsWithRepo)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].filePath).toBe('restored-src/src/components/PromptInput/PromptInput.tsx')
    expect(mappings[0].startLine).toBe(1)
  })

  it('T6: resolves @ref(repo#filePath) via codeRepos when file not in index', async () => {
    const symbolsWithNilou: (CodeSymbol & { repoPath: string })[] = [
      {
        name: 'main',
        kind: 'function',
        filePath: 'src/index.ts',
        startLine: 1,
        endLine: 10,
        startColumn: 1,
        endColumn: 1,
        repoPath: '/Users/user/Engine/Nilou-main'
      }
    ]
    const refs: RefSpec[] = [{
      raw: 'HPWater#Core_Source_Preview/HanPiWater/FluidDynamics/HPWaterWaveEquation.compute',
      repo: 'HPWater',
      filePath: 'Core_Source_Preview/HanPiWater/FluidDynamics/HPWaterWaveEquation.compute'
    }]
    const codeRepos = [{ path: '/Users/user/Engine/HPWater', commit: 'abc123' }]
    const mappings = await resolveRefs(refs, symbolsWithNilou, undefined, codeRepos)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].filePath).toBe('/Users/user/Engine/HPWater/Core_Source_Preview/HanPiWater/FluidDynamics/HPWaterWaveEquation.compute')
    expect(mappings[0].startLine).toBe(1)
  })

  it('T6: resolves @ref(filePath) without repo to file start', async () => {
    const refs: RefSpec[] = [{
      raw: 'src/utils.cpp',
      filePath: 'src/utils.cpp'
    }]
    const mappings = await resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].filePath).toBe('src/utils.cpp')
    expect(mappings[0].startLine).toBe(1)
  })

  it('returns empty when T6 file not in index and no repo path available', async () => {
    const refs: RefSpec[] = [{
      raw: 'unknown-repo#some/file.ts',
      repo: 'unknown-repo',
      filePath: 'some/file.ts'
    }]
    const mappings = await resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(0)
  })

  it('returns empty for empty refs', async () => {
    expect(await resolveRefs([], mockSymbols)).toEqual([])
  })
})
