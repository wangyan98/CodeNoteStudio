# Markdown Table & Formula Rendering

**Date:** 2026-06-08
**Status:** approved

## Goal

Add **GFM pipe tables** and **KaTeX math formula rendering** (inline `$...$` + block `$$...$$`) to the custom markdown renderer. KaTeX (`^0.17.0`) is already a dependency; this work wires it into the preview pipeline.

## Scope

- `src/renderer/src/services/markdown-renderer.ts` — add table + formula regex processing
- `src/renderer/src/components/editors/MdEditor.css` — table + math CSS styles
- `src/renderer/src/components/editors/MdEditor.tsx` — import `katex/dist/katex.min.css`

Out of scope: editor-side changes, embed rendering, `@ref()` syntax, other markdown extensions.

## Design

### Processing order

```
HTML entity escape →
  protect fenced code blocks (existing placeholder: \x00CODEn\x00) →
  protect block formulas $$...$$ (new placeholder: \x00MATHBn\x00) →
  protect inline formulas $...$ (new placeholder: \x00MATHIn\x00) →
  headings / lists / blockquotes / bold-italic / images / links (existing) →
  tables (new, runs before paragraph wrapping) →
  restore all placeholders (code + formulas) →
  paragraph wrapping (existing)
```

Placeholders prevent formula content (which contains `_`, `^`, `\` etc.) from being processed by downstream markdown rules, and prevent code fences from being matched inside formula blocks.

### 1. Table rendering

Runs on consecutive pipe-table lines before paragraph wrapping. Algorithm:

1. Match multi-line blocks where every line starts and ends with `|`
2. First line → `<thead><tr>` with `<th>` cells
3. Delimiter line (`|---|---|`) → skipped
4. Remaining lines → `<tbody><tr>` with `<td>` cells
5. Wrap entire block in `<table>`

GFM column alignment (`:---`, `:---:`, `---:`) on the delimiter row maps to `text-align` style on `<th>`/`<td>`.

Within cells, inline formatting (bold, italic, code, links) is already handled because those rules run before table processing. No table-specific inline processing is needed.

### 2. Formula rendering

**Block formulas `$$...$$`** — matched with a multi-line regex. Each match:
```
katex.renderToString(formula, { displayMode: true, throwOnError: false })
```
Wrapped in `<div class="math-block">` for centering.

**Inline formulas `$...$`** — matched with single-line regex. Each match:
```
katex.renderToString(formula, { displayMode: false, throwOnError: false })
```
Wrapped in `<span class="math-inline">` for inline flow.

`$` with no closing `$` on the same line is left as literal text. `$$` blocks require paired delimiters.

### 3. CSS additions

```css
/* Tables */
.md-preview-content table {
  border-collapse: collapse;
  margin: 8px 0;
  width: 100%;
}
.md-preview-content th, .md-preview-content td {
  border: 1px solid var(--border-color);
  padding: 6px 12px;
  text-align: left;
}
.md-preview-content th {
  background: rgba(255,255,255,0.05);
  font-weight: 600;
}
.md-preview-content tr:nth-child(even) td {
  background: rgba(255,255,255,0.02);
}

/* Math */
.math-block {
  text-align: center;
  margin: 12px 0;
  overflow-x: auto;
}
.math-inline {
  display: inline;
}
```

KaTeX's own CSS (`katex/dist/katex.min.css`) is imported once in `MdEditor.tsx`.

### 4. Error handling

- `throwOnError: false` — invalid LaTeX renders as red-colored error text instead of crashing the preview
- Empty cells and edge whitespace trimmed
- Unclosed `$` delimiters left as literal text

## Files changed

| File | Change |
|------|--------|
| `markdown-renderer.ts` | Add formula + table regex steps, import katex, two placeholder arrays |
| `MdEditor.tsx` | Import `katex/dist/katex.min.css` |
| `MdEditor.css` | Add table + `.math-block` / `.math-inline` styles |

## Risks

- KaTeX import is a synchronous ESM import in a Vite/Electron context — already confirmed compatible since `katex` is in the dep tree
- Regex-based table parsing does not handle nested tables or escaped pipes within cells — acceptable for "basic GFM" scope
- `$` in prose (currency, shell prompts) may trigger false formula detection — `throwOnError: false` + plain `$` without closing pair are left intact, mitigating most cases
