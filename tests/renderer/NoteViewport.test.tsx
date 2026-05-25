import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppProvider } from '../../src/renderer/src/contexts/AppContext'
import { NoteViewport } from '../../src/renderer/src/components/NoteViewport'

describe('NoteViewport', () => {
  it('shows placeholder when no note is selected', () => {
    render(
      <AppProvider>
        <NoteViewport />
      </AppProvider>
    )
    expect(screen.getByText('Select a note to view')).toBeInTheDocument()
  })
})
