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
