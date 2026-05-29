import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppProvider } from '../../src/renderer/src/contexts/AppContext'
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
    getServerStatus: vi.fn().mockResolvedValue({ running: false, port: 0, url: '' })
  } as unknown as typeof window.electronAPI
})

describe('WorkspaceToolbar', () => {
  it('renders landing page when no workspace is open', () => {
    render(
      <AppProvider initialStateOverride={{
        notes: [], selectedNoteId: null, noteFilter: 'all', noteSearchQuery: '',
        activeNoteContent: null, activeNoteType: null, openCodeFiles: [],
        activeCodeFileIndex: -1, codeRepoPath: null, codeFiles: [],
        panelWidths: { panel1: 18, panel2: 32, panel3: 32, panel4: 18 },
        workspacePath: null, workspaceName: '',
        codeMappings: [], pendingScroll: null, codeRepos: []
      }}>
        <WorkspaceToolbar />
      </AppProvider>
    )
    expect(screen.getByText('Code Note Studio')).toBeDefined()
    expect(screen.getByText('Open Folder')).toBeDefined()
  })

  it('renders toolbar when workspace is open', () => {
    render(
      <AppProvider initialStateOverride={{
        notes: [], selectedNoteId: null, noteFilter: 'all', noteSearchQuery: '',
        activeNoteContent: null, activeNoteType: null, openCodeFiles: [],
        activeCodeFileIndex: -1, codeRepoPath: null, codeFiles: [],
        panelWidths: { panel1: 18, panel2: 32, panel3: 32, panel4: 18 },
        workspacePath: '/test/path', workspaceName: 'My Notes',
        codeMappings: [], pendingScroll: null, codeRepos: []
      }}>
        <WorkspaceToolbar />
      </AppProvider>
    )
    expect(screen.getByText(/My Notes/)).toBeDefined()
  })
})
