import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DerivationEditor } from '../../src/renderer/src/components/editors/DerivationEditor'
import type { DerivationDocument } from '../../src/main/schemas/note-types'

function makeDoc(): DerivationDocument {
  return {
    type: 'derive',
    version: 1,
    nodes: [
      {
        id: 'n1',
        title: 'Setup',
        content: 'x = 1',
        stepNumber: 1,
        derivesFrom: null,
        derivesTo: ['n2'],
        embedRefs: [],
        codeMappings: []
      },
      {
        id: 'n2',
        title: 'Derive',
        content: 'x = 2',
        stepNumber: 2,
        derivesFrom: 'n1',
        derivesTo: [],
        embedRefs: [],
        codeMappings: []
      }
    ]
  }
}

describe('DerivationEditor', () => {
  let onSave: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onSave = vi.fn().mockResolvedValue(undefined)
  })

  it('renders all nodes', () => {
    render(<DerivationEditor document={makeDoc()} onSave={onSave} codeRepoPath={null} />)
    expect(screen.getByDisplayValue('Setup')).toBeTruthy()
    expect(screen.getByDisplayValue('Derive')).toBeTruthy()
  })

  it('renders step number badges', () => {
    render(<DerivationEditor document={makeDoc()} onSave={onSave} codeRepoPath={null} />)
    // Step badges contain just the number as text
    const badges = document.querySelectorAll('.derive-step-badge')
    expect(badges.length).toBe(2)
    expect(badges[0].textContent).toBe('1')
    expect(badges[1].textContent).toBe('2')
  })

  it('shows empty state when no nodes', () => {
    render(<DerivationEditor document={{ type: 'derive', version: 1, nodes: [] }} onSave={onSave} codeRepoPath={null} />)
    expect(screen.getByText('Add your first step')).toBeTruthy()
  })

  it('adds a node when + Add Step button is clicked (empty state)', () => {
    render(<DerivationEditor document={{ type: 'derive', version: 1, nodes: [] }} onSave={onSave} codeRepoPath={null} />)
    const btn = screen.getByText('+ Add Step')
    fireEvent.click(btn)
    expect(screen.getByDisplayValue('New Step')).toBeTruthy()
  })

  it('adds a node at the end when bottom + Add Step is clicked', () => {
    render(<DerivationEditor document={makeDoc()} onSave={onSave} codeRepoPath={null} />)
    const buttons = screen.getAllByText('+ Add Step')
    fireEvent.click(buttons[0])
    expect(screen.getByDisplayValue('New Step')).toBeTruthy()
  })

  it('updates title on input change', () => {
    render(<DerivationEditor document={makeDoc()} onSave={onSave} codeRepoPath={null} />)
    const input = screen.getByDisplayValue('Setup')
    fireEvent.change(input, { target: { value: 'New Setup' } })
    expect(screen.getByDisplayValue('New Setup')).toBeTruthy()
  })

  it('updates content on textarea change', () => {
    render(<DerivationEditor document={makeDoc()} onSave={onSave} codeRepoPath={null} />)
    const textarea = screen.getByDisplayValue('x = 1')
    fireEvent.change(textarea, { target: { value: 'y = 3' } })
    expect(screen.getByDisplayValue('y = 3')).toBeTruthy()
  })

  it('triggers auto-save after editing', async () => {
    vi.useFakeTimers()
    render(<DerivationEditor document={makeDoc()} onSave={onSave} codeRepoPath={null} />)
    const input = screen.getByDisplayValue('Setup')
    fireEvent.change(input, { target: { value: 'Changed' } })
    expect(screen.getByText('Unsaved')).toBeTruthy()
    vi.advanceTimersByTime(300)
    await vi.runAllTimersAsync()
    expect(onSave).toHaveBeenCalledTimes(1)
    const savedDoc = onSave.mock.calls[0][0] as DerivationDocument
    expect(savedDoc.nodes[0].title).toBe('Changed')
    vi.useRealTimers()
  })

  it('deletes a node when delete button is clicked', () => {
    window.confirm = vi.fn().mockReturnValue(true)
    render(<DerivationEditor document={makeDoc()} onSave={onSave} codeRepoPath={null} />)
    const deleteButtons = screen.getAllByTitle('Delete step')
    fireEvent.click(deleteButtons[0])
    expect(screen.queryByDisplayValue('Setup')).toBeNull()
  })

  it('displays save status', () => {
    render(<DerivationEditor document={makeDoc()} onSave={onSave} codeRepoPath={null} />)
    expect(screen.getByText('Derivation')).toBeTruthy()
  })
})
