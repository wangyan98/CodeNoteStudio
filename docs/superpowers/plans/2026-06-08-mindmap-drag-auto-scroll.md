# Mind Map Drag Auto-Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-scroll the mind map viewport when dragging a node to the container edge, enabling drop targets outside the visible area.

**Architecture:** Add edge-detection and an rAF-driven animation loop within the existing `d3.drag` handler in `MindMapCanvas.tsx`. The loop calls `d3.zoom.translateBy` to pan the viewport, with speed following a linear curve (0 at 35px from edge, 500px/s at 0px). No new files, no new dependencies.

**Tech Stack:** TypeScript, React, D3.js (d3.zoom, d3.drag)

---

### Task 1: Add auto-pan state variables and edge-detection helpers

**Files:**
- Modify: `src/renderer/src/components/editors/MindMapCanvas.tsx:748`

- [ ] **Step 1: Add auto-pan state variables after the drag target tracking block**

After line 748 (`let dragInsertIndex: number | null = null`), add:

```typescript
      // Auto-pan during drag
      let autoPanRafId: number | null = null
      let autoPanMouseX = 0
      let autoPanMouseY = 0
      const AUTO_PAN_EDGE = 35
      const AUTO_PAN_MAX_SPEED = 500 // px/s
```

- [ ] **Step 2: Add the auto-pan speed calculation helper**

After the new variables, add:

```typescript
      function computeAutoPanSpeed(clientX: number, clientY: number): { dx: number; dy: number } {
        const containerEl = containerRef.current
        if (!containerEl) return { dx: 0, dy: 0 }
        const rect = containerEl.getBoundingClientRect()
        const distTop = clientY - rect.top
        const distBottom = rect.bottom - clientY
        const distLeft = clientX - rect.left
        const distRight = rect.right - clientX

        let dx = 0
        let dy = 0

        if (distTop < AUTO_PAN_EDGE) dy = -AUTO_PAN_MAX_SPEED * (1 - distTop / AUTO_PAN_EDGE)
        else if (distBottom < AUTO_PAN_EDGE) dy = AUTO_PAN_MAX_SPEED * (1 - distBottom / AUTO_PAN_EDGE)

        if (distLeft < AUTO_PAN_EDGE) dx = -AUTO_PAN_MAX_SPEED * (1 - distLeft / AUTO_PAN_EDGE)
        else if (distRight < AUTO_PAN_EDGE) dx = AUTO_PAN_MAX_SPEED * (1 - distRight / AUTO_PAN_EDGE)

        return { dx, dy }
      }
```

- [ ] **Step 3: Verify the file still compiles**

Run: `npx tsc --noEmit -p tsconfig.web.json 2>&1 | head -20`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/editors/MindMapCanvas.tsx
git commit -m "feat: add auto-pan state variables and speed helper for mind map drag"
```

---

### Task 2: Implement the rAF auto-pan loop and wire into drag events

**Files:**
- Modify: `src/renderer/src/components/editors/MindMapCanvas.tsx` — drag handler `on('drag')` and `on('end')`

- [ ] **Step 1: Add auto-pan rAF start/stop logic at the end of the `drag` event handler**

After the reorder detection block (after line 1149, before the closing `})` of the `.on('drag', ...)` handler), add:

```typescript
          // --- Auto-pan during drag ---
          const containerEl = containerRef.current
          if (containerEl) {
            const rect = containerEl.getBoundingClientRect()
            const distTop = clientX !== undefined ? (clientY ?? 0) - rect.top : 999
            const distBottom = rect.bottom - (clientY ?? 0)
            const distLeft = (clientX ?? 0) - rect.left
            const distRight = rect.right - (clientX ?? 0)
            const inEdgeZone =
              distTop < AUTO_PAN_EDGE || distBottom < AUTO_PAN_EDGE ||
              distLeft < AUTO_PAN_EDGE || distRight < AUTO_PAN_EDGE

            autoPanMouseX = clientX ?? 0
            autoPanMouseY = clientY ?? 0

            if (inEdgeZone && !autoPanRafId) {
              let lastTime = performance.now()
              const panStep = () => {
                const now = performance.now()
                const dt = Math.min((now - lastTime) / 1000, 0.1)
                lastTime = now
                const { dx, dy } = computeAutoPanSpeed(autoPanMouseX, autoPanMouseY)
                if (dx !== 0 || dy !== 0) {
                  const svgEl = svgRef.current
                  if (svgEl && zoomRef.current) {
                    d3.select(svgEl).call(zoomRef.current.translateBy, dx * dt, dy * dt)
                  }
                }
                autoPanRafId = requestAnimationFrame(panStep)
              }
              autoPanRafId = requestAnimationFrame(panStep)
            } else if (!inEdgeZone && autoPanRafId) {
              cancelAnimationFrame(autoPanRafId)
              autoPanRafId = null
            }
          }
```

- [ ] **Step 2: Add rAF cleanup in the `end` event handler**

In the `.on('end', ...)` handler, before `clearDragHighlight()` (currently line 1159), add:

```typescript
          if (autoPanRafId) {
            cancelAnimationFrame(autoPanRafId)
            autoPanRafId = null
          }
```

- [ ] **Step 3: Verify the file compiles**

Run: `npx tsc --noEmit -p tsconfig.web.json 2>&1 | head -20`
Expected: No new errors.

- [ ] **Step 4: Manual verification — launch the app and test**

Launch the app and test these scenarios:
1. Create a mind map with enough nodes to fill beyond the viewport
2. Drag a node toward each of the four edges — verify smooth auto-scroll
3. Drag to edge, then pull back — verify scrolling stops
4. Drag to edge, release — verify no continued panning
5. Zoom in, drag to edge — verify auto-scroll works at zoomed levels

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/editors/MindMapCanvas.tsx
git commit -m "feat: add auto-scroll during mind map node drag at viewport edges"
```
