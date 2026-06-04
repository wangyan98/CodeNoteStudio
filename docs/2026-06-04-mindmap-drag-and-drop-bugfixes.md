# Mind Map Drag-and-Drop Bug Fixes (2026-06-04)

All fixes in `src/renderer/src/components/editors/MindMapCanvas.tsx`.

---

## Fix 1: Reorder Highlight Not Cleared Between Ticks

**Commits:** `e687138`

### Symptom

When dragging node A from above towards sibling node B:
1. The parent-to-B connection line disappeared as A approached B.
2. When A finally overlapped B, B teleported upward — making it impossible to reparent A under B from above (only possible from below).

### Root Cause

The `clearDragHighlight()` guard was `if (dragTargetNodeId)`. For `'reorder'` actions, `dragTargetNodeId` is never set — only `dragTargetAction` and `dragInsertIndex` are assigned. This meant:

- **Tick N** (reorder): `shiftSiblingsForInsert()` shifts B down 32px. `dragTargetNodeId` stays `null`.
- **Tick N+1**: `clearDragHighlight()` skipped → B stays shifted. Vertical line recalculation doesn't account for the shift → connection appears broken.
- When reparent is finally detected: `dragTargetNodeId = B` → next tick `clearDragHighlight()` runs → B snaps back 32px upward.

### Fix

Changed the guard to `if (dragTargetNodeId || dragTargetAction)` so `clearDragHighlight()` runs for both reparent and reorder previous actions.

---

## Fix 2: Index Space Mismatch in shiftSiblingsForInsert

**Commits:** `b5f58af`

### Symptom

When dragging node A below sibling B, B sometimes did not return to its original position.

### Root Cause

`insertIndex` was calculated in "new array without dragged node" space (adjusted by decrementing when `draggedOrigIdx < insertIdx`). But `findParentAndIndex(doc, sid)` returned indices in the **current data model** which still includes the dragged node. Comparing these two coordinate systems caused siblings below the dragged node to be incorrectly shifted.

Example — `[A(0), B(1)]`, drag A **below** B:
- `insertIndex` = 1 (new array: `[B][A]` — A after B)
- `findParentAndIndex(doc, B)` returns `1` (current: `[A][B]`)
- Old check: `1 >= 1` → B incorrectly shifted by +32px

### Fix

Compute each sibling's new-array index (`modelIdx > draggedOrigIdx ? modelIdx - 1 : modelIdx`) before comparing against `insertIndex`, so both values are in the same space.

---

## Fix 3: Gap-Filling — Siblings Shift Up When Dragged Node Moves Down

**Commits:** `711835b`

### Symptom

When dragging node A below the last sibling, siblings between A's original position and the end did not shift up to fill the gap left by A.

### Root Cause

`shiftSiblingsForInsert` only shifted siblings **down** (+32px) when they were at or after the insertion point. It never shifted siblings **up** to fill the vacated gap, leaving empty space where the dragged node used to be.

### Fix

Replaced the `shiftedIds` Set with a `shiftOffsets` Map storing per-node offset amounts:
- **+32** (down): siblings at `newIdx >= insertIndex` — make room for insertion
- **-32** (up): siblings at `draggedOrigIdx <= newIdx < insertIndex` — fill the gap left by the dragged node

Lines and collapse buttons use the same signed offset, so they follow correctly in both directions.

---

## Fix 4: Select Node on Drag Start

**Commits:** `8309a29`

### Symptom

Clicking a node showed the edit panel below, but dragging a node did not — the dragged node was never selected.

### Root Cause

Selection (`SELECT_NODE`) was only dispatched in the `click` event handler. After a significant drag, the `.on('end')` handler calls `render()`, which rebuilds the SVG DOM. The subsequent `click` event fires on a removed element, so `SELECT_NODE` never reaches `setSelectedNodeId`.

### Fix

Added `dispatch({ type: 'SELECT_NODE', nodeId: d.data.id })` in the drag `.on('start')` handler (with a guard to skip if already selected). Since drag start fires on every mousedown, both click and drag now select the node and show the edit panel.
