import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppProvider } from '../../src/renderer/src/contexts/AppContext'
import { Layout } from '../../src/renderer/src/components/Layout'

function renderLayout() {
  return render(
    <AppProvider>
      <Layout />
    </AppProvider>
  )
}

beforeEach(() => {
  window.electronAPI = {
    ...window.electronAPI,
    listNotes: vi.fn().mockResolvedValue([]),
    readNote: vi.fn().mockResolvedValue(''),
    updateNote: vi.fn().mockResolvedValue(undefined),
    createNote: vi.fn().mockResolvedValue(undefined),
    deleteNote: vi.fn().mockResolvedValue(undefined),
    renameNote: vi.fn().mockResolvedValue(undefined),
    noteExists: vi.fn().mockResolvedValue(false),
    loadConfig: vi.fn().mockResolvedValue({ name: 'test', codeRepos: [] }),
    saveConfig: vi.fn().mockResolvedValue(undefined)
  } as unknown as typeof window.electronAPI
})

describe('Layout', () => {
  it('renders all four panel headers', () => {
    renderLayout()
    expect(screen.getByText('Notes')).toBeInTheDocument()
    expect(screen.getByText('Note Viewport')).toBeInTheDocument()
    expect(screen.getByText('Code Viewport')).toBeInTheDocument()
    expect(screen.getByText('Code')).toBeInTheDocument()
  })

  it('renders filter buttons in NoteDirectory', async () => {
    renderLayout()
    expect(await screen.findByText('All')).toBeInTheDocument()
    expect(screen.getByText('MD')).toBeInTheDocument()
    expect(screen.getByText('Mind')).toBeInTheDocument()
    expect(screen.getByText('Derive')).toBeInTheDocument()
  })

  it('shows placeholder in NoteViewport and CodeViewport', () => {
    renderLayout()
    expect(screen.getByText('Select a note to view')).toBeInTheDocument()
    expect(screen.getByText('No code file open')).toBeInTheDocument()
  })

  it('renders three resize handles', () => {
    const { container } = renderLayout()
    const handles = container.querySelectorAll('.resize-handle')
    expect(handles).toHaveLength(3)
  })
})
