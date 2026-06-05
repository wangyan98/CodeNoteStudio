# Sequence Diagram Viewer — Zoom Design

**Goal:** Add Ctrl+wheel zoom (centered on cursor position) to the SequenceDiagramViewer rendered viewport.

## Architecture

Direct DOM manipulation — no React state for zoom transforms. Avoids render-paint lag during rapid zoom steps.

## Zoom Flow

```
Ctrl+Wheel (cursor position over SVG)
  → calc new zoom level, clamped [0.3, 3.0]
  → wrapper.style.width  = naturalW × zoom
  → wrapper.style.height = naturalH × zoom
  → inner.style.transform = scale(zoom) with transform-origin: 0 0
  → adjust scrollLeft/scrollTop so SVG point under cursor stays fixed
```

- **Plain wheel** → native vertical scroll (unchanged)
- **Ctrl+wheel up** → zoom in toward cursor
- **Ctrl+wheel down** → zoom out toward cursor
- **Locate button** → reset zoom to 1 + scrollLeft to 0

## DOM Structure

```
<div ref={scrollRef} style="overflow: auto">       ← scroll container, wheel listener
  <div ref={wrapperRef} style="width: w; height: h; display: inline-block">
                                       ← sized to zoomed dimensions so scrollbars work
    <div ref={innerRef} style="transform: scale(Z); transform-origin: 0 0">
                                       ← holds the SVG via dangerouslySetInnerHTML
    </div>
  </div>
</div>
```

## Files

- **Modify:** `src/renderer/src/components/editors/SequenceDiagramViewer.tsx` — add refs, wheel handler, DOM structure, extend handleLocate
- **Modify:** `src/renderer/src/components/editors/SequenceDiagramViewer.css` — wrapper CSS

## Edge Cases

- **No SVG rendered** (empty/error state): wheel is a no-op since scrollRef is null
- **SVG narrower than container**: wrapper width = max(naturalW × zoom, containerW) so scroll doesn't break
- **Very small SVG at low zoom**: wrapper height at least equals container height so the viewport doesn't collapse
- **Rapid scrolling**: preventDefault on every Ctrl+wheel to avoid browser zoom

## Spec Self-Review

- No TBDs or placeholders
- Files and DOM structure match internally
- Scope is single-viewer only — does not affect other diagram types
- Edge cases covered: empty state, small SVG, rapid input
