import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../../src/renderer/src/services/markdown-renderer'

describe('renderMarkdown - tables', () => {
  it('renders a basic GFM pipe table', () => {
    const md = [
      '| Name | Age |',
      '|------|-----|',
      '| Bob  | 30  |',
      '| Jane | 25  |'
    ].join('\n')

    const html = renderMarkdown(md, [])

    expect(html).toContain('<table>')
    expect(html).toContain('<thead>')
    expect(html).toContain('<th>Name</th>')
    expect(html).toContain('<th>Age</th>')
    expect(html).toContain('<tbody>')
    expect(html).toContain('<td>Bob</td>')
    expect(html).toContain('<td>30</td>')
    expect(html).toContain('<td>Jane</td>')
    expect(html).toContain('<td>25</td>')
  })

  it('renders a table with alignment', () => {
    const md = [
      '| Left | Center | Right |',
      '|:-----|:------:|------:|',
      '| a    | b      | c     |'
    ].join('\n')

    const html = renderMarkdown(md, [])

    expect(html).toContain('text-align:left')
    expect(html).toContain('text-align:center')
    expect(html).toContain('text-align:right')
  })

  it('renders a single-column table', () => {
    const md = [
      '| Item |',
      '|------|',
      '| one  |',
      '| two  |'
    ].join('\n')

    const html = renderMarkdown(md, [])

    expect(html).toContain('<th>Item</th>')
    expect(html).toContain('<td>one</td>')
    expect(html).toContain('<td>two</td>')
  })

  it('handles empty cells', () => {
    const md = [
      '| A | B |',
      '|---|---|',
      '|   | x |',
      '| y |   |'
    ].join('\n')

    const html = renderMarkdown(md, [])

    expect(html).toContain('<td></td>')
  })

  it('does not confuse non-table pipe usage with tables', () => {
    // A single pipe line is not a table
    const md = 'this is | not a table'
    const html = renderMarkdown(md, [])
    expect(html).not.toContain('<table>')
  })
})

describe('renderMarkdown - formulas', () => {
  it('renders inline formula with KaTeX', () => {
    const html = renderMarkdown('Einstein said $E=mc^2$ is true', [])
    expect(html).toContain('katex')
    expect(html).toContain('math-inline')
  })

  it('renders block formula with KaTeX', () => {
    const md = [
      'Before',
      '',
      '$$',
      'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}',
      '$$',
      '',
      'After'
    ].join('\n')

    const html = renderMarkdown(md, [])

    expect(html).toContain('katex')
    expect(html).toContain('math-block')
  })

  it('leaves unmatched single $ as literal text', () => {
    const html = renderMarkdown('It costs $5 today', [])
    // No closing $ on same line — $5 should stay as literal text
    expect(html).not.toContain('katex')
  })

  it('handles inline formula adjacent to punctuation', () => {
    const html = renderMarkdown('use $x$ here', [])
    expect(html).toContain('katex')
  })
})
