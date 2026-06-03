# Code Mapping for All Note Types

## Summary

Add `@ref(...)` code mapping support to all 4 note types (net, seq, mind, derive),
with a unified UX: picker-based symbol selection, single codeMapping per node/step,
double-click + icon click to navigate to code in CodeViewport.

## Data Model Changes

### MindMapNode — add field

```ts
// note-types.ts
export interface MindMapNode {
  // ... existing fields
  codeMapping?: CodeMapping   // NEW
}
```

### DerivationNode — change from array to single

```ts
// Before:
codeMappings: CodeMapping[]

// After:
codeMapping?: CodeMapping
```

### GraphNode — no change (already has `codeMapping?: CodeMapping`)

## Shared Component: CodeMappingField

Extract a reusable `CodeMappingField` component used by NetworkPanel, NodeEditPanel,
and DerivationEditor. Props:

```ts
interface CodeMappingFieldProps {
  codeMapping: CodeMapping | null | undefined
  onChange: (raw: string) => void      // called when user types/pastes @ref text
  onClear: () => void                   // called to remove codeMapping
  onNavigateToCode?: (filePath: string, line: number) => void
}
```

Renders:
- Text input showing `codeMapping.raw` (the `@ref(...)` text)
- A "..." button that opens SymbolPicker inline
- When resolved: `file:line → functionName` as a clickable link
- When SymbolPicker selects a symbol: constructs `@ref(repo:relPath:line:name)`,
  fires change, and triggers `code:resolve-refs` IPC to resolve it

## Per-Type Implementation

### 1. net.json (Network)

**NetworkPanel** — replace current manual Code Mapping input with `CodeMappingField`.

**NetworkCanvas** —
- Replace blue dot indicator with a clickable jump icon (e.g. `→` or link icon)
  positioned at top-right of the node rect
- Icon click: `navigateToCode(mapping.filePath, mapping.startLine)`
- Double-click on node: if `codeMapping` exists, navigate to code

**CodeViewport Symbols integration** —
- `symbol-insert` CustomEvent carries `{ refText: string }`
- NetworkEditor listens: if `selectedNode.kind === 'layer'`, calls
  `handleResolveRef(refText)`

### 2. seq.mermaid (Sequence)

**SequenceDiagramViewer** — new prop `onNavigateToCode`. After mermaid renders SVG:
- Scan SVG text content for `@ref(xxx)` with regex
- Replace matched text nodes with clickable `<a>` elements styled as blue underline
- On click, call `code:resolve-refs` IPC, then `navigateToCode`

**SequenceEditor** — accept `onNavigateToCode` prop, pass to `SequenceDiagramViewer`.

### 3. mind.json (MindMap)

**mindMapReducer** —
- Add `UPDATE_CODE_MAPPING` action:
  ```ts
  { type: 'UPDATE_CODE_MAPPING', nodeId: string, codeMapping: CodeMapping | null }
  ```
- `cloneNode` already spreads `...node` so `codeMapping` is preserved automatically

**NodeEditPanel** — add `CodeMappingField` section below the Monaco editor.

**MindMapCanvas** —
- Render a jump icon (▶ or link icon) on the right side of nodes that have codeMapping
- Icon click: navigate to code
- Double-click on node: if codeMapping exists, navigate to code (in addition to existing
  inline-edit behavior)

**CodeViewport Symbols** — same `symbol-insert` CustomEvent. MindMapEditor listens,
attaches to selected node.

### 4. derive.json (Derivation)

**derivationReducer** —
- Change `UPDATE_NODE` to support `codeMapping` field
- Update `cloneDoc` to handle single `codeMapping` instead of `codeMappings` array

**DerivationEditor** —
- Add `selectedStepId` state (matching the pattern of other editors)
- Add `CodeMappingField` to each step card, below the content textarea, visible only
  when that step is selected
- Click on a step card sets `selectedStepId`; clicking elsewhere clears it

**CodeViewport Symbols** — same `symbol-insert` pattern. Attaches to `selectedStepId`.

## CustomEvent Protocol

```ts
// CodeViewport SymbolPicker fires:
window.dispatchEvent(new CustomEvent('symbol-insert', {
  detail: { refText: '@ref(Nilou-main:Engine/.../Array.h:139:rbegin)' }
}))

// Each editor listens:
window.addEventListener('symbol-insert', (e: CustomEvent) => {
  const refText = e.detail.refText
  if (hasSelectedNode) handleResolveRef(refText)
})
```

Editors silently ignore the event when no node/step is selected.

## Navigation Flow

```
Node double-click / icon click
  → read node.codeMapping
  → useCodeNavigation().navigateToCode(filePath, startLine)
  → dispatch OPEN_CODE_FILE + SET_PENDING_SCROLL
  → CodeViewport opens file, scrolls to line
```

## Files Touched

| File | Change |
|------|--------|
| `src/main/schemas/note-types.ts` | MindMapNode + codeMapping, DerivationNode codeMappings→codeMapping |
| `src/renderer/src/components/CodeMappingField.tsx` | NEW shared component |
| `src/renderer/src/components/CodeMappingField.css` | NEW styles |
| `src/renderer/src/components/editors/NetworkPanel.tsx` | Use CodeMappingField |
| `src/renderer/src/components/editors/NetworkCanvas.tsx` | Jump icon + double-click nav |
| `src/renderer/src/components/editors/NetworkEditor.tsx` | Listen to symbol-insert event |
| `src/renderer/src/components/editors/SequenceDiagramViewer.tsx` | @ref parsing + clickable links |
| `src/renderer/src/components/editors/SequenceEditor.tsx` | Pass onNavigateToCode |
| `src/renderer/src/components/editors/mindMapReducer.ts` | UPDATE_CODE_MAPPING action |
| `src/renderer/src/components/editors/NodeEditPanel.tsx` | Add CodeMappingField |
| `src/renderer/src/components/editors/MindMapCanvas.tsx` | Jump icon + double-click nav |
| `src/renderer/src/components/editors/MindMapEditor.tsx` | Listen to symbol-insert event |
| `src/renderer/src/components/editors/derivationReducer.ts` | codeMappings→codeMapping |
| `src/renderer/src/components/editors/DerivationEditor.tsx` | Add CodeMappingField per step, listen to symbol-insert |
| `src/renderer/src/components/CodeViewport.tsx` | No change (symbol-insert event already fires) |

## Constraints

- One codeMapping per node/step (not an array)
- @ref syntax: `@ref([repo:]filePath:line[:name])`
- Code repo must be indexed for symbol resolution to work
- If resolution fails, raw @ref text is still stored; navigation won't work until resolved
