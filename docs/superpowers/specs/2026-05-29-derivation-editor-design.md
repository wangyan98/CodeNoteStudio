# Derivation Editor Design

## Problem

`derive.json` files cannot be modified. The `DerivationRenderer` is a read-only display component — no inputs, no edit handlers, no `onSave` callback. The backend (save/update/IPC) fully supports derive documents, but no editor component exists on the frontend.

## Solution

Build a `DerivationEditor` component following the same architecture as `MindMapEditor`, with always-editable nodes, a mini DAG preview, drag reorder, and auto-save.

## Component Architecture

```
src/renderer/src/components/editors/
├── DerivationEditor.tsx        (new — main editor component)
├── DerivationEditor.css        (new — styles)
├── DerivationRenderer.tsx      (existing — read-only renderer, unchanged)
├── DerivationRenderer.css      (existing — unchanged)
└── derivationReducer.ts        (new — reducer for all mutations)
```

Component tree:
```
DerivationEditor
├── MiniDagPreview          ← CSS flexbox mini graph showing node relationships
├── NodeList                ← scrollable list of derivation steps
│   └── DerivationNodeCard  ← individual node (repeated)
│       ├── Step number badge (draggable handle)
│       ├── Title input
│       ├── Content textarea with live KaTeX preview
│       ├── "Derives from" dropdown
│       ├── Code references / @ref badges
│       └── Delete button
├── AddNodeButton           ← at bottom + inline between nodes
└── SaveStatus              ← "Saved" / "Saving..." / "Unsaved" indicator
```

## Data Flow & State Management

### Reducer Actions (derivationReducer.ts)

```typescript
type DerivationAction =
  | { type: 'SET_NODES'; nodes: DerivationNode[] }
  | { type: 'UPDATE_NODE'; id: string; field: 'title' | 'content'; value: string }
  | { type: 'SET_DERIVES_FROM'; nodeId: string; parentId: string | null }
  | { type: 'ADD_NODE'; afterStepNumber: number }
  | { type: 'DELETE_NODE'; id: string }
  | { type: 'REORDER_NODES'; fromIndex: number; toIndex: number }
```

### Auto-save Flow

User types → dispatch(UPDATE_NODE) → state updated → KaTeX re-renders → 300ms debounce → onSave(document) → electronAPI.updateNote(...) → SaveStatus "Saved"

### Data Integrity Rules

- `derivesFrom` must reference an existing node (or null for root nodes)
- Deleting a node clears `derivesFrom` on any children that referenced it
- Cannot create circular references (dropdown filters out descendants)
- Step numbers auto-recalculated after add, delete, or reorder

## Mini DAG Preview

- CSS flexbox layout (no SVG/canvas dependency)
- Each node shown as a pill: `[N. Title]`
- Arrows (→ ↘ ↙) connect parents to children
- Branching: children span across rows with diagonal connectors
- Clicking a pill scrolls to that node in the list

## Node Card Layout

Each node card contains:
- **Step number badge** (circle) — also the drag handle
- **Title input** — single-line, always visible
- **"Derives from" dropdown** — lists all other nodes, filtered to prevent cycles
- **Delete button** (✕)
- **Content textarea** — multi-line, monospace, for LaTeX formulas
- **Live KaTeX preview** — re-renders on keystroke, 150ms debounce

## Drag Reorder

- Drag handle: step number badge
- On drag over: insertion line appears between nodes
- On drop: REORDER_NODES → step numbers recalculated → auto-save
- Children relationships survive reorder (only position changes)

## Inline Insertion

- "+" button appears between nodes on hover (dashed circle)
- "+ Add Step" button fixed at bottom of list

## NoteViewport Integration

Replace the derive case in renderEditor():

```typescript
case 'derive':
  return (
    <DerivationEditor
      document={activeNoteContent as DerivationDocument}
      onSave={async (doc: DerivationDocument) => {
        await saveNote(selectedNoteId, doc)
      }}
      codeRepoPath={state.codeRepoPath}
    />
  )
```

No changes needed in AppContext, useNotes, or ipc-handlers.

## Edge Cases

| Case | Handling |
|------|----------|
| Empty document (no nodes) | "Add your first step" placeholder + prominent add button |
| Circular reference attempt | Dropdown filters out nodes that descend from the current node |
| Delete node with children | Confirm dialog. Children's derivesFrom set to null |
| Invalid LaTeX | Show raw text in preview; KaTeX errors caught, displayed as plain text |
| Very long content | Textarea scrolls; KaTeX preview collapsible via toggle |
| File externally modified | note-updated WS message triggers reload (same as MdEditor) |

## Testing

- Unit tests for derivationReducer: all actions, step number recalculation, cycle prevention
- Component tests for DerivationEditor: renders nodes, handles input, dispatches save
- Integration test: NoteViewport loads .derive.json → DerivationEditor instead of DerivationRenderer
