import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppProvider, initialState } from '../../src/renderer/src/contexts/AppContext'
import { WorkspaceToolbar } from '../../src/renderer/src/components/WorkspaceToolbar'

beforeEach(() => {
  window.electronAPI = {
    ...window.electronAPI,
    selectFolder: vi.fn().mockResolvedValue('/test/path'),
    openWorkspace: vi.fn().mockResolvedValue({ name: 'Test', notesPath: './', codeRepos: [] }),
    getWorkspacePath: vi.fn().mockResolvedValue('/test/path'),
    loadConfig: vi.fn().mockResolvedValue({ name: 'My Notes', notesPath: './', codeRepos: [] }),
    saveConfig: vi.fn(),
    listNotes: vi.fn().mockResolvedValue([]),
    listRepoFiles: vi.fn().mockResolvedValue([]),
    loadUiState: vi.fn().mockResolvedValue(null),
    saveUiState: vi.fn(),
    platform: 'darwin',
    getAppVersion: vi.fn().mockResolvedValue('0.1.0'),
    getProjectPath: vi.fn().mockResolvedValue('/test/path'),
    createNote: vi.fn(),
    readNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
    renameNote: vi.fn(),
    noteExists: vi.fn(),
    readCodeFile: vi.fn(),
    getGitCommit: vi.fn(),
    parseSymbols: vi.fn(),
    indexSymbols: vi.fn(),
    resolveRefs: vi.fn(),
    startServer: vi.fn(),
    stopServer: vi.fn(),
    getServerStatus: vi.fn().mockResolvedValue({ running: false, port: 0, url: '' }),
    getWorkspaceHistory: vi.fn().mockResolvedValue([]),
    removeFromWorkspaceHistory: vi.fn().mockResolvedValue(undefined),
    clearWorkspace: vi.fn().mockResolvedValue(undefined),
    createWorkspace: vi.fn().mockResolvedValue('/test/new-workspace'),
  } as unknown as typeof window.electronAPI
})

describe('WorkspaceToolbar', () => {
  it('renders landing page when no workspace is open', () => {
    render(
      <AppProvider initialStateOverride={{
        ...initialState,
        workspacePath: null, workspaceName: '',
      }}>
        <WorkspaceToolbar />
      </AppProvider>
    )
    expect(screen.getByText('Code Note Studio')).toBeDefined()
    expect(screen.getByText('Open Workspace')).toBeDefined()
  })

  it('renders toolbar when workspace is open', () => {
    render(
      <AppProvider initialStateOverride={{
        ...initialState,
        workspacePath: '/test/path', workspaceName: 'My Notes',
      }}>
        <WorkspaceToolbar />
      </AppProvider>
    )
    expect(screen.getByText(/My Notes/)).toBeDefined()
  })

  it('renders history list when history is available', async () => {
    window.electronAPI.getWorkspaceHistory = vi.fn().mockResolvedValue([
      { path: '/path/a', name: 'Project A', lastOpened: 2000 },
      { path: '/path/b', name: 'Project B', lastOpened: 1000 },
    ])
    render(
      <AppProvider initialStateOverride={{
        ...initialState,
        workspaceHistory: [
          { path: '/path/a', name: 'Project A', lastOpened: 2000 },
          { path: '/path/b', name: 'Project B', lastOpened: 1000 },
        ],
      }}>
        <WorkspaceToolbar />
      </AppProvider>
    )
    expect(screen.getByText('Recent Workspaces')).toBeDefined()
    expect(screen.getByText('Project A')).toBeDefined()
    expect(screen.getByText('Project B')).toBeDefined()
  })

  it('hides recent workspaces section when history is empty', () => {
    render(
      <AppProvider initialStateOverride={{
        ...initialState,
        workspaceHistory: [],
      }}>
        <WorkspaceToolbar />
      </AppProvider>
    )
    expect(screen.queryByText('Recent Workspaces')).toBeNull()
  })
})
