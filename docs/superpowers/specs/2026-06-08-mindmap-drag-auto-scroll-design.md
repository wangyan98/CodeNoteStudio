# Mind Map Drag Auto-Scroll Design

## Summary

When dragging a mind map node, if the mouse reaches the viewport edge, the viewport auto-scrolls smoothly so the user can reach drop targets outside the current visible area.

## Motivation

Currently, node dragging only detects reparent/reorder targets within the visible viewport. When a target node is off-screen, the user must abort the drag, manually pan, then drag again. Auto-scroll during drag removes this friction.

## Design

### Edge Detection Zone

35px inward from each of the four container edges (top, bottom, left, right).

### Speed Curve

Linear interpolation from 0 to max speed based on distance from edge:

```
speed = maxSpeed * (1 - distance / 35)
```

- `distance` = mouse position relative to the nearest edge (0 = at edge, 35 = at zone boundary)
- `maxSpeed` = 500 px/s
- Result: full speed at the edge, tapering to 0 at the zone boundary

### Animation Loop

A `requestAnimationFrame` loop drives the auto-pan:

1. Track `clientX`/`clientY` from each `drag` event into shared variables readable by the rAF loop
2. Each frame: compute `deltaTime` (capped at 100ms to guard against tab-switch jumps), multiply by speed to get pan deltas
3. Call `d3.zoom.translateBy` to translate the viewport in screen-pixel space
4. Mouse leaves edge zone → cancel rAF → panning stops immediately
5. Drag ends (mouse up) → cancel rAF unconditionally in `end` handler

### Integration Points

All changes are in `MindMapCanvas.tsx` `render()`, within the existing drag handler closure:

- **New local variables** (alongside `dragOffset`, `dragged`, etc.): `autoPanRafId`, `autoPanMouseX`, `autoPanMouseY`
- **In `drag` event**: after existing node/line movement and hit detection, check edge proximity. Start rAF if entering edge zone; stop rAF if leaving
- **In `end` event**: cancel rAF if active, before `clearDragHighlight()`
- **No changes** to `start`, `clearDragHighlight`, `highlightReparentTarget`, or `shiftSiblingsForInsert`

### Coordinate System

`translateBy` operates in screen-pixel space. The existing drag handler uses `d3.pointer(event, svgEl)` which accounts for the SVG's current zoom transform. When `translateBy` pans the viewport, the next `drag` event's `d3.pointer()` automatically reflects the new transform, so the dragged node stays under the mouse without any compensation code.

### Edge Cases

| Scenario | Handling |
|---|---|
| Mouse leaves edge zone mid-drag | Cancel rAF, viewport stays put |
| Mouse exits container entirely | `edgeDist` goes negative, `inEdgeZone` false, rAF stops |
| Drag ends (mouse up) | `end` handler cancels rAF unconditionally |
| Scroll wheel during drag | `translateBy` and `d3.zoom` operate on same transform — no conflict, effects combine naturally |
| Browser tab switch (dt spike) | `Math.min(dt, 0.1)` caps single-frame pan to ~50px |
| High DPI display | `clientX/Y` and `getBoundingClientRect` are CSS-pixel based, no special handling |

## Files Changed

- `src/renderer/src/components/editors/MindMapCanvas.tsx` — add auto-scroll logic in drag handler

## Testing

- Drag a node and move mouse to each of the four viewport edges — verify smooth auto-scroll
- Drag to edge, then pull back — verify scrolling stops immediately
- Drag to edge, release mouse — verify rAF is cancelled, no continued panning
- Tab away during a drag-to-edge, tab back — verify no viewport jump
- Zoom in, then drag to edge — verify auto-scroll works at non-default zoom levels
