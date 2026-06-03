# Graph Drag-and-Drop Interactions

**Date:** 2026-06-03
**Status:** approved

## Summary

Add drag-and-drop interactions to Mind Map and Network canvases so users can reorder/reparent mind map nodes and create edges between network layers by dragging nodes directly in the canvas. Both use D3 drag with DOM-based hit detection for target highlighting.

## User Decisions

- **Reorder visual feedback:** target siblings shift down to make room (option B)
- **Edge direction:** dragged node → target node (dragged = source/output, target = input)
- **Target highlight:** yellow border on both canvases (option A for net)
- **Cross-parent reorder:** not allowed; user must reparent first then reorder (option B)
- **Implementation approach:** extend existing D3 drag, no new abstraction (option A)

## Interaction Flows

### Mind Map: Reorder

```
User drags node between siblings
  → drag handler detects cursor Y between two sibling nodes
  → siblings below insertion point shift down visually
  → drop: dispatch REORDER with calculated newIndex
  → tree re-renders with updated order
```

### Mind Map: Reparent

```
User drags node onto another node
  → drag handler detects cursor over target node rect
  → target node gets yellow border highlight
  → other siblings stop showing shift-down indicator
  → drop: dispatch REPARENT with nodeId and newParentId
  → tree re-renders with node moved to new parent's children
```

### Network: Create Edge

```
User drags layer node onto another layer node
  → d3.drag() on layer nodes (not input/output/block)
  → drag handler detects cursor over target node
  → target node gets yellow border highlight
  → dashed line drawn from dragged node to cursor
  → drop: call onAddEdge(draggedNodeId, targetNodeId)
  → ADD_EDGE dispatched, canvas re-renders with new edge
```

## Component Changes

### MindMapCanvas.tsx

- Add state variables in drag handler closure: `dragTargetNodeId`, `dragTargetAction` (`'reorder'` | `'reparent'`), `dragInsertIndex`
- `.on('drag', ...)`: after moving the node, call `detectDropTarget(event)` to determine what's under cursor
  - Use `document.elementsFromPoint(clientX, clientY)` to find `.mind-node` elements
  - Exclude self, descendants, and ancestor chain
  - If cursor overlaps another node's rect → reparent, highlight target
  - If cursor is in gap between siblings → reorder, calculate insertIndex
  - Direct DOM manipulation for highlight/shift (same pattern as selection highlight)
- `.on('end', ...)`: on drop, dispatch REPARENT or REORDER then call `render()`
- Reuse existing `REPARENT` and `REORDER` actions in `mindMapReducer` (no changes needed)

### NetworkCanvas.tsx

- Add `d3.drag()` to layer node groups (kind === 'layer'), excluding input/output/block
- `.on('drag', ...)`: draw dashed line from dragged node center to cursor, detect target via `document.elementsFromPoint`
  - Valid targets: other layer nodes or block nodes (not self, not input/output)
  - Show yellow border on target
  - Coordinate conversion via `d3.zoomTransform(svgEl)` to account for zoom/pan
- `.on('end', ...)`: if valid target, call `onAddEdge(draggedNodeId, targetNodeId)`
- Reuse existing `ADD_EDGE` action in `networkReducer` (no changes needed)

### No Changes Required

- `mindMapReducer.ts` — REPARENT and REORDER actions already implemented
- `networkReducer.ts` — ADD_EDGE action already implemented
- `MindMapEditor.tsx` — dispatch already wired, reducer handles state
- `NetworkEditor.tsx` — onAddEdge already wired

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Drag node onto itself | Excluded by hit detection |
| Drag node onto own descendant | Excluded via ancestor check |
| Drag root node | Root cannot be reparented; only reorder among its children applies |
| Drag between collapsed nodes | Collapsed children are not rendered, so they can't be targets |
| Drag network node onto input/output | input/output are excluded from valid targets |
| Duplicate edge in network | ADD_EDGE reducer already checks for duplicate source→target pairs |
| Zoom/pan active during drag | Network uses zoomTransform for coordinate conversion; mind map drag works in SVG coords |
| Drag outside canvas | No target detected → drop is a no-op, node snaps back |

## Hit Detection Logic

```
detectDropTarget(event, draggedNodeId, svgEl):
  elements = document.elementsFromPoint(clientX, clientY)
  for each el in elements:
    nodeEl = el.closest('[data-node-id]')
    if nodeEl and nodeEl.dataset.nodeId:
      targetId = nodeEl.dataset.nodeId
      if targetId === draggedNodeId → skip (self)
      if isDescendant(draggedNodeId, targetId) → skip (circular)
      return { action: 'reparent', targetId }

  // No direct node hit — check for between-siblings position
  parentNodeEl = svgEl.querySelector(`[data-node-id="${parentId}"]`)
  siblings = parentNodeEl.querySelectorAll('[data-parent-id="..."]')
  for each sibling, check cursor Y relative to sibling center
  return { action: 'reorder', insertIndex }
```
