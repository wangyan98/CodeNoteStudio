# Graph Drag-and-Drop Bug Fixes (2026-06-03)

## Issue 1: Network Layer Nodes Cannot Be Dragged

**Symptom:** Dragging layer nodes in the Network canvas had no effect — drag events never started.

**Root Cause:** `d3.zoom()` on the SVG element intercepted `mousedown` events before `d3.drag()` on `.net-node` groups could start. The zoom filter allowed all events through.

**Fix:** Added a check in the zoom filter to exclude mousedown events originating from `.net-node` elements when not in read-only mode, letting those events reach the drag handler instead.

**Files changed:** `src/renderer/src/components/editors/NetworkCanvas.tsx`

---

## Issue 2: Reparent/Reorder Dispatch Never Fires

**Symptom:** Yellow highlight appeared on targets correctly, but dropping a node never triggered REPARENT or REORDER — the node always snapped back.

**Root Cause:** `clearDragHighlight()` at the start of `.on('end')` reset `dragTargetNodeId`, `dragTargetAction`, and `dragInsertIndex` to `null` before the dispatch conditions checked them.

**Fix:** Saved the tracking variables to local constants (`savedAction`, `savedTargetId`, `savedInsertIndex`) before calling `clearDragHighlight()`, then checked the saved values for dispatch.

**Files changed:** `src/renderer/src/components/editors/MindMapCanvas.tsx`

---

## Issue 3: Reorder Always Puts Node at the End (Zoom Transform)

**Symptom:** No matter where a node was dragged between siblings, it always ended up at the last position.

**Root Cause:** The reorder detection converted sibling SVG positions to viewport coordinates with `svgRect.top + sibOrig.x`, but `sibOrig.x` is the D3 tree layout position in SVG coordinate space. The SVG element uses `d3.zoomIdentity.translate(80, height/2)` for initial centering, so raw SVG coordinates did not match viewport positions.

**Fix:** Used `d3.zoomTransform(svgEl).applyY(sibOrig.x)` to correctly convert SVG y-coordinates to viewport space, accounting for the zoom/pan transform.

**Files changed:** `src/renderer/src/components/editors/MindMapCanvas.tsx`

---

## Issue 4: Reorder Always Puts Node at the End (D3 Hierarchy Node ID)

**Symptom:** Even after the zoom fix, reorder still always placed nodes at the last position.

**Root Cause:** The reorder loop accessed `siblings[i].id` to look up original positions. But `siblings` comes from `d.parent.children` — these are D3 hierarchy nodes, where the original data's `id` lives at `.data.id`, not `.id`. Since `.id` was always `undefined`, `originalPositions.get(undefined)` returned `undefined`, and the `if (!sibOrig) continue` check skipped every sibling. `insertIdx` stayed at `siblings.length` (the end) for all drag positions.

**Fix:** Changed `siblings[i].id` to `siblings[i].data.id` in three places: the self-exclusion check, the `originalPositions.get()` lookup, and the `findIndex` call for `draggedOrigIdx`.

**Files changed:** `src/renderer/src/components/editors/MindMapCanvas.tsx`

---

## Issue 5: Accidental Reorder on Click

**Symptom:** Simply clicking a node (without any intentional drag) sometimes caused it to move to the last position.

**Root Cause:** D3's `d3.drag()` has a default click distance of 0, meaning any microscopic mouse movement (even a 1px hand tremor during a click) fires `.on('drag')`. This set `dragged = true`, ran hit detection (which could find a reorder target), and dispatched REORDER on `.on('end')`.

**Fix:** Added a 5px minimum drag distance threshold. A new `significantDrag` flag is set only when `dx * dx + dy * dy > 25`. The REORDER/REPARENT dispatch in `.on('end')` now gates on `significantDrag` instead of just `dragged`. Micro-movements during clicks still trigger a render (snapping the node back to its original position) but do not change the data model.

**Files changed:** `src/renderer/src/components/editors/MindMapCanvas.tsx`
