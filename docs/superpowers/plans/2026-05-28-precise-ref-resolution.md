# Precise @ref Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `@ref()` syntax to support `@ref(file:line:name)` with a 5-tier resolution priority, making code references unambiguous for C++ and other languages with same-named symbols.

**Architecture:** Backend `ref-resolver.ts` gets a new `RefSpec` type and 5-tier `resolveRefs()`. Frontend `renderMarkdown()` receives a set of matched ref raw strings to distinguish clickable links from plain text. The IPC boundary narrows: only matched `CodeMapping[]` crosses to the renderer; unmatched refs stay as plain text.

**Tech Stack:** TypeScript, tree-sitter (existing), vitest (existing)

---

### File Map

| File | Role | Change |
|---|---|---|
| `src/main/services/ref-resolver.ts` | Ref parsing + resolution engine | Major rewrite |
| `src/main/ipc-handlers.ts:156-170` | IPC handler for `code:resolve-refs` | Minor: adapt to new return type |
| `src/renderer/src/components/editors/MdEditor.tsx` | Markdown preview rendering | Pass `matchedRaws` through, update regex |
| `src/renderer/src/components/NoteViewport.tsx` | Orchestrates ref resolution → UI | Extract matched raws, pass to MdEditor |
| `src/renderer/src/services/monaco-completion.ts` | Autocomplete suggestions | File-qualified names for duplicates |
| `src/renderer/src/types/index.ts` | Frontend CodeMapping type | Add `raw` field |
| `tests/main/ref-resolver.test.ts` | Unit tests | New cases for all tiers |

---

### Task 1: Add `raw` field to CodeMapping and RefSpec types

**Files:**
- Modify: `src/main/services/ref-resolver.ts:1-30`
- Modify: `src/renderer/src/types/index.ts:22-27`

- [ ] **Step 1: Add `raw` field to backend `CodeMapping` and define `RefSpec`**

In `src/main/services/ref-resolver.ts`, replace the current `CodeMapping` interface and add `RefSpec`:

```ts
import type { CodeSymbol } from './code-parser'

export interface RefSpec {
  raw: string          // original text inside @ref(...)
  filePath?: string    // classified file segment (contains '/')
  line?: number        // classified line segment (pure digits)
  name?: string        // classified name segment (may include '.' for Class.method)
}

export interface CodeMapping {
  raw: string
  functionName: string
  filePath: string
  startLine: number
  endLine: number
}
```

- [ ] **Step 2: Add `raw` field to frontend `CodeMapping`**

In `src/renderer/src/types/index.ts:22-27`:

```ts
export interface CodeMapping {
  raw: string
  functionName: string
  filePath: string
  startLine: number
  endLine: number
}
```

- [ ] **Step 3: Run tests to verify nothing broke yet**

Run: `npx vitest run tests/main/ref-resolver.test.ts`
Expected: compilation errors because `parseRefs` and `resolveRefs` still use old types

- [ ] **Step 4: Commit**

```bash
git add src/main/services/ref-resolver.ts src/renderer/src/types/index.ts
git commit -m "feat: add RefSpec type and raw field to CodeMapping"
```

---

### Task 2: Rewrite `parseRefs()` to return `RefSpec[]`

**Files:**
- Modify: `src/main/services/ref-resolver.ts` (parseRefs function)

- [ ] **Step 1: Write failing tests for the new parseRefs**

In `tests/main/ref-resolver.test.ts`, replace the existing `parseRefs` describe block:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { parseRefs, resolveRefs, RefSpec } from '../../src/main/services/ref-resolver'
import type { CodeSymbol } from '../../src/main/services/code-parser'

describe('parseRefs', () => {
  it('parses @ref(name) as name-only', () => {
    const refs = parseRefs('see @ref(main) here')
    expect(refs).toEqual([{ raw: 'main', name: 'main' }])
  })

  it('parses @ref(file:line:name) with all segments', () => {
    const refs = parseRefs('see @ref(src/utils.cpp:42:MyClass.getValue) here')
    expect(refs).toEqual([{
      raw: 'src/utils.cpp:42:MyClass.getValue',
      filePath: 'src/utils.cpp',
      line: 42,
      name: 'MyClass.getValue'
    }])
  })

  it('parses @ref(file:line) with file and line', () => {
    const refs = parseRefs('see @ref(src/utils.cpp:42) here')
    expect(refs).toEqual([{
      raw: 'src/utils.cpp:42',
      filePath: 'src/utils.cpp',
      line: 42
    }])
  })

  it('parses @ref(file:name) with file and name', () => {
    const refs = parseRefs('see @ref(src/utils.cpp:parse) here')
    expect(refs).toEqual([{
      raw: 'src/utils.cpp:parse',
      filePath: 'src/utils.cpp',
      name: 'parse'
    }])
  })

  it('parses @ref(Class.method) as name-only with dot', () => {
    const refs = parseRefs('see @ref(MyClass.getValue) here')
    expect(refs).toEqual([{ raw: 'MyClass.getValue', name: 'MyClass.getValue' }])
  })

  it('returns empty array for no refs', () => {
    expect(parseRefs('just text')).toEqual([])
    expect(parseRefs('')).toEqual([])
  })

  it('extracts multiple refs from markdown', () => {
    const content = '# Arch\n\nSee @ref(main) and @ref(src/api.ts:10:fetchData).'
    const refs = parseRefs(content)
    expect(refs).toHaveLength(2)
    expect(refs[0]).toEqual({ raw: 'main', name: 'main' })
    expect(refs[1]).toEqual({
      raw: 'src/api.ts:10:fetchData',
      filePath: 'src/api.ts',
      line: 10,
      name: 'fetchData'
    })
  })

  it('extracts @ref from JSON content', () => {
    const content = JSON.stringify({
      root: { title: 'Auth', content: 'See @ref(src/login.cpp:42) for impl' }
    })
    const refs = parseRefs(content)
    expect(refs).toEqual([{
      raw: 'src/login.cpp:42',
      filePath: 'src/login.cpp',
      line: 42
    }])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/main/ref-resolver.test.ts`
Expected: FAIL because `parseRefs` still returns `string[]`

- [ ] **Step 3: Implement the new `parseRefs()`**

In `src/main/services/ref-resolver.ts`, replace the current `parseRefs`:

```ts
/**
 * Extract @ref(...) references from text content and classify each
 * colon-separated segment as filePath, line, or name.
 */
export function parseRefs(content: string): RefSpec[] {
  if (!content) return []

  const refs: RefSpec[] = []
  const seen = new Set<string>()

  // Match @ref(...) — allow / : . digits letters underscores hyphens inside parens
  const regex = /@ref\(([a-zA-Z0-9._/\-:]+)\)/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    const raw = match[1]
    if (seen.has(raw)) continue
    seen.add(raw)

    const spec = classifyRef(raw)
    refs.push(spec)
  }

  return refs
}

function classifyRef(raw: string): RefSpec {
  const parts = raw.split(':')

  let filePath: string | undefined
  let line: number | undefined
  let name: string | undefined

  for (const part of parts) {
    if (part.includes('/')) {
      filePath = part
    } else if (/^\d+$/.test(part)) {
      line = parseInt(part, 10)
    } else {
      name = part
    }
  }

  return { raw, filePath, line, name }
}
```

Export `RefSpec` type from the file (add `export` to the interface).

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/main/ref-resolver.test.ts`
Expected: parseRefs tests PASS, resolveRefs tests FAIL (still uses old types)

- [ ] **Step 5: Commit**

```bash
git add src/main/services/ref-resolver.ts tests/main/ref-resolver.test.ts
git commit -m "feat: rewrite parseRefs to return RefSpec with file/line/name classification"
```

---

### Task 3: Rewrite `resolveRefs()` with 5-tier priority

**Files:**
- Modify: `src/main/services/ref-resolver.ts` (resolveRefs function)

- [ ] **Step 1: Update mock symbols in tests for new resolveRefs**

In `tests/main/ref-resolver.test.ts`, replace the `resolveRefs` describe block:

```ts
describe('resolveRefs', () => {
  const mockSymbols: CodeSymbol[] = [
    {
      name: 'main',
      kind: 'function',
      filePath: 'src/index.ts',
      startLine: 1,
      endLine: 10,
      startColumn: 1,
      endColumn: 1
    },
    {
      name: 'fetchData',
      kind: 'function',
      filePath: 'src/api.ts',
      startLine: 10,
      endLine: 20,
      startColumn: 1,
      endColumn: 1
    },
    {
      name: 'getValue',
      kind: 'method',
      filePath: 'src/api.ts',
      startLine: 25,
      endLine: 27,
      startColumn: 3,
      endColumn: 3,
      parentName: 'MyClass'
    },
    // Same-named function in different file — the disambiguation case
    {
      name: 'parse',
      kind: 'function',
      filePath: 'src/utils.cpp',
      startLine: 42,
      endLine: 56,
      startColumn: 1,
      endColumn: 1
    },
    {
      name: 'parse',
      kind: 'function',
      filePath: 'src/parser.cpp',
      startLine: 100,
      endLine: 130,
      startColumn: 1,
      endColumn: 1
    }
  ]

  // Tier 1: file + line + name
  it('T1: resolves @ref(file:line:name) to exact symbol', () => {
    const refs: RefSpec[] = [
      { raw: 'src/utils.cpp:42:parse', filePath: 'src/utils.cpp', line: 42, name: 'parse' }
    ]
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].raw).toBe('src/utils.cpp:42:parse')
    expect(mappings[0].filePath).toBe('src/utils.cpp')
    expect(mappings[0].startLine).toBe(42)
  })

  // Tier 1: file+line+name with Class.method name
  it('T1: resolves @ref(file:line:Class.method)', () => {
    const refs: RefSpec[] = [
      { raw: 'src/api.ts:25:MyClass.getValue', filePath: 'src/api.ts', line: 25, name: 'MyClass.getValue' }
    ]
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].functionName).toBe('MyClass.getValue')
    expect(mappings[0].filePath).toBe('src/api.ts')
  })

  // Tier 2: file + line
  it('T2: resolves @ref(file:line) to symbol at that line', () => {
    const refs: RefSpec[] = [
      { raw: 'src/utils.cpp:42', filePath: 'src/utils.cpp', line: 42 }
    ]
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].functionName).toBe('parse')  // parse lives at src/utils.cpp:42-56
  })

  // Tier 2: file+line with no symbol at that line → no match
  it('T2: returns empty for @ref(file:line) with no symbol at that line', () => {
    const refs: RefSpec[] = [
      { raw: 'src/utils.cpp:999', filePath: 'src/utils.cpp', line: 999 }
    ]
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(0)
  })

  // Tier 3: file + name
  it('T3: resolves @ref(file:name) to named symbol in file', () => {
    const refs: RefSpec[] = [
      { raw: 'src/parser.cpp:parse', filePath: 'src/parser.cpp', name: 'parse' }
    ]
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].filePath).toBe('src/parser.cpp')
    expect(mappings[0].startLine).toBe(100)
  })

  // Tier 3: file+name with Class.method in file
  it('T3: resolves @ref(file:Class.method) within file', () => {
    const refs: RefSpec[] = [
      { raw: 'src/api.ts:MyClass.getValue', filePath: 'src/api.ts', name: 'MyClass.getValue' }
    ]
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].functionName).toBe('MyClass.getValue')
    expect(mappings[0].filePath).toBe('src/api.ts')
  })

  // Tier 3: file+name with no match
  it('T3: returns empty for @ref(file:name) with no match', () => {
    const refs: RefSpec[] = [
      { raw: 'src/api.ts:nonexistent', filePath: 'src/api.ts', name: 'nonexistent' }
    ]
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(0)
  })

  // Tier 4: Class.method across all files
  it('T4: resolves @ref(Class.method) across all files', () => {
    const refs: RefSpec[] = [
      { raw: 'MyClass.getValue', name: 'MyClass.getValue' }
    ]
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].functionName).toBe('MyClass.getValue')
    expect(mappings[0].filePath).toBe('src/api.ts')
  })

  // Tier 5: name only across all files (first match by line order)
  it('T5: resolves @ref(name) to first matching symbol', () => {
    const refs: RefSpec[] = [
      { raw: 'main', name: 'main' }
    ]
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].functionName).toBe('main')
  })

  // Tier 5: duplicate name returns first by line order
  it('T5: resolves duplicate name to first match', () => {
    const refs: RefSpec[] = [
      { raw: 'parse', name: 'parse' }
    ]
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    // Both 'parse' symbols exist; first by line order is utils.cpp:42 (sorted by file then line)
  })

  // Tier 6: no match at all
  it('returns empty for completely unmatched ref', () => {
    const refs: RefSpec[] = [
      { raw: 'nonexistent', name: 'nonexistent' }
    ]
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(0)
  })

  // Fallthrough: T1 fails file+line+name match, falls to T2 (file+line)
  it('falls through T1→T2 when file+line+name line mismatch but file+line matches', () => {
    const refs: RefSpec[] = [
      { raw: 'src/utils.cpp:50:wrongName', filePath: 'src/utils.cpp', line: 50, name: 'wrongName' }
    ]
    const mappings = resolveRefs(refs, mockSymbols)
    // T1: no symbol named 'wrongName' at line 50 → fall through
    // T2: line 50 falls within parse's range (42-56) → match
    expect(mappings).toHaveLength(1)
    expect(mappings[0].functionName).toBe('parse')
  })

  // Mixed: some match, some don't
  it('handles mixed matched/unmatched refs', () => {
    const refs: RefSpec[] = [
      { raw: 'main', name: 'main' },
      { raw: 'nonexistent', name: 'nonexistent' }
    ]
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].raw).toBe('main')
  })

  // Backward compat: Class.method in old format
  it('resolves old-style Class.method format', () => {
    const refs: RefSpec[] = [
      { raw: 'MyClass.getValue', name: 'MyClass.getValue' }
    ]
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0]).toMatchObject({
      functionName: 'MyClass.getValue',
      filePath: 'src/api.ts',
      startLine: 25,
      endLine: 27
    })
  })

  it('returns empty for empty refs', () => {
    expect(resolveRefs([], mockSymbols)).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/main/ref-resolver.test.ts`
Expected: resolveRefs tests FAIL because the function still uses old logic

- [ ] **Step 3: Implement the new 5-tier `resolveRefs()`**

In `src/main/services/ref-resolver.ts`, replace the current `resolveRefs` and helpers:

```ts
/**
 * Resolve RefSpecs to CodeMapping objects using a 5-tier priority.
 * Only matched refs are returned. Unmatched refs are silently dropped.
 */
export function resolveRefs(
  refs: RefSpec[],
  symbols: CodeSymbol[],
  previousMappings: CodeMapping[] = []
): CodeMapping[] {
  const mappings: CodeMapping[] = []

  // Build lookup: filePath -> symbols for efficient file-scoped searches
  const symbolsByFile = new Map<string, CodeSymbol[]>()
  for (const s of symbols) {
    const list = symbolsByFile.get(s.filePath)
    if (list) {
      list.push(s)
    } else {
      symbolsByFile.set(s.filePath, [s])
    }
  }

  // Index previous mappings by ref name for the cached tier
  const prevByName = new Map<string, CodeMapping>()
  for (const pm of previousMappings) {
    if (!prevByName.has(pm.functionName)) {
      prevByName.set(pm.functionName, pm)
    }
  }

  for (const ref of refs) {
    // --- Tier 1: file + line + name ---
    if (ref.filePath && ref.line !== undefined && ref.name) {
      const fileSymbols = symbolsByFile.get(ref.filePath)
      if (fileSymbols) {
        const match = fileSymbols.find(
          (s) =>
            s.startLine <= ref.line! &&
            s.endLine >= ref.line! &&
            symbolMatchesName(s, ref.name!)
        )
        if (match) {
          mappings.push(toMapping(ref, match))
          continue
        }
      }
    }

    // --- Tier 2: file + line ---
    if (ref.filePath && ref.line !== undefined) {
      const fileSymbols = symbolsByFile.get(ref.filePath)
      if (fileSymbols) {
        const match = fileSymbols.find(
          (s) => s.startLine <= ref.line! && s.endLine >= ref.line!
        )
        if (match) {
          mappings.push(toMapping(ref, match))
          continue
        }
      }
    }

    // --- Tier 3: file + name ---
    if (ref.filePath && ref.name) {
      const fileSymbols = symbolsByFile.get(ref.filePath)
      if (fileSymbols) {
        const match = findSymbolByName(fileSymbols, ref.name)
        if (match) {
          mappings.push(toMapping(ref, match))
          continue
        }
      }
    }

    // --- Tier 4: Class.method (name with dot, across all files) ---
    if (ref.name && ref.name.includes('.')) {
      const match = findSymbolByName(symbols, ref.name)
      if (match) {
        mappings.push(toMapping(ref, match))
        continue
      }
    }

    // --- Tier 5: name only (first match across all files) ---
    if (ref.name) {
      const match = symbols.find((s) => s.name === ref.name)
      if (match) {
        mappings.push(toMapping(ref, match))
        continue
      }
    }

    // --- Tier 6: no match — silently drop ---
  }

  return mappings
}

/**
 * Check if a symbol matches a ref name, supporting both
 * direct name match and Class.method resolution.
 */
function symbolMatchesName(sym: CodeSymbol, refName: string): boolean {
  if (sym.name === refName) return true

  // Try Class.method: split refName by last dot
  const lastDot = refName.lastIndexOf('.')
  if (lastDot > 0) {
    const className = refName.slice(0, lastDot)
    const methodName = refName.slice(lastDot + 1)
    return sym.name === methodName && sym.parentName === className
  }

  return false
}

/**
 * Find a symbol by name in a list, trying direct match first,
 * then Class.method resolution.
 */
function findSymbolByName(symbols: CodeSymbol[], refName: string): CodeSymbol | undefined {
  const direct = symbols.find((s) => s.name === refName)
  if (direct) return direct

  const lastDot = refName.lastIndexOf('.')
  if (lastDot > 0) {
    const className = refName.slice(0, lastDot)
    const methodName = refName.slice(lastDot + 1)
    return symbols.find(
      (s) => s.name === methodName && s.parentName === className
    )
  }

  return undefined
}

function toMapping(ref: RefSpec, sym: CodeSymbol): CodeMapping {
  // For Class.method refs, use the ref name (more descriptive).
  // Otherwise use the symbol name — important for fallthrough
  // (e.g. T1→T2 where ref.name is wrong but file+line matched).
  let displayName: string
  if (ref.name && ref.name.includes('.')) {
    displayName = ref.name
  } else {
    displayName = sym.name
  }
  return {
    raw: ref.raw,
    functionName: displayName,
    filePath: sym.filePath,
    startLine: sym.startLine,
    endLine: sym.endLine
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/main/ref-resolver.test.ts`
Expected: ALL tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/ref-resolver.ts tests/main/ref-resolver.test.ts
git commit -m "feat: implement 5-tier resolveRefs for precise @ref matching"
```

---

### Task 4: Update IPC handler to adapt to new types

**Files:**
- Modify: `src/main/ipc-handlers.ts:156-170`

- [ ] **Step 1: Update the `code:resolve-refs` handler**

In `src/main/ipc-handlers.ts`, the handler already calls `parseRefs` → `resolveRefs`. The types now flow correctly since `resolveRefs` still returns `CodeMapping[]` (just with an added `raw` field). No logic change needed — the handler passes through.

However, `refs.length === 0` check still works (RefSpec[] has `.length`). No change needed to the handler body.

The `CodeMapping` type used in the IPC return now includes `raw`. Verify the import matches.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.node.json 2>&1 | head -20`
Expected: no errors related to ref-resolver or ipc-handlers

- [ ] **Step 3: Run all main-process tests**

Run: `npx vitest run tests/main/`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc-handlers.ts
git commit -m "chore: verify IPC handler works with new RefSpec types"
```

---

### Task 5: Update `renderMarkdown()` to distinguish matched vs unmatched refs

**Files:**
- Modify: `src/renderer/src/components/editors/MdEditor.tsx:7-145`

- [ ] **Step 1: Add `matchedRaws` prop to MdEditor and wire into `renderMarkdown()`**

In `src/renderer/src/components/editors/MdEditor.tsx`, update the component:

```tsx
interface MdEditorProps {
  content: string
  notePath: string
  onSave: (content: string) => Promise<void>
  onRefClick?: (refName: string) => void
  matchedRaws?: string[]   // raw ref strings that resolved successfully
}
```

Update `renderMarkdown` signature and the @ref replacement:

```ts
function renderMarkdown(md: string, matchedRaws: Set<string>): string {
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Convert @ref(...) — handle all colon-separated formats
  html = html.replace(
    /@ref\(([a-zA-Z0-9._/\-:]+)\)/g,
    (_fullMatch, refBody: string) => {
      if (matchedRaws.has(refBody)) {
        return `<span class="ref-link" data-ref-name="${refBody}">@ref(${refBody})</span>`
      }
      // Unmatched: render as plain text
      return `@ref(${refBody})`
    }
  )

  // ... rest of markdown rendering unchanged ...
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  html = html.replace(/\n\n/g, '</p><p>')
  html = '<p>' + html + '</p>'
  html = html.replace(/<p>\s*<\/p>/g, '')

  return html
}
```

In the JSX, update the preview div to pass `matchedRaws`:

```tsx
<div
  className="md-preview-content"
  dangerouslySetInnerHTML={{
    __html: renderMarkdown(value, new Set(matchedRaws ?? []))
  }}
  onClick={(e) => {
    const target = (e.target as HTMLElement).closest('.ref-link') as HTMLElement | null
    if (target) {
      const refName = target.getAttribute('data-ref-name')
      if (refName) onRefClick?.(refName)
    }
  }}
/>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.web.json 2>&1 | head -20`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/editors/MdEditor.tsx
git commit -m "feat: render unmatched @ref as plain text in markdown preview"
```

---

### Task 6: Wire `matchedRaws` through NoteViewport to MdEditor

**Files:**
- Modify: `src/renderer/src/components/NoteViewport.tsx`

- [ ] **Step 1: Extract matched raw strings from resolved mappings and pass to MdEditor**

In `src/renderer/src/components/NoteViewport.tsx`, update the `useEffect` and the `MdEditor` usage:

```tsx
const [matchedRaws, setMatchedRaws] = useState<string[]>([])

useEffect(() => {
  if (!activeNoteContent || !selectedNoteId) {
    setCodeMappings([])
    setMatchedRaws([])
    return
  }
  const contentStr = typeof activeNoteContent === 'string'
    ? activeNoteContent
    : JSON.stringify(activeNoteContent)
  window.electronAPI.resolveRefs(selectedNoteId, contentStr)
    .then((mappings: CodeMapping[]) => {
      setCodeMappings(mappings)
      setMatchedRaws(mappings.map((m) => m.raw))
    })
    .catch(() => {
      setCodeMappings([])
      setMatchedRaws([])
    })
}, [activeNoteContent, selectedNoteId])
```

In the `renderEditor` function, pass `matchedRaws` to MdEditor:

```tsx
case 'md':
  return (
    <MdEditor
      ref={mdEditorRef}
      content={activeNoteContent as string}
      notePath={selectedNoteId}
      matchedRaws={matchedRaws}
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
  )
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.web.json 2>&1 | head -20`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/NoteViewport.tsx
git commit -m "feat: pass matchedRaws from NoteViewport to MdEditor for conditional rendering"
```

---

### Task 7: Update Monaco autocomplete for file-qualified suggestions

**Files:**
- Modify: `src/renderer/src/services/monaco-completion.ts`

- [ ] **Step 1: Add file-qualified name suggestions for duplicate symbols**

In `src/renderer/src/services/monaco-completion.ts`, update `provideCompletionItems` to detect duplicate names and add file-qualified entries:

```ts
async provideCompletionItems(model, position) {
  const lineContent = model.getLineContent(position.lineNumber)
  const textBeforeCursor = lineContent.substring(0, position.column - 1)

  const refMatch = textBeforeCursor.match(/@ref\(([a-zA-Z0-9._/\-:]*)$/)
  if (!refMatch) return { suggestions: [] }

  const partialName = refMatch[1] || ''

  try {
    const symbols = await window.electronAPI.querySymbols(
      partialName || undefined,
      undefined,
      undefined
    )

    // Detect names that appear in multiple files
    const nameFileCount = new Map<string, number>()
    for (const sym of symbols) {
      nameFileCount.set(sym.name, (nameFileCount.get(sym.name) || 0) + 1)
    }
    const duplicateNames = new Set(
      [...nameFileCount.entries()]
        .filter(([, count]) => count > 1)
        .map(([name]) => name)
    )

    const suggestions: monaco.languages.CompletionItem[] = []

    for (const sym of symbols) {
      const fileName = sym.filePath.split('/').pop() || sym.filePath

      // For duplicate names, add file-qualified suggestion
      if (duplicateNames.has(sym.name)) {
        suggestions.push({
          label: `${sym.filePath}:${sym.name}`,
          kind: mapKind(sym.kind),
          detail: `${sym.kind} · ${fileName}:${sym.startLine}`,
          insertText: `${sym.filePath}:${sym.name}`,
          range: {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: position.column - partialName.length,
            endColumn: position.column
          },
          sortText: partialName
            ? (sym.name.startsWith(partialName) ? '0' : '1') + sym.name
            : sym.name
        })
      }

      // Always include the plain name suggestion
      suggestions.push({
        label: sym.name,
        kind: mapKind(sym.kind),
        detail: `${sym.kind} · ${fileName}:${sym.startLine}`,
        insertText: sym.name,
        range: {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column - partialName.length,
          endColumn: position.column
        },
        sortText: partialName
          ? (sym.name.startsWith(partialName) ? '0' : '1') + sym.name
          : sym.name
      })
    }

    return { suggestions }
  } catch {
    return { suggestions: [] }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.web.json 2>&1 | head -20`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/services/monaco-completion.ts
git commit -m "feat: add file-qualified autocomplete for duplicate symbol names"
```

---

### Task 8: Run full test suite and verify

**Files:**
- (no changes, verification only)

- [ ] **Step 1: Run all main-process tests**

Run: `npx vitest run tests/main/`
Expected: ALL PASS (ref-resolver tests + any other main tests)

- [ ] **Step 2: Run TypeScript type checking across all configs**

Run: `npx tsc --noEmit -p tsconfig.node.json 2>&1 && npx tsc --noEmit -p tsconfig.web.json 2>&1`
Expected: no errors in either config

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: full test suite passes after precise @ref changes"
```
