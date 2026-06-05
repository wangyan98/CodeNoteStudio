# Floating Locate Button for Diagram Viewers

## Summary

Add a floating circular button in the bottom-right corner of diagram viewers (mind map, sequence diagram, network graph) that smoothly returns the viewport to the root node / initial centered position. Solves the problem of users getting lost after panning/zooming too far from the content.

## Design Decisions

| Decision | Choice |
|----------|--------|
| Button style | Circular icon-only button (36×36px), target/crosshair SVG icon |
| Visibility | Always visible |
| Animation | Smooth d3 transition / smooth scroll, ~400ms |
| Sequence diagram behavior | Reset scroll position to left edge, center SVG if narrower than viewport |

## Architecture

```
LocateButton (new shared component)
  ├── props: onLocate, title?
  ├── rendered absolutely in bottom-right of a position:relative container
  └── used by: MindMapRenderer, NetworkCanvas, SequenceDiagramViewer
```

### LocateButton (new)

- **File:** `src/renderer/src/components/editors/LocateButton.tsx`
- **File:** `src/renderer/src/components/editors/LocateButton.css`
- A simple `<button>` with an inline SVG target icon, positioned absolute bottom-right
- Accepts `onLocate: () => void` and optional `title: string`
- Styled: 36×36 circle, `#2d2d2d` background, `1px solid #555` border, box-shadow, hover highlight

### MindMapRenderer changes

- Store the initial fit transform `{x, y, k}` in a ref, updated each render
- Wrap container div with `position: relative` (already via CSS)
- Add `<LocateButton>` inside the container
- `onLocate`: call `zoomRef.current.transition().duration(400).call(svg, d3.zoomIdentity.translate(x, y).scale(k))`

### NetworkCanvas changes

- Same pattern as MindMapRenderer
- Store initial fit transform `{x, y, k}` computed from `initTx/initTy/fitScale`
- `onLocate`: same d3 zoom transition approach

### SequenceDiagramViewer changes

- Container already has overflow scroll but needs `position: relative`
- `onLocate`: call `container.scrollTo({ left: 0, behavior: 'smooth' })` to return to left edge
- Center SVG horizontally within the container when diagram is narrower than viewport

## Edge Cases

- **Resize:** initial fit transform recalculated on each render (ResizeObserver triggers re-render), always accurate
- **Document content changes:** new nodes/edges trigger re-render, fit transform updates accordingly
- **Already at initial position:** animation is a no-op or imperceptibly short, no visual glitch
- **Empty diagrams:** button still renders but is harmless (onLocate does nothing meaningful)

## Files Changed

| File | Action |
|------|--------|
| `src/renderer/src/components/editors/LocateButton.tsx` | Create |
| `src/renderer/src/components/editors/LocateButton.css` | Create |
| `src/renderer/src/components/editors/MindMapRenderer.tsx` | Modify |
| `src/renderer/src/components/editors/NetworkCanvas.tsx` | Modify |
| `src/renderer/src/components/editors/SequenceDiagramViewer.tsx` | Modify |
