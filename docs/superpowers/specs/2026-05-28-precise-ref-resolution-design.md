# Precise @ref Resolution

**Date**: 2026-05-28
**Status**: approved

## Problem

The current `@ref(name)` resolution uses `symbols.find(s => s.name === refName)` — a first-match-wins approach. For C++ (and any language with same-named symbols in different files), this is ambiguous: two functions named `parse` in different files can't be disambiguated.

## Design

### Syntax

```
@ref(file:line:name)
```

All three segments are optional. The resolver classifies each `:`-separated segment:

| Segment | Classifier |
|---|---|
| Contains `/` | file path |
| Pure digits | line number |
| Everything else | symbol name (may include `.` for Class.method) |

Examples:

```
@ref(src/utils.cpp:42:MyClass.getValue)   → file + line + name
@ref(src/utils.cpp:42)                    → file + line
@ref(src/utils.cpp:parse)                 → file + name
@ref(MyClass.getValue)                    → Class.method name
@ref(main)                                → simple name
```

File paths are always full relative paths from the repo root.

### Resolution Priority

Each tier falls through to the next if no match is found:

1. **file + line + name** — find symbol in `file` whose line range contains `line` AND whose name matches `name`
2. **file + line** — find symbol in `file` whose line range contains `line`
3. **file + name** — find symbol with `name` in `file` (Class.method resolution within file)
4. **Class.method** — split by last `.`, match `parentName` + `name` across all files
5. **name only** — match by `name` across all symbols
6. **No match** — drop; `@ref(...)` renders as plain text, not a link

### Output

- **Matched ref** → clickable `.ref-link` span in Markdown preview, shown in CodeMappingsPanel
- **Unmatched ref** → plain text in preview (the raw `@ref(...)` string), not in CodeMappingsPanel

## Code Changes

### `src/main/services/ref-resolver.ts`

**RefSpec type** (new):
```ts
interface RefSpec {
  raw: string          // original text inside @ref(...)
  filePath?: string    // classified file segment
  line?: number        // classified line segment
  name?: string        // classified name segment
}
```

**`parseRefs()`** — returns `RefSpec[]` instead of `string[]`. Regex captures the full `@ref(...)` body, then `:`-split + classify each segment.

**`resolveRefs()`** — implements the 5-tier priority. Accepts `RefSpec[]` instead of `string[]`. Returns `(CodeMapping | null)[]` where null entries are unmatched refs.

### `src/renderer/src/components/editors/MdEditor.tsx`

**`renderMarkdown()`** — update regex to recognize the widened `@ref()` syntax. Matched refs render as `<span class="ref-link">`. Unmatched refs render as plain text `<span>` (no `ref-link` class, no `data-ref-name`).

### `src/renderer/src/services/monaco-completion.ts`

**Autocomplete** — for symbols whose name appears in multiple files, show file-qualified suggestions (e.g., `src/utils.cpp:parse`) alongside the bare name. The detail line already shows `file:line`.

### `tests/main/ref-resolver.test.ts`

New test cases:
- `@ref(file:line:name)` → resolves to exact symbol
- `@ref(file:line)` → resolves to symbol at that line
- `@ref(file:name)` → resolves to named symbol in that file
- `@ref(file:name)` with no match → returns null
- `@ref(name)` with duplicates → returns first match (by line order)
- `@ref(nonexistent)` → returns null
- Ambiguous names with file qualifier → resolves unambiguously
- `@ref(file:name)` falls through to Class.method within file

## Behavior Notes

- **Partial matches don't cross tiers.** If `@ref(file:line:name)` has a matching file but no symbol at that line with that name, it falls to tier 2 (file+line), not to a loose name match in a different file.
- **File matching is full-path exact match.** The ref's filePath must exactly equal the symbol's filePath (relative from repo root). `src/utils.cpp:parse` matches a symbol in `src/utils.cpp`.
- **Backward compatible.** Existing `@ref(name)` and `@ref(Class.method)` continue to work.
- **Ref cache** (`.refs.json`) continues to store resolved CodeMappings for persistence across restarts. Unmatched refs are not cached.
