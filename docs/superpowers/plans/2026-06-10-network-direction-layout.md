# Network Direction-Aware Block Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add direction-aware block layout (horizontal/vertical) to the network graph editor, enabling swimlane-style port distribution and cleaner edge routing for multi-branch network architectures.

**Architecture:** Add an optional `direction` field to `GraphNode` (schema). Pass it to `runLayout()` which maps to dagre's `rankdir`. Replace `portX` with direction-aware `getPortXY`. Add `autoDetectDirection` heuristic. Render merge bars for multi-input nodes. Use orthogonal routing for inter-block skip edges.

**Tech Stack:** TypeScript, React, D3.js, dagre (graph layout library)

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/main/schemas/note-types.ts:133-147` | Add `BlockDirection` type + `direction` field to `GraphNode` |
| `src/renderer/src/components/editors/NetworkCanvas.tsx:30-62` | Modify `runLayout()` to accept direction param |
| `src/renderer/src/components/editors/NetworkCanvas.tsx:30-62` | Add `autoDetectDirection()` helper |
| `src/renderer/src/components/editors/NetworkCanvas.tsx:248-317` | Replace `portX` with `getPortXY()`, update `renderEdge()` for direction |
| `src/renderer/src/components/editors/NetworkCanvas.tsx:137-168` | Pass direction to block sub-layouts, direction-aware padding |
| `src/renderer/src/components/editors/NetworkCanvas.tsx:341-362` | Update top-level edge rendering for inter-block skip edges |
| `src/renderer/src/components/editors/NetworkCanvas.tsx:364-843` | Add merge bar rendering before multi-input nodes |
| `src/renderer/src/components/editors/NetworkPanel.tsx:207-216` | Add direction `<select>` dropdown in Block Settings |

---

### Task 1: Add `BlockDirection` type and `direction` field to `GraphNode`

**Files:**
- Modify: `src/main/schemas/note-types.ts:133-147`

- [ ] **Step 1: Add type alias and field**

In `src/main/schemas/note-types.ts`, add the type alias after `NodeKind` (line 133), and add the field to `GraphNode`:

```ts
// After line 133 (export type NodeKind = ...)
export type BlockDirection = 'horizontal' | 'vertical'

// In GraphNode interface (after line 146, before closing brace)
export interface GraphNode {
  id: string
  kind: NodeKind
  label: string
  layerType?: string
  params?: LayerParams
  inputShape?: string
  outputShape?: string
  repeat?: number
  children?: GraphNode[]
  internalEdges?: GraphEdge[]
  codeMapping?: CodeMapping
  direction?: BlockDirection  // only meaningful for kind: 'block'; auto-detected if omitted
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `cd /Users/wangyan/Desktop/note && npx tsc --noEmit --project tsconfig.web.json 2>&1 | head -20`
Expected: No new errors related to this change.

- [ ] **Step 3: Commit**

```bash
git add src/main/schemas/note-types.ts
git commit -m "feat: add BlockDirection type and direction field to GraphNode"
```

---

### Task 2: Add `direction` parameter to `runLayout()`

**Files:**
- Modify: `src/renderer/src/components/editors/NetworkCanvas.tsx:30-62`

- [ ] **Step 1: Update `runLayout()` signature and setGraph call**

Change the `runLayout` function at line 30:

```ts
function runLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  nodeSizes?: Map<string, { width: number; height: number }>,
  direction: BlockDirection = 'vertical'
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph()
  g.setGraph({
    rankdir: direction === 'horizontal' ? 'LR' : 'TB',
    nodesep: 40, edgesep: 20, ranksep: 60, marginx: 40, marginy: 30
  })
  g.setDefaultEdgeLabel(() => ({}))
  // ... rest unchanged from here
}
```

The import of `BlockDirection` at the top of the file needs to be added. The file already imports from `note-types`:

```ts
import type { NetworkDocument, GraphNode, GraphEdge } from '../../../../main/schemas/note-types'
```

Change to:

```ts
import type { NetworkDocument, GraphNode, GraphEdge, BlockDirection } from '../../../../main/schemas/note-types'
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/wangyan/Desktop/note && npx tsc --noEmit --project tsconfig.web.json 2>&1 | grep -i "NetworkCanvas\|error" | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/editors/NetworkCanvas.tsx
git commit -m "feat: add direction parameter to runLayout for dagre rankdir control"
```

---

### Task 3: Add `autoDetectDirection()` helper

**Files:**
- Modify: `src/renderer/src/components/editors/NetworkCanvas.tsx` (add after `runLayout`)

- [ ] **Step 1: Add `autoDetectDirection` function**

Add the function between `runLayout` (ends at line ~62) and the `NetworkCanvas` component:

```ts
function autoDetectDirection(
  children: GraphNode[],
  internalEdges?: GraphEdge[]
): BlockDirection {
  const outDegree = new Map<string, number>()
  for (const e of (internalEdges ?? [])) {
    outDegree.set(e.source, (outDegree.get(e.source) ?? 0) + 1)
  }
  for (const [, count] of outDegree) {
    if (count >= 2) return 'horizontal'
  }
  return 'vertical'
}
```

- [ ] **Step 2: Verify**

Run: `cd /Users/wangyan/Desktop/note && npx tsc --noEmit --project tsconfig.web.json 2>&1 | grep -i "autoDetectDirection\|error" | head -10`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/editors/NetworkCanvas.tsx
git commit -m "feat: add autoDetectDirection helper for block layout direction"
```

---

### Task 4: Add `getPortXY()` and update `renderEdge()` for direction-aware ports

**Files:**
- Modify: `src/renderer/src/components/editors/NetworkCanvas.tsx:248-317`

- [ ] **Step 1: Add `getPortXY` helper above `renderEdge`**

Add this function right before `renderEdge` (before line 248):

```ts
const getPortXY = (
  cx: number, cy: number,
  w: number, h: number,
  idx: number, total: number,
  edge: 'in' | 'out',
  direction: BlockDirection
): { x: number; y: number } => {
  if (direction === 'horizontal') {
    // Ports on left (in) or right (out), spread vertically
    const py = total > 1
      ? cy - h / 2 + 12 + (h - 24) * (idx + 0.5) / total
      : cy
    const px = edge === 'in' ? cx - w / 2 : cx + w / 2
    return { x: px, y: py }
  }
  // Vertical: ports on top (in) or bottom (out), spread horizontally
  const px = total > 1
    ? cx - w / 2 + 12 + (w - 24) * (idx + 0.5) / total
    : cx
  const py = edge === 'in' ? cy - h / 2 : cy + h / 2
  return { x: px, y: py }
}
```

- [ ] **Step 2: Replace `portX` usage inside `renderEdge`**

Inside the `renderEdge` function (line 248), replace lines 263-268:

Current (remove):
```ts
const portX = (cx: number, w: number, idx: number, total: number) =>
  total > 1 ? cx - w / 2 + 12 + (w - 24) * (idx + 0.5) / total : cx
const x1 = portX(srcPos.x, srcW, srcPortIdx, srcPortTotal)
const y1 = srcPos.y + srcH / 2
const x2 = portX(tgtPos.x, tgtW, tgtPortIdx, tgtPortTotal)
const y2 = tgtPos.y - tgtH / 2
```

Replace with:
```ts
const srcDir = srcDirection ?? 'vertical'
const tgtDir = tgtDirection ?? 'vertical'
const srcPort = getPortXY(srcPos.x, srcPos.y, srcW, srcH, srcPortIdx, srcPortTotal, 'out', srcDir)
const tgtPort = getPortXY(tgtPos.x, tgtPos.y, tgtW, tgtH, tgtPortIdx, tgtPortTotal, 'in', tgtDir)
const { x: x1, y: y1 } = srcPort
const { x: x2, y: y2 } = tgtPort
```

- [ ] **Step 3: Add `srcDirection` and `tgtDirection` parameters to `renderEdge`**

Update the `renderEdge` signature to accept direction info. Add two new parameters after `tgtPortTotal`:

```ts
const renderEdge = (
  edge: GraphEdge,
  srcPos: { x: number; y: number },
  tgtPos: { x: number; y: number },
  srcW: number,
  srcH: number,
  tgtW: number,
  tgtH: number,
  parentG: d3.Selection<SVGGElement, unknown, null, undefined>,
  srcPortIdx = 0,
  srcPortTotal = 1,
  tgtPortIdx = 0,
  tgtPortTotal = 1,
  srcDirection?: BlockDirection,
  tgtDirection?: BlockDirection
) => {
```

- [ ] **Step 4: Verify**

Run: `cd /Users/wangyan/Desktop/note && npx tsc --noEmit --project tsconfig.web.json 2>&1 | grep -i "NetworkCanvas\|error TS" | head -20`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/editors/NetworkCanvas.tsx
git commit -m "feat: add direction-aware getPortXY and update renderEdge port logic"
```

---

### Task 5: Pass direction to block sub-layouts with direction-aware padding

**Files:**
- Modify: `src/renderer/src/components/editors/NetworkCanvas.tsx:137-168`

- [ ] **Step 1: Resolve block direction and pass to runLayout**

In the block sub-layout loop (lines 137-169), change line 141 from:

```ts
const childPositions = runLayout(children, internalEdges)
```

To:

```ts
const blockDirection = node.direction ?? autoDetectDirection(children, internalEdges)
const childPositions = runLayout(children, internalEdges, undefined, blockDirection)
```

- [ ] **Step 2: Make padding direction-aware**

Replace lines 158-166 (padding and offset calculation):

Current:
```ts
const bw = Math.max(BLOCK_MIN_W, contentW + BLOCK_PAD * 2)
const bh = BLOCK_HEADER_H + contentH + BLOCK_PAD + BLOCK_BOTTOM_PAD

blockLayouts.set(node.id, {
  positions: childPositions,
  width: bw,
  height: bh,
  childOffsetX: BLOCK_PAD - cMinX,
  childOffsetY: BLOCK_HEADER_H + BLOCK_PAD - cMinY,
})
```

Replace with:
```ts
const padX = blockDirection === 'horizontal' ? BLOCK_PAD * 2 : BLOCK_PAD
const padY = blockDirection === 'vertical' ? BLOCK_PAD * 2 : BLOCK_PAD
const bw = Math.max(BLOCK_MIN_W, contentW + padX * 2)
const bh = BLOCK_HEADER_H + contentH + padY + BLOCK_BOTTOM_PAD

blockLayouts.set(node.id, {
  positions: childPositions,
  width: bw,
  height: bh,
  childOffsetX: padX - cMinX,
  childOffsetY: BLOCK_HEADER_H + padY - cMinY,
  direction: blockDirection,
})
```

- [ ] **Step 3: Add `direction` to the `BlockLayout` type**

At line 126-132, update the `BlockLayout` type:

```ts
type BlockLayout = {
  positions: Map<string, { x: number; y: number }>
  width: number
  height: number
  childOffsetX: number
  childOffsetY: number
  direction: BlockDirection
}
```

- [ ] **Step 4: Pass direction info when rendering internal edges**

In the block internal edge rendering section (lines ~420-453), the `renderEdge` calls don't currently pass direction. Since internal edges are within a single block, the direction is the block's direction. Add `srcDirection` and `tgtDirection` to the `renderEdge` calls:

For internal edges around line 447-452, add the block direction:
```ts
renderEdge(ie,
  { x: childOffsetX + cpSrc.x, y: childOffsetY + cpSrc.y },
  { x: childOffsetX + cpTgt.x, y: childOffsetY + cpTgt.y },
  cSrcW, cSrcH, cTgtW, cTgtH, nodeG,
  si, intOutDeg.get(ie.source) ?? 1,
  ti, intInDeg.get(ie.target) ?? 1,
  blockLayout.direction, blockLayout.direction)
```

- [ ] **Step 5: Verify**

Run: `cd /Users/wangyan/Desktop/note && npx tsc --noEmit --project tsconfig.web.json 2>&1 | grep -i "error TS" | head -20`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/editors/NetworkCanvas.tsx
git commit -m "feat: pass block direction to sub-layouts with direction-aware padding"
```

---

### Task 6: Add merge bar rendering for multi-input nodes

**Files:**
- Modify: `src/renderer/src/components/editors/NetworkCanvas.tsx:341-362` (top-level edge loop area), and `364-843` (node rendering loop)

- [ ] **Step 1: Add merge bar rendering logic**

Add this helper function inside the `render` callback, before the node rendering loop (before line 364):

```ts
// Compute which nodes get a merge bar (3+ incoming edges)
const mergeBarNodes = new Map<string, { count: number; inEdges: Array<{ edge: GraphEdge; sourceX: number; sourceY: number }> }>()
for (const edge of topEdges) {
  let entry = mergeBarNodes.get(edge.target)
  if (!entry) {
    entry = { count: 0, inEdges: [] }
    mergeBarNodes.set(edge.target, entry)
  }
  entry.count++
  const srcPos = positions.get(edge.source)
  if (srcPos) {
    entry.inEdges.push({
      edge,
      sourceX: offsetX + srcPos.x,
      sourceY: offsetY + srcPos.y,
    })
  }
}
```

- [ ] **Step 2: Render merge bars in the node rendering loop**

In the node rendering loop (line 365), at the beginning of each node iteration, after getting `pos` and before computing sizes:

Insert after `if (!pos) continue` (after line 367):

```ts
      // Render merge bar if this node has 3+ incoming edges
      const mergeInfo = mergeBarNodes.get(node.id)
      const renderMergeBar = mergeInfo && mergeInfo.count >= 3
      if (renderMergeBar && mergeInfo) {
        const nodeSize = getNodeSize(node)
        const barW = nodeSize.w
        const barH = 10
        const barGap = 20  // gap between bar bottom and node top
        const nTop = offsetY + pos.y - nodeSize.h / 2
        const barX = offsetX + pos.x - barW / 2
        const barY = nTop - barGap - barH

        const barG = g.append('g').attr('class', 'net-merge-bar')

        // Bar rectangle
        barG.append('rect')
          .attr('x', barX).attr('y', barY).attr('width', barW).attr('height', barH)
          .attr('rx', 5).attr('fill', '#ffeb3b').attr('opacity', 0.3)
          .attr('stroke', '#ffeb3b').attr('stroke-width', 0.5)

        // Port dots on bar
        const portCount = mergeInfo.count
        mergeInfo.inEdges.forEach((inEdge, i) => {
          const px = portCount > 1
            ? barX + 6 + (barW - 12) * (i + 0.5) / portCount
            : barX + barW / 2
          barG.append('circle')
            .attr('cx', px).attr('cy', barY + barH / 2)
            .attr('r', 3).attr('fill', '#4a90d9').attr('stroke', '#333').attr('stroke-width', 0.5)

          // Reroute incoming edge to hit bar port instead of node top
          // (We'll handle this in Task 9 — orthogonal routing)
        })

        // Single thick edge from bar center down to node top
        barG.append('line')
          .attr('x1', barX + barW / 2).attr('y1', barY + barH)
          .attr('x2', offsetX + pos.x).attr('y2', nTop)
          .attr('stroke', '#673ab7').attr('stroke-width', 2)
        barG.append('polygon')
          .attr('points', `${offsetX + pos.x - 4},${nTop - 4} ${offsetX + pos.x},${nTop} ${offsetX + pos.x + 4},${nTop - 4}`)
          .attr('fill', '#673ab7')
      }
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd /Users/wangyan/Desktop/note && npx tsc --noEmit --project tsconfig.web.json 2>&1 | grep -i "mergeBar\|error TS" | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/editors/NetworkCanvas.tsx
git commit -m "feat: add merge bar rendering for nodes with 3+ incoming edges"
```

---

### Task 7: Add orthogonal edge routing for inter-block skip edges

**Files:**
- Modify: `src/renderer/src/components/editors/NetworkCanvas.tsx:341-362`

- [ ] **Step 1: Add orthogonal path generation helper**

Add this helper function inside the `render` callback, before the edge rendering section:

```ts
    // Generate orthogonal path points for inter-block skip edges
    const makeOrthogonalPath = (
      x1: number, y1: number,
      x2: number, y2: number,
      srcDir: BlockDirection
    ): { points: string } => {
      const midY = (y1 + y2) / 2
      const points: Array<[number, number]> = [[x1, y1]]

      if (srcDir === 'horizontal') {
        // Source in horizontal block: go right a bit → down → across → into target
        const bendX = x1 + 30
        points.push([bendX, y1])
        points.push([bendX, midY])
        points.push([x2, midY])
      } else {
        // Source in vertical block: go down a bit → across → down into target
        const bendY = y1 + 30
        points.push([x1, bendY])
        points.push([x1 + (x2 - x1) / 2, bendY])
        points.push([x1 + (x2 - x1) / 2, y2])
      }
      points.push([x2, y2])
      return { points: points.map(p => p.join(',')).join(' ') }
    }
```

- [ ] **Step 2: Use polyline for skip edges**

In the top-level edge rendering loop (lines 341-362), after computing `x1,y1,x2,y2` (inside `renderEdge` after step 2 of Task 4), replace the skip edge rendering block (lines 279-291):

Currently skip edges use `<line>` directly. Replace the skip edge block to use polyline when it's a skip edge:

Inside the `renderEdge` function, for skip edges (the `edge.style === 'skip'` branch at line 279):

Replace:
```ts
      if (edge.style === 'skip') {
        // Wider invisible hit area for easier clicking
        edgeG.append('line')
          .attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2)
          .attr('stroke', 'transparent').attr('stroke-width', 12)
          .style('cursor', 'pointer')
        edgeG.append('line')
          .attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2)
          .attr('stroke', skipColor).attr('stroke-width', strokeW)
          .attr('stroke-dasharray', '4,3')
        edgeG.append('polygon')
          .attr('points', `${x2-4},${y2-4} ${x2},${y2} ${x2+4},${y2-4}`)
          .attr('fill', skipColor)
```

With orthogonal polyline for skip edges:

```ts
      if (edge.style === 'skip') {
        const ortho = makeOrthogonalPath(x1, y1, x2, y2, srcDir ?? 'vertical')

        // Larger invisible polyline for hit area
        edgeG.append('polyline')
          .attr('points', ortho.points)
          .attr('stroke', 'transparent').attr('stroke-width', 12).attr('fill', 'none')
          .style('cursor', 'pointer')

        // Visible dashed polyline
        edgeG.append('polyline')
          .attr('points', ortho.points)
          .attr('stroke', skipColor).attr('stroke-width', strokeW)
          .attr('stroke-dasharray', '4,3').attr('fill', 'none')

        // Arrow at end
        edgeG.append('polygon')
          .attr('points', `${x2-4},${y2-4} ${x2},${y2} ${x2+4},${y2-4}`)
          .attr('fill', skipColor)
```

- [ ] **Step 3: Also update forward edge target for merge bar nodes**

In the top-level edge loop (around lines 341-362), when computing target positions for nodes that have merge bars, adjust `y2` to hit the merge bar instead of the node top:

After computing `srcPos` and `tgtPos`, and before calling `renderEdge`, add:

```ts
      // If target node has a merge bar, edge hits the bar, not the node
      let adjustedTgtPos = { x: offsetX + tgtPos.x, y: offsetY + tgtPos.y }
      const mergeInfo = mergeBarNodes.get(edge.target)
      if (mergeInfo && mergeInfo.count >= 3) {
        const tgtNode = topNodes.find(n => n.id === edge.target)
        if (tgtNode && tgtPos) {
          const tgtSize = getNodeSize(tgtNode)
          const barGap = 20
          const barH = 10
          adjustedTgtPos = {
            x: offsetX + tgtPos.x,
            y: offsetY + tgtPos.y - tgtSize.h / 2 - barGap - barH / 2,
          }
        }
      }

      renderEdge(edge,
        { x: offsetX + srcPos.x, y: offsetY + srcPos.y },
        adjustedTgtPos,
        srcW, srcH, tgtW, tgtH, g,
        si, outDegree.get(edge.source) ?? 1,
        ti, inDegree.get(edge.target) ?? 1)
```

- [ ] **Step 4: Verify TypeScript**

Run: `cd /Users/wangyan/Desktop/note && npx tsc --noEmit --project tsconfig.web.json 2>&1 | grep -i "error TS" | head -20`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/editors/NetworkCanvas.tsx
git commit -m "feat: add orthogonal edge routing for inter-block skip edges"
```

---

### Task 8: Add direction `<select>` dropdown in NetworkPanel

**Files:**
- Modify: `src/renderer/src/components/editors/NetworkPanel.tsx:207-216`

- [ ] **Step 1: Add direction dropdown after Repeat field**

In the Block Settings section, after the Repeat `<div className="network-panel-field">` closing tag (after line 216), and before the `</div>` closing of `network-panel-params-grid` (line 217), insert:

```tsx
                <div className="network-panel-field" style={{ gridColumn: 'span 2' }}>
                  <label className="network-panel-field-label">Direction</label>
                  <select
                    className="network-panel-input"
                    value={node.direction ?? 'auto'}
                    onChange={(e) => {
                      onUpdateNode(
                        node.id,
                        'direction',
                        e.target.value === 'auto' ? undefined : e.target.value
                      )
                    }}
                  >
                    <option value="auto">Auto (detect)</option>
                    <option value="vertical">Vertical (top→bottom)</option>
                    <option value="horizontal">Horizontal (left→right)</option>
                  </select>
                </div>
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd /Users/wangyan/Desktop/note && npx tsc --noEmit --project tsconfig.web.json 2>&1 | grep -i "error TS" | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/editors/NetworkPanel.tsx
git commit -m "feat: add direction select dropdown to block settings panel"
```

---

### Task 9: Top-level edge rendering — pass direction for source nodes

**Files:**
- Modify: `src/renderer/src/components/editors/NetworkCanvas.tsx:341-362`

- [ ] **Step 1: Pass direction info to renderEdge for top-level edges**

In the top-level edge rendering loop (lines 341-362), update the `renderEdge` calls to pass direction info from source/target blocks:

```ts
    for (const edge of topEdges) {
      const srcPos = positions.get(edge.source)
      const tgtPos = positions.get(edge.target)
      if (!srcPos || !tgtPos) continue

      const srcNode = topNodes.find(n => n.id === edge.source)
      const tgtNode = topNodes.find(n => n.id === edge.target)
      const { w: srcW, h: srcH } = getNodeSize(srcNode)
      const { w: tgtW, h: tgtH } = getNodeSize(tgtNode)

      const si = outIdx.get(edge.source) ?? 0
      outIdx.set(edge.source, si + 1)
      const ti = inIdx.get(edge.target) ?? 0
      inIdx.set(edge.target, ti + 1)

      // Determine direction for top-level source/target nodes
      const srcDir = srcNode?.kind === 'block'
        ? (srcNode.direction ?? blockLayouts.get(edge.source)?.direction ?? 'vertical')
        : 'vertical'
      const tgtDir = tgtNode?.kind === 'block'
        ? (tgtNode.direction ?? blockLayouts.get(edge.target)?.direction ?? 'vertical')
        : 'vertical'

      // If target node has a merge bar, edge hits the bar, not the node
      let adjustedTgtPos = { x: offsetX + tgtPos.x, y: offsetY + tgtPos.y }
      const mergeInfo = mergeBarNodes.get(edge.target)
      if (mergeInfo && mergeInfo.count >= 3) {
        const tgtSize = getNodeSize(tgtNode)
        const barGap = 20
        const barH = 10
        adjustedTgtPos = {
          x: offsetX + tgtPos.x,
          y: offsetY + tgtPos.y - tgtSize.h / 2 - barGap - barH / 2,
        }
      }

      renderEdge(edge,
        { x: offsetX + srcPos.x, y: offsetY + srcPos.y },
        adjustedTgtPos,
        srcW, srcH, tgtW, tgtH, g,
        si, outDegree.get(edge.source) ?? 1,
        ti, inDegree.get(edge.target) ?? 1,
        srcDir, tgtDir)
    }
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd /Users/wangyan/Desktop/note && npx tsc --noEmit --project tsconfig.web.json 2>&1 | grep -i "error TS" | head -20`
Expected: No errors.

- [ ] **Step 3: Manual visual verification**

Start the dev server and open a YOLOv5n net.json to verify:
- Backbone renders as horizontal block (auto-detected)
- Neck renders as vertical
- Three head nodes have distinct lanes
- Skip edges use orthogonal routing
- Detect node shows merge bar (3 inputs)

Run dev server: `cd /Users/wangyan/Desktop/note && npm run dev`

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/editors/NetworkCanvas.tsx
git commit -m "feat: integrate direction-aware edge rendering with merge bar support"
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - [x] Schema addition (BlockDirection type + direction field) — Task 1
   - [x] Layout engine (runLayout direction param) — Task 2
   - [x] Auto-detection (autoDetectDirection) — Task 3
   - [x] Port distribution (getPortXY) — Task 4
   - [x] Block bounding box direction-aware padding — Task 5
   - [x] Merge bar rendering — Task 6
   - [x] Orthogonal edge routing for skip edges — Task 7
   - [x] NetworkPanel direction dropdown — Task 8
   - [x] Top-level edge direction pass-through — Task 9

2. **Placeholder scan:** No TBDs, TODOs, or vague instructions. All code shown in full.

3. **Type consistency:** `BlockDirection` defined in Task 1, used consistently as `'horizontal' | 'vertical'` throughout. `getPortXY` accepts `BlockDirection`. `BlockLayout` includes `direction: BlockDirection`. All `renderEdge` calls updated consistently.
