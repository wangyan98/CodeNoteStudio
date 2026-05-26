import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppProvider, initialState } from '../../src/renderer/src/contexts/AppContext'
import { CodeDirectory } from '../../src/renderer/src/components/CodeDirectory'
import type { AppState } from '../../src/renderer/src/types'

const mockFiles = [
  { name: 'src', relativePath: 'src', absolutePath: '/repo/src', isDirectory: true },
  { name: 'main.ts', relativePath: 'src/main.ts', absolutePath: '/repo/src/main.ts', isDirectory: false },
  { name: 'README.md', relativePath: 'README.md', absolutePath: '/repo/README.md', isDirectory: false }
]

const repoState: AppState = {
  ...initialState,
  codeRepoPath: '/repo'
}

beforeEach(() => {
  window.electronAPI = {
    ...window.electronAPI,
    listRepoFiles: vi.fn().mockResolvedValue(mockFiles),
    readCodeFile: vi.fn().mockResolvedValue('// code'),
    getGitCommit: vi.fn().mockResolvedValue({ sha: 'a1b2c3d4e5f6', message: 'test commit', author: 'test', date: '2024-01-01' }),
    loadConfig: vi.fn().mockResolvedValue({
      name: 'test',
      notesPath: './',
      codeRepos: [{ path: '/repo', commit: '' }]
    }),
    listNotes: vi.fn().mockResolvedValue([])
  } as unknown as typeof window.electronAPI
})

describe('CodeDirectory', () => {
  it('renders the panel header', () => {
    render(
      <AppProvider initialStateOverride={repoState}>
        <CodeDirectory />
      </AppProvider>
    )
    expect(screen.getByText('Code')).toBeInTheDocument()
  })

  it('renders file tree after load', async () => {
    render(
      <AppProvider initialStateOverride={repoState}>
        <CodeDirectory />
      </AppProvider>
    )
    expect(await screen.findByText('README.md')).toBeInTheDocument()
    expect(screen.getByText('main.ts')).toBeInTheDocument()
  })
})
