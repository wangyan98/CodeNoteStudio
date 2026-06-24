import { describe, it, expect } from 'vitest'
import { buildFrozenFromState, deriveRoundState } from '../../src/renderer/src/components/AgentDialog'
import { initialState } from '../../src/renderer/src/contexts/AppContext'
import type { AppState } from '../../src/renderer/src/types'

describe('buildFrozenFromState', () => {
  it('freezes workspace, repo, active file, and provider', () => {
    const state: AppState = {
      ...initialState,
      workspacePath: '/ws',
      codeRepoPath: '/repo',
      openCodeFiles: [{ path: '/ws/a.py', name: 'a.py', language: 'python' } as any],
      activeCodeFileIndex: 0,
    }
    const frozen = buildFrozenFromState(state, 'p1')
    expect(frozen.workspace).toBe('/ws')
    expect(frozen.repos).toEqual(['/repo'])
    expect(frozen.activeFile).toBe('/ws/a.py')
    expect(frozen.providerId).toBe('p1')
    expect(frozen.frozenAt).not.toBe('')
  })

  it('falls back to empty repo list when no code repo path', () => {
    const state: AppState = { ...initialState, workspacePath: '/ws' }
    const frozen = buildFrozenFromState(state, 'p1')
    expect(frozen.repos).toEqual([])
    expect(frozen.activeFile).toBe('')
  })
})

describe('deriveRoundState', () => {
  it('pending when no messages', () => {
    expect(deriveRoundState(0, null)).toBe('pending')
  })
  it('frozen when messages exist and snapshot present', () => {
    expect(deriveRoundState(5, { workspace: '/ws', repos: [], activeFile: '', providerId: '', frozenAt: 't' } as any)).toBe('frozen')
  })
  it('staleContext when messages exist but snapshot is null', () => {
    expect(deriveRoundState(5, null)).toBe('staleContext')
  })
})