import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppProvider, appReducer, initialState } from '../../src/renderer/src/contexts/AppContext'
import { CodeViewport } from '../../src/renderer/src/components/CodeViewport'

beforeEach(() => {
  window.electronAPI = {
    ...window.electronAPI,
    readCodeFile: vi.fn().mockResolvedValue('// code'),
    getGitCommit: vi.fn().mockResolvedValue({ sha: 'a1b2c3d4e5f6', message: 'test commit', author: 'test', date: '2024-01-01' }),
    listNotes: vi.fn().mockResolvedValue([])
  } as unknown as typeof window.electronAPI
})

describe('CodeViewport', () => {
  it('shows placeholder when no files are open', () => {
    render(<AppProvider><CodeViewport /></AppProvider>)
    expect(screen.getByText('No code file open')).toBeInTheDocument()
  })

  it('renders tab bar for open files', () => {
    const state = appReducer(initialState, {
      type: 'OPEN_CODE_FILE',
      file: { path: '/repo/src/main.ts', name: 'src/main.ts', language: 'typescript' }
    })
    render(
      <AppProvider initialStateOverride={state}>
        <CodeViewport />
      </AppProvider>
    )
    const matches = screen.getAllByText('src/main.ts')
    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0]).toBeInTheDocument()
  })
})
