# Network Graph: Direction-Aware Block Layout & Swimlane Ports

## Problem

The current dagre `rankdir: TB` layout stacks all nodes in a single vertical column. When layers have multiple outgoing edges (e.g., YOLOv5's FPN neck has three parallel heads #17 P3/8, #20 P4/16, #23 P5/32 all feeding into Detect), skip edges from the backbone converge from different y-positions and cross, making the rendering tangled and hard to read.

## Goal

- Edges should not cross.
- When a layer has multiple outputs, ports should distribute evenly (swimlane-style).
- Blocks should support configurable direction: horizontal (left→right) or vertical (top→bottom), with auto-detection.

## Design

### 1. Schema Addition (`note-types.ts`)

Add a `BlockDirection` type and an optional `direction` field to `GraphNode`:

```ts
export type BlockDirection = 'horizontal' | 'vertical'

export interface GraphNode {
  // ... all existing fields unchanged
  direction?: BlockDirection  // only meaningful for kind: 'block'; auto-detected if omitted
}
```

- `direction` is optional. If omitted, auto-detect from topology.
- Only meaningful for `kind: 'block'` nodes.
- No migration needed — existing documents default to auto-detection (which falls back to vertical = current behavior).

### 2. Layout Engine (`NetworkCanvas.tsx` — `runLayout()`)

Add an optional `direction` parameter to `runLayout()` that maps to dagre's `rankdir`:

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
  // ... rest unchanged
}
```

Call sites:
- **Top-level layout**: unchanged (always TB — vertical stacking of blocks).
- **Block sub-layouts**: pass the block's `direction` (explicit or auto-detected).

### 3. Auto-Detection (`autoDetectDirection()`)

New helper that determines direction from topology:

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
    if (count >= 2) return 'horizontal'  // multi-output → horizontal works better
  }
  return 'vertical'
}
```

### 4. Port Distribution (`getPortXY()`)

Replace the current `portX()` with a direction-aware `getPortXY()`:

- **Vertical block (TB)**: input ports distribute horizontally along top edge, output ports along bottom edge.
- **Horizontal block (LR)**: input ports distribute vertically along left edge, output ports along right edge.

```ts
function getPortXY(
  cx: number, cy: number,
  w: number, h: number,
  idx: number, total: number,
  edge: 'in' | 'out',
  direction: BlockDirection
): { x: number; y: number }
```

### 5. Edge Routing

- **Same-block forward edges**: straight lines (current behavior, unchanged).
- **Inter-block skip edges**: use SVG `<polyline>` with orthogonal bend points to avoid crossing nodes.
  - Source in horizontal block: exit right edge → go down → turn → enter target.
  - Source in vertical block: exit bottom edge → go horizontal → turn vertical → enter target.

### 6. Merge Bar (Optional Visual Node)

When 3 or more edges target the same node, render a thin horizontal bar just above the target:

- Width = target node width, aligned at the same x position.
- Height = 10px.
- Gap = 20px above the target node's top edge.
- N evenly-spaced ports on the bar (one per incoming edge).
- A single thick edge from bar center to target node center.
- Purely visual — no data model changes.

Rendering logic:
```ts
function shouldRenderMergeBar(node: GraphNode, edges: GraphEdge[]): boolean {
  const inCount = edges.filter(e => e.target === node.id).length
  return inCount >= 3
}
```

### 7. Block Bounding Box

Existing bounding box code (`cMinX`/`cMaxX`/`cMinY`/`cMaxY`) is direction-agnostic — dagre gives node positions regardless of `rankdir`. Only the safety padding is adjusted:

```ts
const padX = direction === 'horizontal' ? BLOCK_PAD * 2 : BLOCK_PAD
const padY = direction === 'vertical'   ? BLOCK_PAD * 2 : BLOCK_PAD
```

### 8. NetworkPanel UI

Add a `<select>` dropdown in the Block Settings section (NetworkPanel.tsx, lines 193-218):

```
Direction: [Auto (detect) ▼]
           | Auto (detect) |
           | Vertical ↓    |
           | Horizontal →  |
```

- Three options: `Auto`, `Vertical`, `Horizontal`.
- Selecting "Auto" sets `direction` to `undefined` (triggers auto-detection).
- Selecting "Vertical" or "Horizontal" forces that direction.

### 9. Reducer

No changes needed. `UPDATE_NODE` is field-generic and already handles arbitrary property updates including `direction`.

## Files Changed

| File | Changes |
|------|---------|
| `src/main/schemas/note-types.ts` | +2 lines (type alias + optional field) |
| `src/renderer/src/components/editors/NetworkCanvas.tsx` | ~100 lines (runLayout direction param, getPortXY, merge bar rendering, orthogonal edge paths, autoDetectDirection) |
| `src/renderer/src/components/editors/NetworkPanel.tsx` | +15 lines (direction `<select>` dropdown) |

Total: ~120 lines across 3 files. Zero migration. Backward compatible.

## Edge Cases

1. **Block with `direction: 'horizontal'` but only one child**: renders fine (LR layout with one node).
2. **Mix of horizontal and vertical blocks**: each block is an independent dagre sub-layout; top-level stays TB.
3. **Port distribution with 1 edge**: port at center (no division), same as current behavior.
4. **Merge bar threshold**: exactly 1 or 2 inputs → no bar (keeps simple models clean).
