# @ref Code Context Preview in Note Viewport

**Date:** 2026-05-28
**Status:** approved

## Summary

When previewing a note, `@ref(src/utils.c:47:getValue)` currently shows only the
link text. This feature adds inline code context — 10 lines above and below the
referenced line — displayed as a syntax-highlighted code block under each ref.

## Data Flow

1. `resolveRefs` parses `@ref(...)` → matches symbols → returns `CodeMapping[]`
2. **New:** For each matched ref, read the source file and extract lines
   `[startLine - 10, startLine + 10]`, bounded to file range
3. `CodeMapping` gains a `codeSnippet` field with the line data
4. `renderMarkdown` replaces `@ref(...)` with the link text followed by a
   `<pre><code>` block showing the snippet, with the target line highlighted

## Types

**Extended `CodeMapping`:**

```typescript
interface CodeSnippet {
  lines: string[]           // source lines (max 21 lines)
  startLine: number         // first line number in the snippet
  highlightLine: number     // the @ref target line number
}

interface CodeMapping {
  raw: string
  functionName: string
  filePath: string
  startLine: number
  endLine: number
  codeSnippet?: CodeSnippet // new field
}
```

## Main Process Changes

**`src/main/services/ref-resolver.ts`:**
- After matching a symbol, read the file via `readTextFile` and extract the
  line range `[startLine - CONTEXT_LINES, startLine + CONTEXT_LINES]`
- `CONTEXT_LINES = 10`
- Bound the slice to `[1, totalLines]`
- Build `CodeSnippet` with lines, startLine, and highlightLine
- Attach to the `CodeMapping` result

## Renderer Changes

**`src/renderer/src/components/editors/MdEditor.tsx`:**
- `renderMarkdown` receives the full `CodeMapping[]` instead of just
  `matchedRaws: Set<string>`
- For each matched ref, after the link `<span>`, append a `<pre><code>` block
- Lines are rendered with manual line numbers using CSS counter or explicit
  `<span>` elements
- The target line (`highlightLine`) gets `class="ref-highlight-line"` with a
  distinct background color
- HTML-escape the code lines to prevent XSS

**`src/renderer/src/components/editors/MdEditor.css`:**
- `.ref-code-block` — monospace, small font, dark background, rounded border
- `.ref-code-block .line-number` — right-aligned, muted color
- `.ref-code-block .ref-highlight-line` — accent background (yellow-ish or the
  theme accent color)
- `.ref-link` — keep existing clickable link style

**`src/renderer/src/components/NoteViewport.tsx`:**
- Pass `codeMappings` (instead of just `matchedRaws`) to MdEditor

**`src/renderer/src/types/index.ts`:**
- Add `CodeSnippet` interface
- Extend `CodeMapping` with optional `codeSnippet`

## Syntax Highlighting

No external library. Use a simple regex-based tokenizer for common languages
(C/C++, JavaScript/TypeScript, Python, Go, Rust). Each supported language gets
keyword/string/comment/type highlighting via styled `<span>` classes. The
tokenizer runs in `renderMarkdown` and only on the 21-line snippet — very
lightweight.

## Edge Cases

- **Partial match (no file):** `codeSnippet` is undefined, render as plain
  `@ref` link (current behavior)
- **Ref near file start/end:** lines slice bounded to `[1, totalLines]`
- **File not found:** `codeSnippet` is undefined, gracefully degrade
- **Empty lines in snippet:** rendered as empty `<span>` (keeps line numbering
  intact)
