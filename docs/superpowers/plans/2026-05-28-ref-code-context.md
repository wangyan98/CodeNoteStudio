# @ref Code Context Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show 10 lines of code context (above and below) under each @ref link in the Note Viewport preview.

**Architecture:** Main process `resolveRefs` reads source files and attaches line-range snippets to each `CodeMapping`. The MdEditor `renderMarkdown` function renders these snippets as syntax-highlighted `<pre><code>` blocks under each ref link. Types are extended to carry the snippet data across IPC.

**Tech Stack:** TypeScript, Electron IPC, CSS

---

### Task 1: Add CodeSnippet type and extend CodeMapping

**Files:**
- Modify: `src/renderer/src/types/index.ts`
- Modify: `src/main/services/ref-resolver.ts`

- [ ] **Step 1: Add CodeSnippet interface and extend CodeMapping**

In `src/renderer/src/types/index.ts`, add before the `CodeMapping` interface (before line 22):

```typescript
export interface CodeSnippet {
  lines: string[]
  startLine: number
  highlightLine: number
}
```

Then extend `CodeMapping` to include the optional field:

```typescript
export interface CodeMapping {
  raw: string
  functionName: string
  filePath: string
  startLine: number
  endLine: number
  codeSnippet?: CodeSnippet
}
```

- [ ] **Step 2: Add CodeSnippet to the ref-resolver CodeMapping return type**

In `src/main/services/ref-resolver.ts`, the `CodeMapping` interface is defined at line 10. Add the same optional field:

```typescript
export interface CodeMapping {
  raw: string
  functionName: string
  filePath: string
  startLine: number
  endLine: number
  codeSnippet?: CodeSnippet
}
```

Also add the `CodeSnippet` interface above it (around line 9):

```typescript
export interface CodeSnippet {
  lines: string[]
  startLine: number
  highlightLine: number
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (unused fields are optional, so no issues)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/types/index.ts src/main/services/ref-resolver.ts
git commit -m "feat: add CodeSnippet type and extend CodeMapping"
```

---

### Task 2: Extract code snippets in ref-resolver

**Files:**
- Modify: `src/main/services/ref-resolver.ts`
- Modify: `src/main/ipc-handlers.ts`

- [ ] **Step 1: Add readTextFile import and CONTEXT_LINES constant**

In `src/main/services/ref-resolver.ts`, at the top after the existing import, add the import for `readTextFile`:

```typescript
import { readTextFile } from './file-system'
```

Add the constant after imports:

```typescript
const CONTEXT_LINES = 10
```

- [ ] **Step 2: Add extractCodeSnippet helper function**

In `src/main/services/ref-resolver.ts`, add this function before `resolveRefs`:

```typescript
async function extractCodeSnippet(
  filePath: string,
  targetLine: number
): Promise<CodeSnippet | undefined> {
  try {
    const content = await readTextFile(filePath)
    const allLines = content.split('\n')
    const start = Math.max(1, targetLine - CONTEXT_LINES)
    const end = Math.min(allLines.length, targetLine + CONTEXT_LINES)
    const lines = allLines.slice(start - 1, end)
    return { lines, startLine: start, highlightLine: targetLine }
  } catch {
    return undefined
  }
}
```

- [ ] **Step 3: Call extractCodeSnippet in resolveRefs for each matched symbol**

In `resolveRefs`, after each `mappings.push(toMapping(ref, match))`, add the snippet extraction. Since `toMapping` is synchronous, replace each `mappings.push(toMapping(ref, match))` pattern with async snippet attachment.

The current `resolveRefs` is synchronous — it needs to become async. Modify the function signature and body:

Change the function signature from:
```typescript
export function resolveRefs(
  refs: RefSpec[],
  symbols: CodeSymbol[]
): CodeMapping[] {
```

To:
```typescript
export async function resolveRefs(
  refs: RefSpec[],
  symbols: CodeSymbol[]
): Promise<CodeMapping[]> {
```

And after creating each mapping (where `mappings.push(toMapping(ref, match))` is called), add the snippet:

```typescript
const mapping = toMapping(ref, match)
if (mapping.filePath && mapping.startLine) {
  mapping.codeSnippet = await extractCodeSnippet(mapping.filePath, mapping.startLine)
}
mappings.push(mapping)
```

Replace all 5 `mappings.push(toMapping(ref, match))` calls with this pattern:
```typescript
const mapping = toMapping(ref, match)
if (mapping.filePath && mapping.startLine) {
  mapping.codeSnippet = await extractCodeSnippet(mapping.filePath, mapping.startLine)
}
mappings.push(mapping)
```

- [ ] **Step 4: Update the IPC handler to await resolveRefs**

In `src/main/ipc-handlers.ts`, the `code:resolve-refs` handler (around line 162) calls `resolveRefs(refs, allSymbols)` synchronously. Since `resolveRefs` is now async, add `await`:

```typescript
const mappings = await resolveRefs(refs, allSymbols)
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/main/services/ref-resolver.ts src/main/ipc-handlers.ts
git commit -m "feat: extract code snippets for @ref context in resolveRefs"
```

---

### Task 3: Pass codeMappings through to MdEditor

**Files:**
- Modify: `src/renderer/src/components/NoteViewport.tsx`
- Modify: `src/renderer/src/components/editors/MdEditor.tsx`

- [ ] **Step 1: Update MdEditor props to accept codeMappings**

In `src/renderer/src/components/editors/MdEditor.tsx`, change the `MdEditorProps` interface (line 7) to replace `matchedRaws`:

```typescript
interface MdEditorProps {
  content: string
  notePath: string
  onSave: (content: string) => Promise<void>
  onRefClick?: (refName: string) => void
  codeMappings?: CodeMapping[]
}
```

Add the import for `CodeMapping` from types (add after existing imports):

```typescript
import type { CodeMapping } from '../../types'
```

- [ ] **Step 2: Update MdEditor component destructuring**

Change the component function destructuring (line 20):

```typescript
function MdEditor({ content, notePath, onSave, onRefClick, codeMappings }, ref) {
```

- [ ] **Step 3: Update renderMarkdown call**

The `renderMarkdown` function currently takes `(md, matchedRaws: Set<string>)`. Change it to take `codeMappings` instead. Build the matched raws set from codeMappings inside renderMarkdown:

In the render section (line 84-85), change:

```tsx
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(value, new Set(matchedRaws ?? []))
              }}
```

To:

```tsx
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(value, codeMappings ?? [])
              }}
```

- [ ] **Step 4: Remove matchedRaws state from NoteViewport**

In `src/renderer/src/components/NoteViewport.tsx`, remove the `matchedRaws` state (line 23):

```typescript
// Remove this line:
const [matchedRaws, setMatchedRaws] = useState<string[]>([])
```

And remove references to `setMatchedRaws` (lines 48, 52).

- [ ] **Step 5: Pass codeMappings to MdEditor**

In `src/renderer/src/components/NoteViewport.tsx`, update the MdEditor usage (around line 71-85). Replace `matchedRaws={matchedRaws}` with `codeMappings={codeMappings}`:

```tsx
<MdEditor
  ref={mdEditorRef}
  content={activeNoteContent as string}
  notePath={selectedNoteId}
  codeMappings={codeMappings}
  onSave={async (content: string) => {
    await saveNote(selectedNoteId, content)
  }}
  onRefClick={async (refName: string) => {
    const mappings = await window.electronAPI.resolveRefs(selectedNoteId, `@ref(${refName})`)
    if (mappings.length > 0) {
      navigateToCode(mappings[0].filePath, mappings[0].startLine)
    }
  }}
/>
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/NoteViewport.tsx src/renderer/src/components/editors/MdEditor.tsx
git commit -m "feat: pass codeMappings to MdEditor for code context display"
```

---

### Task 4: Render code snippets in preview with syntax highlighting

**Files:**
- Modify: `src/renderer/src/components/editors/MdEditor.tsx`
- Modify: `src/renderer/src/components/editors/MdEditor.css`

- [ ] **Step 1: Rewrite renderMarkdown to accept CodeMapping[]**

In `src/renderer/src/components/editors/MdEditor.tsx`, change the `renderMarkdown` function signature (line 119):

```typescript
function renderMarkdown(md: string, codeMappings: CodeMapping[]): string {
```

- [ ] **Step 2: Build matchedRaws lookup inside renderMarkdown**

Add at the top of `renderMarkdown`:

```typescript
  const snippetByRaw = new Map<string, CodeSnippet>()
  const matchedRaws = new Set<string>()
  for (const m of codeMappings) {
    matchedRaws.add(m.raw)
    if (m.codeSnippet) {
      snippetByRaw.set(m.raw, m.codeSnippet)
    }
  }
```

- [ ] **Step 3: Replace @ref render logic to include code snippets**

Replace the current @ref replacement logic (lines 126-134, the `html = html.replace(/@ref\(...` block) with:

```typescript
  html = html.replace(
    /@ref\(([a-zA-Z0-9._/\-:]+)\)/g,
    (_fullMatch: string, refBody: string) => {
      if (!matchedRaws.has(refBody)) {
        return `@ref(${refBody})`
      }
      const snippet = snippetByRaw.get(refBody)
      let result = `<span class="ref-link" data-ref-name="${refBody}">@ref(${refBody})</span>`
      if (snippet) {
        result += renderCodeSnippet(snippet)
      }
      return result
    }
  )
```

- [ ] **Step 4: Add renderCodeSnippet and tokenizeLine functions**

Add these functions before `renderMarkdown`:

```typescript
function renderCodeSnippet(snippet: CodeSnippet): string {
  const lines = snippet.lines.map((line, i) => {
    const lineNum = snippet.startLine + i
    const isHighlight = lineNum === snippet.highlightLine
    const cls = isHighlight ? 'ref-code-line ref-highlight-line' : 'ref-code-line'
    const escaped = escapeHtml(line)
    const tokenized = tokenizeLine(escaped)
    return `<span class="${cls}"><span class="line-number">${lineNum}</span>${tokenized}</span>`
  }).join('')
  return `<pre class="ref-code-block"><code>${lines}</code></pre>`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function tokenizeLine(line: string): string {
  return line
    .replace(/(\/\/.*$)/g, '<span class="token-comment">$1</span>')
    .replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, '<span class="token-string">$1</span>')
    .replace(/\b(function|return|if|else|for|while|class|const|let|var|import|export|from|def|async|await|new|try|catch|throw|typedef|struct|enum|static|void|int|float|double|bool|char|public|private|protected|virtual|override|type|interface)\b/g, '<span class="token-keyword">$1</span>')
    .replace(/\b([A-Z][a-zA-Z0-9]*)\b/g, '<span class="token-type">$1</span>')
}
```

- [ ] **Step 5: Fix import — add CodeSnippet import**

At the top of MdEditor.tsx, update the import to include `CodeSnippet`:

```typescript
import type { CodeMapping, CodeSnippet } from '../../types'
```

- [ ] **Step 6: Add CSS for code snippets**

Append to `src/renderer/src/components/editors/MdEditor.css`:

```css
.ref-code-block {
  background: #1e1e1e;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 8px 0;
  margin: 6px 0 12px 0;
  overflow-x: auto;
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.5;
}

.ref-code-block code {
  display: block;
}

.ref-code-line {
  display: block;
  padding: 0 12px;
  white-space: pre;
}

.ref-highlight-line {
  background: rgba(255, 204, 0, 0.12);
  border-left: 3px solid var(--accent-color);
  padding-left: 9px;
}

.line-number {
  display: inline-block;
  width: 32px;
  margin-right: 12px;
  text-align: right;
  color: #6e6e6e;
  user-select: none;
}

.token-keyword {
  color: #569cd6;
}

.token-string {
  color: #ce9178;
}

.token-comment {
  color: #6a9955;
  font-style: italic;
}

.token-type {
  color: #4ec9b0;
}
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/editors/MdEditor.tsx src/renderer/src/components/editors/MdEditor.css
git commit -m "feat: render @ref code context snippets in preview"
```

---

