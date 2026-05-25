import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppProvider } from '../../src/renderer/src/contexts/AppContext'
import { NoteDirectory } from '../../src/renderer/src/components/NoteDirectory'
import type { NoteItem } from '../../src/renderer/src/types'

const mockNotes: NoteItem[] = [
  { name: 'readme.md', relativePath: 'readme.md', type: 'md' },
  { name: 'sorting.mind.json', relativePath: 'algo/sorting.mind.json', type: 'mind' },
  { name: 'main.derive.json', relativePath: 'math/main.derive.json', type: 'derive' }
]

beforeEach(() => {
  window.electronAPI = {
    ...window.electronAPI,
    listNotes: vi.fn().mockResolvedValue(mockNotes),
    createNote: vi.fn().mockResolvedValue(undefined),
    deleteNote: vi.fn().mockResolvedValue(undefined),
    readNote: vi.fn().mockResolvedValue('# Test'),
    updateNote: vi.fn().mockResolvedValue(undefined),
    renameNote: vi.fn().mockResolvedValue(undefined),
    noteExists: vi.fn().mockResolvedValue(false)
  } as unknown as typeof window.electronAPI
})

describe('NoteDirectory', () => {
  it('renders the panel header', () => {
    render(<AppProvider><NoteDirectory /></AppProvider>)
    expect(screen.getByText('Notes')).toBeInTheDocument()
  })

  it('renders note items after load', async () => {
    render(<AppProvider><NoteDirectory /></AppProvider>)
    expect(await screen.findByText('readme.md')).toBeInTheDocument()
    expect(screen.getByText('sorting.mind.json')).toBeInTheDocument()
    expect(screen.getByText('main.derive.json')).toBeInTheDocument()
  })

  it('shows type filter buttons', () => {
    render(<AppProvider><NoteDirectory /></AppProvider>)
    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('MD')).toBeInTheDocument()
    expect(screen.getByText('Mind')).toBeInTheDocument()
    expect(screen.getByText('Derive')).toBeInTheDocument()
  })
})
