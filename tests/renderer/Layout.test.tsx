import { describe, it, expect } from 'vitest'
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

describe('Layout', () => {
  it('renders all four panel headers', () => {
    renderLayout()
    expect(screen.getByText('Notes')).toBeInTheDocument()
    expect(screen.getByText('Note Viewport')).toBeInTheDocument()
    expect(screen.getByText('Code Viewport')).toBeInTheDocument()
    expect(screen.getByText('Code')).toBeInTheDocument()
  })

  it('renders placeholder content in each panel', () => {
    renderLayout()
    expect(screen.getByText('Note directory tree')).toBeInTheDocument()
    expect(screen.getByText('Select a note to view')).toBeInTheDocument()
    expect(screen.getByText('No code file open')).toBeInTheDocument()
    expect(screen.getByText('Code directory tree')).toBeInTheDocument()
  })

  it('renders three resize handles', () => {
    const { container } = renderLayout()
    const handles = container.querySelectorAll('.resize-handle')
    expect(handles).toHaveLength(3)
  })
})
