import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppProvider } from '../../src/renderer/src/contexts/AppContext'
import { CodeDirectory } from '../../src/renderer/src/components/CodeDirectory'

const mockFiles = [
  { name: 'src', relativePath: 'src', absolutePath: '/repo/src', isDirectory: true },
  { name: 'main.ts', relativePath: 'src/main.ts', absolutePath: '/repo/src/main.ts', isDirectory: false },
  { name: 'README.md', relativePath: 'README.md', absolutePath: '/repo/README.md', isDirectory: false }
]

beforeEach(() => {
  window.electronAPI = {
    ...window.electronAPI,
    listRepoFiles: vi.fn().mockResolvedValue(mockFiles),
    readCodeFile: vi.fn().mockResolvedValue('// code'),
    getGitCommit: vi.fn().mockResolvedValue('a1b2c3d'),
    loadConfig: vi.fn().mockResolvedValue({
      name: 'test',
      codeRepos: [{ path: '/repo', commit: '', lsp: { language: 'typescript', command: '' } }]
    }),
    listNotes: vi.fn().mockResolvedValue([])
  } as unknown as typeof window.electronAPI
})

describe('CodeDirectory', () => {
  it('renders the panel header', () => {
    render(<AppProvider><CodeDirectory /></AppProvider>)
    expect(screen.getByText('Code')).toBeInTheDocument()
  })

  it('renders file tree after load', async () => {
    render(<AppProvider><CodeDirectory /></AppProvider>)
    expect(await screen.findByText('README.md')).toBeInTheDocument()
    expect(screen.getByText('main.ts')).toBeInTheDocument()
  })
})
