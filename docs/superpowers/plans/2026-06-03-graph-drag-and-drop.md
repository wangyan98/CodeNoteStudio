# Graph Drag-and-Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add drag-to-reorder/reparent in mind maps and drag-to-connect in network graphs using D3 drag with DOM hit detection.

**Architecture:** Extend existing `d3.drag()` in MindMapCanvas to detect drop targets during drag and dispatch `REPARENT`/`REORDER` instead of snapping back. Add `d3.drag()` to NetworkCanvas layer nodes to detect target nodes and dispatch `ADD_EDGE`. Both reuse existing reducer actions — no new state management needed.

**Tech Stack:** TypeScript, React, D3.js (d3-drag, d3-zoom), dagre

---

### Task 1: MindMapCanvas — drag target detection and visual feedback

**Files:**
- Modify: `src/renderer/src/components/editors/MindMapCanvas.tsx` (drag handler in render())

- [ ] **Step 1: Add drag target tracking variables in the drag handler closure**

In `render()`, inside the drag handler setup (around line 736), add these variables before the `d3.drag()` call:

```typescript
// Drag target tracking
let dragTargetNodeId: string | null = null
let dragTargetAction: 'reparent' | 'reorder' | null = null
let dragInsertIndex: number | null = null
```

- [ ] **Step 2: Add highlight/clear helper functions for drag targets**

Add these helper functions inside `render()`, right after `getDescendantIds` (around line 754):

```typescript
function clearDragHighlight() {
  const svgEl = svgRef.current
  if (!svgEl) return
  // Remove yellow border from all nodes
  svgEl.querySelectorAll('[data-node-id] rect').forEach((rect) => {
    const g = rect.parentElement
    const nodeId = g?.getAttribute('data-node-id')
    const isSelected = nodeId === selectedNodeIdRef.current
    const depth = g?.getAttribute('data-depth')
    const isRoot = depth === '0'
    rect.setAttribute('fill', isSelected ? '#094771' : (isRoot ? '#007acc' : '#3c3c3c'))
    rect.setAttribute('stroke', isSelected ? '#ff0' : (isRoot ? '#007acc' : '#555'))
    rect.setAttribute('stroke-width', isSelected ? '2' : '1')
  })
  // Restore sibling positions (remove any shift-down transform overrides)
  svgEl.querySelectorAll('[data-node-id]').forEach((el) => {
    const nodeId = (el as SVGGElement).getAttribute('data-node-id')
    const orig = originalPositions.get(nodeId || '')
    if (orig) {
      el.setAttribute('transform', `translate(${orig.y},${orig.x})`)
    }
  })
  dragTargetNodeId = null
  dragTargetAction = null
  dragInsertIndex = null
}

function highlightReparentTarget(targetId: string) {
  const svgEl = svgRef.current
  if (!svgEl) return
  const targetG = svgEl.querySelector(`[data-node-id="${targetId}"]`)
  if (!targetG) return
  const rect = targetG.querySelector('rect')
  if (rect) {
    rect.setAttribute('stroke', '#ff0')
    rect.setAttribute('stroke-width', '2')
  }
}

function shiftSiblingsForInsert(parentId: string, insertIndex: number, draggedNodeId: string) {
  const svgEl = svgRef.current
  if (!svgEl) return
  const siblings = svgEl.querySelectorAll(`[data-parent-id="${parentId}"]`)
  siblings.forEach((el) => {
    const sid = el.getAttribute('data-node-id')
    if (!sid || sid === draggedNodeId) return
    const orig = originalPositions.get(sid)
    if (!orig) return
    const parentInfo = findParentAndIndex(doc, sid)
    if (parentInfo && parentInfo.index >= insertIndex) {
      el.setAttribute('transform', `translate(${orig.y},${orig.x + 32})`)
    }
  })
}
```

- [ ] **Step 2.5: Export `findParentAndIndex` from mindMapReducer.ts**

In `src/renderer/src/components/editors/mindMapReducer.ts`, change line 32 from:

```typescript
function findParentAndIndex(doc: MindMapDocument, nodeId: string): { parent: MindMapNode; index: number } | null {
```

to:

```typescript
export function findParentAndIndex(doc: MindMapDocument, nodeId: string): { parent: MindMapNode; index: number } | null {
```

Then in `MindMapCanvas.tsx`, update the import from `mindMapReducer` (line 5) from:

```typescript
import { findNode } from './mindMapReducer'
```

to:

```typescript
import { findNode, findParentAndIndex } from './mindMapReducer'
```

- [ ] **Step 3: Add hit detection logic in `.on('drag', ...)`**

Replace the existing `.on('drag', ...)` handler (lines 763-884) with this version that adds target detection:

```typescript
.on('drag', function (event: d3.D3DragEvent<SVGGElement, unknown, unknown>, d: d3.HierarchyNode<MindMapNode>) {
  if (!dragOffset) return
  dragged = true
  const pt = d3.pointer(event, svgRef.current!)
  const dx = pt[0] - dragOffset.x - d.y!
  const dy = pt[1] - dragOffset.y - d.x!

  const svgEl = svgRef.current
  if (!svgEl) return

  // Move the dragged node
  d3.select(this).attr('transform', `translate(${pt[0] - dragOffset.x},${pt[1] - dragOffset.y})`)

  // Move all descendant node groups
  const descendantIds = getDescendantIds(d.data.id)
  descendantIds.forEach(id => {
    const el = svgEl.querySelector<SVGGElement>(`[data-node-id="${id}"]`)
    const orig = originalPositions.get(id)
    if (el && orig) {
      el.setAttribute('transform', `translate(${orig.y + dx},${orig.x + dy})`)
    }
  })

  // Move link lines, collapse buttons (same as before)
  const ownedLines = svgEl.querySelectorAll<SVGLineElement>(
    `[data-owner-id="${d.data.id}"]`
  )
  ownedLines.forEach(line => {
    line.setAttribute('x1', String(parseFloat(line.getAttribute('data-orig-x1') || '0') + dx))
    line.setAttribute('y1', String(parseFloat(line.getAttribute('data-orig-y1') || '0') + dy))
    line.setAttribute('x2', String(parseFloat(line.getAttribute('data-orig-x2') || '0') + dx))
    line.setAttribute('y2', String(parseFloat(line.getAttribute('data-orig-y2') || '0') + dy))
  })

  svgEl.querySelectorAll<SVGCircleElement>(
    `.mind-collapse-btn[data-collapse-owner-id="${d.data.id}"]`
  ).forEach(circle => {
    circle.setAttribute('cx', String(parseFloat(circle.getAttribute('data-orig-cx') || '0') + dx))
    circle.setAttribute('cy', String(parseFloat(circle.getAttribute('data-orig-cy') || '0') + dy))
  })
  svgEl.querySelectorAll<SVGTextElement>(
    `.mind-collapse-btn-text[data-collapse-owner-id="${d.data.id}"]`
  ).forEach(text => {
    text.setAttribute('x', String(parseFloat(text.getAttribute('data-orig-x') || '0') + dx))
    text.setAttribute('y', String(parseFloat(text.getAttribute('data-orig-y') || '0') + dy))
  })

  descendantIds.forEach(descId => {
    const descLines = svgEl.querySelectorAll<SVGLineElement>(
      `[data-owner-id="${descId}"]`
    )
    descLines.forEach(line => {
      line.setAttribute('x1', String(parseFloat(line.getAttribute('data-orig-x1') || '0') + dx))
      line.setAttribute('y1', String(parseFloat(line.getAttribute('data-orig-y1') || '0') + dy))
      line.setAttribute('x2', String(parseFloat(line.getAttribute('data-orig-x2') || '0') + dx))
      line.setAttribute('y2', String(parseFloat(line.getAttribute('data-orig-y2') || '0') + dy))
    })

    svgEl.querySelectorAll<SVGCircleElement>(
      `.mind-collapse-btn[data-collapse-owner-id="${descId}"]`
    ).forEach(circle => {
      circle.setAttribute('cx', String(parseFloat(circle.getAttribute('data-orig-cx') || '0') + dx))
      circle.setAttribute('cy', String(parseFloat(circle.getAttribute('data-orig-cy') || '0') + dy))
    })
    svgEl.querySelectorAll<SVGTextElement>(
      `.mind-collapse-btn-text[data-collapse-owner-id="${descId}"]`
    ).forEach(text => {
      text.setAttribute('x', String(parseFloat(text.getAttribute('data-orig-x') || '0') + dx))
      text.setAttribute('y', String(parseFloat(text.getAttribute('data-orig-y') || '0') + dy))
    })
  })

  // Update incoming lines
  const incomingLines = svgEl.querySelectorAll<SVGLineElement>(
    `[data-child-id="${d.data.id}"]`
  )
  incomingLines.forEach(line => {
    line.setAttribute('y1', String(parseFloat(line.getAttribute('data-orig-y1') || '0') + dy))
    line.setAttribute('x2', String(parseFloat(line.getAttribute('data-orig-x2') || '0') + dx))
    line.setAttribute('y2', String(parseFloat(line.getAttribute('data-orig-y2') || '0') + dy))
  })

  // Update parent vertical line
  const parentId = d.parent?.data.id
  if (parentId) {
    const vertLine = svgEl.querySelector<SVGLineElement>(
      `[data-owner-id="${parentId}"][data-line-type="vertical"]`
    )
    if (vertLine) {
      const siblingEls = svgEl.querySelectorAll<SVGGElement>(
        `[data-parent-id="${parentId}"]`
      )
      let minY = Infinity
      let maxY = -Infinity
      siblingEls.forEach(el => {
        const sibId = el.getAttribute('data-node-id')
        if (!sibId) return
        const orig = originalPositions.get(sibId)
        if (!orig) return
        const isMoved = sibId === d.data.id || descendantIds.has(sibId)
        const curY = orig.x + (isMoved ? dy : 0)
        if (curY < minY) minY = curY
        if (curY > maxY) maxY = curY
      })
      if (minY < Infinity) {
        vertLine.setAttribute('y1', String(minY))
        vertLine.setAttribute('y2', String(maxY))
      }
    }
  }

  // --- NEW: Hit detection for drop target ---
  const clientX = event.sourceEvent.clientX
  const clientY = event.sourceEvent.clientY
  const elementsUnderCursor = document.elementsFromPoint(clientX, clientY)

  // Clear previous drag highlight
  if (dragTargetNodeId) {
    clearDragHighlight()
    // Re-apply drag movement to dragged node and descendants (clearDragHighlight resets them)
    d3.select(this).attr('transform', `translate(${pt[0] - dragOffset.x},${pt[1] - dragOffset.y})`)
    descendantIds.forEach(id => {
      const el = svgEl.querySelector<SVGGElement>(`[data-node-id="${id}"]`)
      const orig = originalPositions.get(id)
      if (el && orig) {
        el.setAttribute('transform', `translate(${orig.y + dx},${orig.x + dy})`)
      }
    })
  }

  // Check for direct node overlap (reparent)
  let foundTarget = false
  for (const el of elementsUnderCursor) {
    const nodeEl = (el as Element).closest?.('.mind-node') as HTMLElement | null
    if (!nodeEl) continue
    const targetId = nodeEl.getAttribute('data-node-id')
    if (!targetId || targetId === d.data.id || descendantIds.has(targetId)) continue
    // Prevent dragging onto own ancestor (would create cycle)
    const ancestors = new Set<string>()
    let current = d.parent
    while (current) {
      ancestors.add(current.data.id)
      current = current.parent
    }
    if (ancestors.has(targetId)) continue

    dragTargetNodeId = targetId
    dragTargetAction = 'reparent'
    highlightReparentTarget(targetId)
    foundTarget = true
    break
  }

  // If no direct node hit, check for between-siblings reorder
  if (!foundTarget && d.parent) {
    const parentNodeId = d.parent.data.id
    const siblings = d.parent.children || []
    if (siblings.length > 0) {
      const parentEl = svgEl.querySelector(`[data-node-id="${parentNodeId}"]`)
      if (parentEl) {
        const parentRect = parentEl.getBoundingClientRect()
        // Cursor Y relative to siblings
        let insertIdx = siblings.length
        for (let i = 0; i < siblings.length; i++) {
          if (siblings[i].id === d.data.id) continue
          const sibOrig = originalPositions.get(siblings[i].id)
          if (!sibOrig) continue
          // Convert sibling SVG position to viewport Y
          const svgRect = svgEl.getBoundingClientRect()
          const sibViewportY = svgRect.top + sibOrig.x
          if (clientY < sibViewportY) {
            insertIdx = i
            break
          }
        }
        // Adjust insertIdx to skip the dragged node's original position
        const draggedOrigIdx = siblings.findIndex(s => s.id === d.data.id)
        if (draggedOrigIdx >= 0 && insertIdx > draggedOrigIdx) {
          insertIdx--
        }
        if (insertIdx >= 0 && insertIdx !== draggedOrigIdx) {
          dragTargetAction = 'reorder'
          dragInsertIndex = insertIdx
          shiftSiblingsForInsert(parentNodeId, insertIdx, d.data.id)
        }
      }
    }
  }
})
```

- [ ] **Step 4: Replace `.on('end', ...)` to dispatch actions instead of always snapping back**

Replace lines 886-899 (the entire `.on('end', ...)` callback) with:

```typescript
.on('end', function (_event: d3.D3DragEvent<SVGGElement, unknown, unknown>, d: d3.HierarchyNode<MindMapNode>) {
  dragOffset = null
  clearDragHighlight()

  if (dragged) {
    dragged = false
    if (dragTargetAction === 'reparent' && dragTargetNodeId) {
      dispatch({ type: 'REPARENT', nodeId: d.data.id, newParentId: dragTargetNodeId })
    } else if (dragTargetAction === 'reorder' && dragInsertIndex !== null) {
      dispatch({ type: 'REORDER', nodeId: d.data.id, newIndex: dragInsertIndex })
    }
    // Always re-render after drag (either action was dispatched or it snaps back)
    render()
  } else {
    // Pure click (no drag movement)
    const isSelected = d.data.id === selectedNodeIdRef.current
    d3.select(this).select('rect')
      .attr('stroke', isSelected ? '#ff0' : (d.depth === 0 ? '#007acc' : '#555'))
      .attr('stroke-width', isSelected ? 2 : 1)
  }
})
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/editors/MindMapCanvas.tsx
git commit -m "feat: add drag-to-reorder and drag-to-reparent in mind map canvas"
```

---

### Task 2: NetworkCanvas — drag layer node to create edge

**Files:**
- Modify: `src/renderer/src/components/editors/NetworkCanvas.tsx`

- [ ] **Step 1: Add d3.drag() to layer node groups in the render function**

In the `render()` function, after the existing node click/dblclick event handlers for layer nodes (after line 540), add `d3.drag()` behavior. Find the layer node rendering block (around line 490-514, the `else { // layer` branch). After the existing event handlers on `nodeG` but before the port circles, add:

```typescript
// Drag-to-connect: drag layer node onto another node to create edge
if (!readOnly && node.kind !== 'input' && node.kind !== 'output') {
  const layerDrag = d3.drag<SVGGElement, unknown>()
    .on('start', function (event: d3.D3DragEvent<SVGGElement, unknown, unknown>) {
      d3.select(this).raise()
      d3.select(this).select('rect').attr('stroke', '#ff0').attr('stroke-width', 2.5)
      // Draw dashed line group
      const transform = d3.zoomTransform(svgEl!)
      const rect = container.getBoundingClientRect()
      const svgX = (event.sourceEvent.clientX - rect.left - transform.x) / transform.k
      const svgY = (event.sourceEvent.clientY - rect.top - transform.y) / transform.k
      g.append('line')
        .attr('class', 'net-drag-line')
        .attr('x1', svgX).attr('y1', svgY)
        .attr('x2', svgX).attr('y2', svgY)
        .attr('stroke', '#4a90d9').attr('stroke-width', 2)
        .attr('stroke-dasharray', '4,2')
    })
    .on('drag', function (event: d3.D3DragEvent<SVGGElement, unknown, unknown>) {
      const transform = d3.zoomTransform(svgEl!)
      const rect = container.getBoundingClientRect()
      const mx = (event.sourceEvent.clientX - rect.left - transform.x) / transform.k
      const my = (event.sourceEvent.clientY - rect.top - transform.y) / transform.k
      svgEl!.querySelector('.net-drag-line')?.setAttribute('x2', String(mx))
      svgEl!.querySelector('.net-drag-line')?.setAttribute('y2', String(my))

      // Detect target node under cursor
      const els = document.elementsFromPoint(event.sourceEvent.clientX, event.sourceEvent.clientY)
      // Clear previous highlights
      svgEl!.querySelectorAll('.net-drag-target').forEach(el => {
        el.classList.remove('net-drag-target')
        const r = (el as SVGGElement).querySelector('rect')
        if (r) {
          const origStroke = r.getAttribute('data-orig-stroke')
          const origWidth = r.getAttribute('data-orig-stroke-width')
          if (origStroke) r.setAttribute('stroke', origStroke)
          if (origWidth) r.setAttribute('stroke-width', origWidth)
        }
      })
      for (const el of els) {
        const nodeEl = (el as Element).closest?.('.net-node') as HTMLElement | null
        if (!nodeEl) continue
        const targetId = nodeEl.getAttribute('data-node-id')
        if (!targetId || targetId === node.id || !validDragTargetIds.has(targetId)) continue
        nodeEl.classList.add('net-drag-target')
        const targetRect = nodeEl.querySelector('rect')
        if (targetRect) {
          targetRect.setAttribute('data-orig-stroke', targetRect.getAttribute('stroke') || '#888')
          targetRect.setAttribute('data-orig-stroke-width', targetRect.getAttribute('stroke-width') || '1.5')
          targetRect.setAttribute('stroke', '#ff0')
          targetRect.setAttribute('stroke-width', '2.5')
        }
        break
      }
    })
    .on('end', function (event: d3.D3DragEvent<SVGGElement, unknown, unknown>) {
      // Remove dashed line
      svgEl!.querySelector('.net-drag-line')?.remove()
      // Restore dragged node border
      const isSelected = node.id === selectedNodeId
      d3.select(this).select('rect')
        .attr('stroke', isSelected ? '#4a90d9' : color)
        .attr('stroke-width', isSelected ? 2.5 : 1.5)
      // Clear target highlights
      svgEl!.querySelectorAll('.net-drag-target').forEach(el => {
        el.classList.remove('net-drag-target')
        const rect = (el as SVGGElement).querySelector('rect')
        if (rect) {
          const origStroke = rect.getAttribute('data-orig-stroke')
          const origWidth = rect.getAttribute('data-orig-stroke-width')
          if (origStroke) rect.setAttribute('stroke', origStroke)
          if (origWidth) rect.setAttribute('stroke-width', origWidth)
        }
      })
      // Find target and create edge
      const els = document.elementsFromPoint(event.sourceEvent.clientX, event.sourceEvent.clientY)
      for (const el of els) {
        const nodeEl = (el as Element).closest?.('.net-node') as HTMLElement | null
        if (!nodeEl) continue
        const targetId = nodeEl.getAttribute('data-node-id')
        if (!targetId || targetId === node.id || !validDragTargetIds.has(targetId)) continue
        onAddEdge?.(node.id, targetId)
        break
      }
    })
  nodeG.call(layerDrag as any)
}

// Also add drag to child nodes inside blocks (only layer kind)
// In the child rendering loop (for (const child of node.children)), after existing childG event
// handlers but before port circles (around line 447), add a separate drag instance:
if (!readOnly && child.kind !== 'input' && child.kind !== 'output') {
  const childDrag = d3.drag<SVGGElement, unknown>()
    .on('start', function (event: d3.D3DragEvent<SVGGElement, unknown, unknown>) {
      d3.select(this).raise()
      d3.select(this).select('rect').attr('stroke', '#ff0').attr('stroke-width', 2.5)
      const transform = d3.zoomTransform(svgEl!)
      const r = container.getBoundingClientRect()
      const sx = (event.sourceEvent.clientX - r.left - transform.x) / transform.k
      const sy = (event.sourceEvent.clientY - r.top - transform.y) / transform.k
      g.append('line')
        .attr('class', 'net-drag-line')
        .attr('x1', sx).attr('y1', sy)
        .attr('x2', sx).attr('y2', sy)
        .attr('stroke', '#4a90d9').attr('stroke-width', 2)
        .attr('stroke-dasharray', '4,2')
    })
    .on('drag', function (event: d3.D3DragEvent<SVGGElement, unknown, unknown>) {
      const transform = d3.zoomTransform(svgEl!)
      const r = container.getBoundingClientRect()
      const mx = (event.sourceEvent.clientX - r.left - transform.x) / transform.k
      const my = (event.sourceEvent.clientY - r.top - transform.y) / transform.k
      svgEl!.querySelector('.net-drag-line')?.setAttribute('x2', String(mx))
      svgEl!.querySelector('.net-drag-line')?.setAttribute('y2', String(my))
      // Detect target (same pattern as top-level drag)
      const els = document.elementsFromPoint(event.sourceEvent.clientX, event.sourceEvent.clientY)
      svgEl!.querySelectorAll('.net-drag-target').forEach(el => {
        el.classList.remove('net-drag-target')
        const r2 = (el as SVGGElement).querySelector('rect')
        if (r2) {
          const os = r2.getAttribute('data-orig-stroke')
          const ow = r2.getAttribute('data-orig-stroke-width')
          if (os) r2.setAttribute('stroke', os)
          if (ow) r2.setAttribute('stroke-width', ow)
        }
      })
      for (const el of els) {
        const nodeEl = (el as Element).closest?.('.net-node') as HTMLElement | null
        if (!nodeEl) continue
        const tid = nodeEl.getAttribute('data-node-id')
        if (!tid || tid === child.id || !validDragTargetIds.has(tid)) continue
        nodeEl.classList.add('net-drag-target')
        const tr = nodeEl.querySelector('rect')
        if (tr) {
          tr.setAttribute('data-orig-stroke', tr.getAttribute('stroke') || '#888')
          tr.setAttribute('data-orig-stroke-width', tr.getAttribute('stroke-width') || '1.5')
          tr.setAttribute('stroke', '#ff0')
          tr.setAttribute('stroke-width', '2.5')
        }
        break
      }
    })
    .on('end', function (event: d3.D3DragEvent<SVGGElement, unknown, unknown>) {
      svgEl!.querySelector('.net-drag-line')?.remove()
      const isSel = child.id === selectedNodeId
      d3.select(this).select('rect')
        .attr('stroke', isSel ? '#4a90d9' : cc)
        .attr('stroke-width', isSel ? 2.5 : 1.5)
      svgEl!.querySelectorAll('.net-drag-target').forEach(el => {
        el.classList.remove('net-drag-target')
        const r2 = (el as SVGGElement).querySelector('rect')
        if (r2) {
          const os = r2.getAttribute('data-orig-stroke')
          const ow = r2.getAttribute('data-orig-stroke-width')
          if (os) r2.setAttribute('stroke', os)
          if (ow) r2.setAttribute('stroke-width', ow)
        }
      })
      const els = document.elementsFromPoint(event.sourceEvent.clientX, event.sourceEvent.clientY)
      for (const el of els) {
        const nodeEl = (el as Element).closest?.('.net-node') as HTMLElement | null
        if (!nodeEl) continue
        const tid = nodeEl.getAttribute('data-node-id')
        if (!tid || tid === child.id || !validDragTargetIds.has(tid)) continue
        onAddEdge?.(child.id, tid)
        break
      }
    })
  childG.call(childDrag as any)
}
```

- [ ] **Step 2: Add data-node-kind attribute to node groups for target filtering, and pre-build valid target set**

In the render function, near the top after `const g = svg.append('g').attr('class', 'canvas-content')` (around line 195), add a Set of valid drag target IDs (all non-input, non-output nodes):

```typescript
// Pre-build set of valid drag-connect target IDs (exclude input/output)
const validDragTargetIds = new Set<string>()
for (const node of topNodes) {
  if (node.kind !== 'input' && node.kind !== 'output') {
    validDragTargetIds.add(node.id)
  }
  if (node.children) {
    for (const child of node.children) {
      if (child.kind !== 'input' && child.kind !== 'output') {
        validDragTargetIds.add(child.id)
      }
    }
  }
}
```

Then find where `nodeG` is created for top-level nodes with `data-node-id` (around line 341). Add `data-node-kind`:

```typescript
const nodeG = g.append('g')
  .attr('class', 'net-node')
  .attr('data-node-id', node.id)
  .attr('data-node-kind', node.kind)
  .style('cursor', 'pointer')
```

And find where `childG` is created for children inside blocks (around line 396). Add `data-node-kind`:

```typescript
const childG = nodeG.append('g')
  .attr('class', 'net-node')
  .attr('data-node-id', child.id)
  .attr('data-node-kind', child.kind)
  .style('cursor', 'pointer')
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/editors/NetworkCanvas.tsx
git commit -m "feat: add drag-to-connect between layer nodes in network canvas"
```

---

### Task 3: Manual verification

- [ ] **Step 1: Build and launch the app**

```bash
npm run dev
```

- [ ] **Step 2: Verify mind map drag-to-reorder**

1. Open a `.mind.json` file with 3+ sibling nodes
2. Drag a node between two other siblings
3. **Expected:** siblings shift down to make room during drag, drop reorders nodes, tree re-renders with new order
4. Verify the `.mind.json` file reflects the new order after save

- [ ] **Step 3: Verify mind map drag-to-reparent**

1. Drag a node directly onto another node (not root)
2. **Expected:** target node shows yellow border during hover, drop makes dragged node a child of target
3. Verify the tree re-renders with the node under the new parent

- [ ] **Step 4: Verify mind map edge cases**

1. Try dragging root node onto another node → should be rejected (root cannot be reparented)
2. Try dragging a node onto its own child → should be rejected (no circular)
3. Drag a node outside the canvas → should snap back

- [ ] **Step 5: Verify network drag-to-connect**

1. Open a `.net.json` file with multiple layer nodes
2. Drag a layer node onto another layer node
3. **Expected:** target gets yellow border during drag, dashed line follows cursor, drop creates edge (visible as arrow between nodes)
4. Drag onto input/output node → should be rejected (no highlight, no edge created)

- [ ] **Step 6: Verify network edge case**

1. Drag a layer onto itself → should be rejected
2. Drag a layer onto a node that already has an edge from the same source → `ADD_EDGE` reducer skips duplicate

---

### Task 4: Cleanup — remove stale visual companion server

- [ ] **Step 1: Stop the visual companion server**

```bash
bash /Users/wangyan/.claude/plugins/cache/claude-plugins-official/superpowers/5.1.0/skills/brainstorming/scripts/stop-server.sh /Users/wangyan/Desktop/note/.superpowers/brainstorm/76408-1780475363
```
