# Markdown Table & Formula Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GFM pipe table and KaTeX math formula rendering (inline `$...$` + block `$$...$$`) to the custom markdown renderer.

**Architecture:** Extend the existing regex-based `renderMarkdown()` in `markdown-renderer.ts` with three additions: formula protection (placeholder-based, before inline formatting), table processing (after existing rules, before paragraph wrap), and formula restoration. KaTeX CSS is imported once in `MdEditor.tsx`.

**Tech Stack:** TypeScript, KaTeX (already in deps), vitest

---

### Task 1: Write failing tests for table rendering

**Files:**
- Create: `tests/renderer/markdown-renderer.test.ts`

- [ ] **Step 1: Write table rendering tests**

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/renderer/markdown-renderer.test.ts`
Expected: All 5 table tests FAIL with no `<table>` elements

- [ ] **Step 3: Commit**

```bash
git add tests/renderer/markdown-renderer.test.ts
git commit -m "test: add failing table rendering tests for markdown renderer"
```

---

### Task 2: Write failing tests for formula rendering

**Files:**
- Modify: `tests/renderer/markdown-renderer.test.ts`

- [ ] **Step 1: Add formula rendering tests**

Add the following describe block after the table tests, before the closing of the file:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/renderer/markdown-renderer.test.ts`
Expected: 4 formula tests FAIL (no KaTeX rendering yet); table tests still fail

- [ ] **Step 3: Commit**

```bash
git add tests/renderer/markdown-renderer.test.ts
git commit -m "test: add failing formula rendering tests for markdown renderer"
```

---

### Task 3: Implement table rendering

**Files:**
- Modify: `src/renderer/src/services/markdown-renderer.ts`

- [ ] **Step 1: Add `renderTableBlock` helper function**

Add this function after `tokenizeLine` (after line 18):

```ts
function parseAlignment(delimiter: string): ('left' | 'center' | 'right')[] {
  return delimiter
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => {
      const trimmed = cell.trim()
      if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center'
      if (trimmed.endsWith(':')) return 'right'
      return 'left'
    })
}

function renderTable(lines: string[]): string {
  const rows = lines
    .map(line => line.replace(/^\|/, '').replace(/\|$/, ''))
    .map(line => line.split('|').map(cell => cell.trim()))

  const headerCells = rows[0]
  const alignments = rows.length > 1 && /^[\s:\-|]+$/.test(lines[1])
    ? parseAlignment(lines[1])
    : headerCells.map(() => 'left')

  const dataStart = rows.length > 1 && /^[\s:\-|]+$/.test(lines[1]) ? 2 : 1

  const headerHtml = '<tr>' + headerCells.map((cell, i) => {
    const style = alignments[i] ? ` style="text-align:${alignments[i]}"` : ''
    return `<th${style}>${cell}</th>`
  }).join('') + '</tr>'

  const bodyHtml = rows.slice(dataStart).map(row => {
    return '<tr>' + row.map((cell, i) => {
      const style = alignments[i] ? ` style="text-align:${alignments[i]}"` : ''
      return `<td${style}>${cell}</td>`
    }).join('') + '</tr>'
  }).join('')

  return `<table><thead>${headerHtml}</thead><tbody>${bodyHtml}</tbody></table>`
}
```

- [ ] **Step 2: Add table regex processing in `renderMarkdown`**

Insert after the `@ref` code references regex (after the existing block ending at line 165) and before the "Restore protected code blocks" line (currently line 168):

```ts
  // Tables (consecutive pipe-table lines)
  html = html.replace(/(?:^\|.+\|$\n?)+/gm, (match) => {
    const lines = match.trim().split('\n')
    if (lines.length < 2) return match // single pipe line is not a table
    return renderTable(lines)
  })
```

- [ ] **Step 3: Run table tests**

Run: `npx vitest run tests/renderer/markdown-renderer.test.ts -t 'tables'`
Expected: All 5 table tests PASS; formula tests still fail

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/services/markdown-renderer.ts
git commit -m "feat: add GFM pipe table rendering to markdown renderer"
```

---

### Task 4: Implement formula rendering

**Files:**
- Modify: `src/renderer/src/services/markdown-renderer.ts`

- [ ] **Step 1: Import KaTeX at the top of the file**

Replace the top of `markdown-renderer.ts`:

```ts
import katex from 'katex'
import type { CodeMapping, CodeSnippet } from '../types'
```

(Add `import katex from 'katex'` as the first line, before the type import.)

- [ ] **Step 2: Add formula protection and restoration in `renderMarkdown`**

Insert after the fenced code block protection (after line 98: `return \`\x00CODE${idx}\x00\``) and the closing `})` of that replace call:

```ts
  // Protect block formulas $$...$$
  const blockFormulas: string[] = []
  html = html.replace(/\$\$([\s\S]*?)\$\$/g, (_full, formula) => {
    const idx = blockFormulas.length
    blockFormulas.push(
      katex.renderToString(formula.trim(), { displayMode: true, throwOnError: false })
    )
    return `\x00MATHB${idx}\x00`
  })

  // Protect inline formulas $...$
  const inlineFormulas: string[] = []
  html = html.replace(/\$([^$\n]+)\$/g, (_full, formula) => {
    const idx = inlineFormulas.length
    inlineFormulas.push(
      katex.renderToString(formula.trim(), { displayMode: false, throwOnError: false })
    )
    return `\x00MATHI${idx}\x00`
  })
```

- [ ] **Step 3: Add formula restoration before paragraph wrapping**

Insert after the code block restoration line (`html = html.replace(/\x00CODE(\d+)\x00/g, ...)`) and before the "Paragraph wrapping" comment:

```ts
  // Restore protected block formulas
  html = html.replace(
    /\x00MATHB(\d+)\x00/g,
    (_full, idx) => `<div class="math-block">${blockFormulas[parseInt(idx)]}</div>`
  )

  // Restore protected inline formulas
  html = html.replace(
    /\x00MATHI(\d+)\x00/g,
    (_full, idx) => `<span class="math-inline">${inlineFormulas[parseInt(idx)]}</span>`
  )
```

- [ ] **Step 4: Run formula tests**

Run: `npx vitest run tests/renderer/markdown-renderer.test.ts -t 'formulas'`
Expected: All 4 formula tests PASS

- [ ] **Step 5: Run ALL tests to check for regressions**

Run: `npx vitest run tests/renderer/markdown-renderer.test.ts`
Expected: All 9 tests PASS (5 table + 4 formula)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/services/markdown-renderer.ts
git commit -m "feat: add KaTeX math formula rendering ($inline$ and $$block$$)"
```

---

### Task 5: Add CSS styles for tables and math, import KaTeX CSS

**Files:**
- Modify: `src/renderer/src/components/editors/MdEditor.css`
- Modify: `src/renderer/src/components/editors/MdEditor.tsx`

- [ ] **Step 1: Add table and math styles to MdEditor.css**

Append to the end of `MdEditor.css`:

```css
/* ---- Tables ---- */

.md-preview-content table {
  border-collapse: collapse;
  margin: 8px 0;
  width: 100%;
}

.md-preview-content th,
.md-preview-content td {
  border: 1px solid var(--border-color);
  padding: 6px 12px;
  text-align: left;
}

.md-preview-content th {
  background: rgba(255, 255, 255, 0.05);
  font-weight: 600;
}

.md-preview-content tr:nth-child(even) td {
  background: rgba(255, 255, 255, 0.02);
}

/* ---- Math ---- */

.math-block {
  text-align: center;
  margin: 12px 0;
  overflow-x: auto;
}

.math-block .katex-display {
  margin: 0;
}

.math-inline {
  display: inline;
}
```

- [ ] **Step 2: Import KaTeX CSS in MdEditor.tsx**

Add at the top of the imports in `MdEditor.tsx`, before the local CSS import:

```ts
import 'katex/dist/katex.min.css'
```

Place it on line 1 (before `import { useState, ...}`).

- [ ] **Step 3: Run all tests to verify nothing is broken**

Run: `npx vitest run`
Expected: All existing tests PASS, all 9 new tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/editors/MdEditor.css src/renderer/src/components/editors/MdEditor.tsx
git commit -m "style: add table and KaTeX math CSS, import katex.min.css"
```

---

### Task 6: Manual verification

**Files:** None (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: Electron app starts without errors

- [ ] **Step 2: Test table rendering in the app**

Create or open a `.md` note, switch to Preview mode. Enter:

```
| Name | Value |
|------|-------|
| Foo  | 42    |
| Bar  | 99    |
```

Expected: Table renders with header row, border lines, and zebra-striped rows.

- [ ] **Step 3: Test formula rendering in the app**

Enter inline formula: `The formula $E=mc^2$ is inline.`

Expected: `E=mc^2` renders as KaTeX-styled math inline.

Enter block formula:
```
$$
\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}
$$
```

Expected: The integral renders as a centered KaTeX block.

- [ ] **Step 4: Verify no regressions**

Check that existing features still work: headings, lists, bold/italic, code blocks, images, links, `@ref()` references, `![[...]]` embeds all render correctly in preview mode.
