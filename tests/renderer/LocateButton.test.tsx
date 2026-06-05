import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LocateButton } from '../../src/renderer/src/components/editors/LocateButton'

describe('LocateButton', () => {
  it('renders with default title', () => {
    render(<LocateButton onLocate={() => {}} />)
    const btn = screen.getByTitle('定位到根节点')
    expect(btn).toBeInTheDocument()
    expect(btn.tagName).toBe('BUTTON')
  })

  it('renders with custom title', () => {
    render(<LocateButton onLocate={() => {}} title="Go home" />)
    expect(screen.getByTitle('Go home')).toBeInTheDocument()
  })

  it('calls onLocate when clicked', () => {
    const onLocate = vi.fn()
    render(<LocateButton onLocate={onLocate} />)
    fireEvent.click(screen.getByTitle('定位到根节点'))
    expect(onLocate).toHaveBeenCalledOnce()
  })
})
