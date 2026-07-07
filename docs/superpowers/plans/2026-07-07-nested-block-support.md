# Nested Block Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support one extra level of block nesting in `.net.json` — blocks can contain child blocks, which in turn can contain layers (max depth: block → block → layer).

**Architecture:** Add recursive tree-traversal helpers to the reducer and canvas renderer. Each block independently runs dagre on its children; nested blocks recursively compute their own sub-layout. The data model (`GraphNode.children`) already supports recursion — this plan adds the code paths that operate on the tree.

**Tech Stack:** TypeScript (React + d3/dagre), Python (argparse for scripts), Vitest (TS tests), pytest (Python tests)

## Global Constraints

- Max nesting depth: 2 block levels (top-level block → child block → layer). Child blocks may NOT contain further blocks.
- All `.net.json` modifications go through scripts (no direct file writes).
- Label length ≤ 20 characters on all node kinds.
- Immutability: reducer must not mutate original document.
- Scripts must use `lib.file_utils` and `lib.schemas` for loading/saving.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/renderer/src/components/editors/networkReducer.ts` | Reducer with recursive tree helpers for ADD/DELETE/UPDATE_NODE |
| `src/renderer/src/components/editors/NetworkCanvas.tsx` | Recursive BlockLayout computation + nested block rendering |
| `src/renderer/src/components/editors/NetworkEditor.tsx` | Smart "Add Block" nesting + recursive selection lookup |
| `src/renderer/src/components/editors/NetworkPanel.tsx` | Show nested blocks in child list with block indicator |
| `tests/renderer/networkReducer.test.ts` | Reducer tests for nested node operations |
| `skills/network-graph/scripts/add_block.py` | Accept `--parent <block-id>` for nested creation |
| `skills/network-graph/scripts/add_node_to_block.py` | Recursive search across `children` arrays |
| `skills/network-graph/scripts/delete_node.py` | Recursive removal from `children` + `internalEdges` cleanup |
| `skills/network-graph/tests/test_add_block.py` | Test for `--parent` flag |
| `skills/network-graph/tests/test_delete_node.py` | Test for recursive removal from nested block |

---

### Task 1: Add recursive tree helpers to networkReducer

**Files:**
- Modify: `src/renderer/src/components/editors/networkReducer.ts`

**Interfaces:**
- Produces: `findBlockInTree(nodes: GraphNode[], id: string): GraphNode | null`
- Produces: `removeNodeFromTree(nodes: GraphNode[], id: string): { nodes: GraphNode[]; removed: boolean }`
- Produces: `updateNodeInTree(nodes: GraphNode[], nodeId: string, updater: (n: GraphNode) => GraphNode): GraphNode[]`

- [ ] **Step 1: Add `findBlockInTree` helper**

Add after the imports, before the `cloneDoc` function:

```typescript
/** Recursively find a block node by id anywhere in the tree. */
function findBlockInTree(nodes: GraphNode[], id: string): GraphNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children) {
      const found = findBlockInTree(n.children, id)
      if (found) return found
    }
  }
  return null
}
```

- [ ] **Step 2: Add `removeNodeFromTree` helper**

```typescript
/** Recursively remove a node by id from the tree. Returns new nodes array and whether a removal happened. */
function removeNodeFromTree(
  nodes: GraphNode[],
  id: string
): { nodes: GraphNode[]; removed: boolean } {
  let removed = false
  const filtered = nodes.filter(n => {
    if (n.id === id) {
      removed = true
      return false
    }
    return true
  })
  if (removed) return { nodes: filtered, removed: true }

  // Recurse into children
  return {
    nodes: filtered.map(n => {
      if (!n.children) return n
      const result = removeNodeFromTree(n.children, id)
      if (!result.removed) return n
      // Clean internalEdges referencing the removed node
      const cleanEdges = (n.internalEdges ?? []).filter(
        e => e.source !== id && e.target !== id
      )
      return { ...n, children: result.nodes, internalEdges: cleanEdges }
    }),
    removed: false,
  }
}
```

- [ ] **Step 3: Add `updateNodeInTree` helper**

```typescript
/** Recursively map nodes, applying updater when nodeId matches. */
function updateNodeInTree(
  nodes: GraphNode[],
  nodeId: string,
  updater: (n: GraphNode) => GraphNode
): GraphNode[] {
  return nodes.map(n => {
    if (n.id === nodeId) return updater(n)
    if (n.children) {
      const childIdx = n.children.findIndex(c => c.id === nodeId)
      if (childIdx !== -1) {
        // Direct child match — update inline
        const newChildren = [...n.children]
        newChildren[childIdx] = updater(n.children[childIdx])
        return { ...n, children: newChildren }
      }
      // Recurse deeper
      return { ...n, children: updateNodeInTree(n.children, nodeId, updater) }
    }
    return n
  })
}
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/editors/networkReducer.ts
git commit -m "refactor: add recursive tree helpers to networkReducer"
```

---

### Task 2: Update reducer actions to use recursive helpers

**Files:**
- Modify: `src/renderer/src/components/editors/networkReducer.ts`

**Interfaces:**
- Consumes: `findBlockInTree`, `removeNodeFromTree`, `updateNodeInTree` (from Task 1)

- [ ] **Step 1: Update `ADD_NODE` with `parentId`**

Replace the `ADD_NODE` case. The current handler (lines 34-63) only checks top-level `children`. Replace the `if (action.parentId)` block:

```typescript
case 'ADD_NODE': {
  const cloned = cloneDoc(doc)
  const newNode: GraphNode = {
    id: action.nodeId ?? uuidv4(),
    kind: action.kind ?? 'layer',
    label: action.name ?? action.layerType ?? 'New Node',
    layerType: action.layerType,
    params: {},
  }
  // New block nodes get children/edges arrays
  if (action.kind === 'block') {
    newNode.children = []
  }
  // If parentId is set, add as child of that block (recursive lookup)
  if (action.parentId) {
    const addChild = (nodes: GraphNode[]): GraphNode[] =>
      nodes.map(n => {
        if (n.id === action.parentId) {
          const prevChildren = n.children ?? []
          const newInternalEdge: GraphEdge | null = prevChildren.length > 0
            ? { id: uuidv4(), source: prevChildren[prevChildren.length - 1].id, target: newNode.id, style: 'forward' }
            : null
          return {
            ...n,
            children: [...prevChildren, newNode],
            internalEdges: newInternalEdge
              ? [...(n.internalEdges ?? []), newInternalEdge]
              : (n.internalEdges ?? []),
          }
        }
        if (n.children) return { ...n, children: addChild(n.children) }
        return n
      })
    return { ...cloned, nodes: addChild(cloned.nodes ?? []) }
  }
  return { ...cloned, nodes: [...(cloned.nodes ?? []), newNode] }
}
```

- [ ] **Step 2: Update `DELETE_NODE`**

Replace the current `DELETE_NODE` case (lines 66-73):

```typescript
case 'DELETE_NODE': {
  const cloned = cloneDoc(doc)
  const nodeId = action.nodeId!
  // Recursively remove from nodes tree
  const { nodes: newNodes } = removeNodeFromTree(cloned.nodes ?? [], nodeId)
  return {
    ...cloned,
    nodes: newNodes,
    edges: (cloned.edges ?? []).filter(e => e.source !== nodeId && e.target !== nodeId),
  }
}
```

- [ ] **Step 3: Update `UPDATE_NODE`**

Replace the current `UPDATE_NODE` case (lines 76-103). The existing `updateNode` closure recurses one level into `children` — replace with `updateNodeInTree`:

```typescript
case 'UPDATE_NODE': {
  const cloned = cloneDoc(doc)
  return {
    ...cloned,
    nodes: updateNodeInTree(cloned.nodes ?? [], action.nodeId!, (n) => {
      if (action.field === 'params' && action.paramKey) {
        return { ...n, params: { ...n.params, [action.paramKey]: action.value } } as GraphNode
      }
      return { ...n, [action.field!]: action.value } as GraphNode
    }),
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/editors/networkReducer.ts
git commit -m "feat: use recursive tree helpers in ADD/DELETE/UPDATE_NODE"
```

---

### Task 3: Write reducer tests for nested block operations

**Files:**
- Create: `tests/renderer/networkReducer.test.ts` (rewrite with v2-focused tests)

**Interfaces:**
- Consumes: `networkReducer`, `NetworkAction` from `networkReducer.ts`
- Consumes: `NetworkDocument`, `GraphNode`, `GraphEdge`, `createNetworkDocument` from `note-types.ts`

- [ ] **Step 1: Write tests for nested ADD_NODE**

Add to `tests/renderer/networkReducer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { networkReducer } from '../../src/renderer/src/components/editors/networkReducer'
import type { NetworkAction } from '../../src/renderer/src/components/editors/networkReducer'
import type { NetworkDocument, GraphNode, GraphEdge } from '../../src/main/schemas/note-types'
import { createNetworkDocument } from '../../src/main/schemas/note-types'

function makeV2Doc(): NetworkDocument {
  const inputId = 'in-1'
  const outputId = 'out-1'
  return {
    type: 'net',
    version: 2,
    name: 'TestNet',
    nodes: [
      { id: inputId, kind: 'input', label: 'Input' },
      { id: 'b1', kind: 'block', label: 'Backbone', children: [
        { id: 'l1', kind: 'layer', label: 'conv1', layerType: 'Conv2d', params: {} },
      ], internalEdges: [] },
      { id: outputId, kind: 'output', label: 'Output' },
    ],
    edges: [
      { id: 'e1', source: inputId, target: 'b1', style: 'forward' },
      { id: 'e2', source: 'b1', target: outputId, style: 'forward' },
    ],
  }
}

function dispatch(doc: NetworkDocument, action: NetworkAction): NetworkDocument {
  return networkReducer(doc, action)
}

describe('networkReducer (v2) — nested blocks', () => {
  describe('ADD_NODE with parentId', () => {
    it('adds a layer as child of a top-level block', () => {
      const doc = makeV2Doc()
      const result = dispatch(doc, {
        type: 'ADD_NODE', nodeId: 'l2', parentId: 'b1',
        kind: 'layer', layerType: 'ReLU', name: 'relu1',
      })
      const b1 = result.nodes!.find(n => n.id === 'b1')!
      expect(b1.children!.length).toBe(2)
      expect(b1.children![1].label).toBe('relu1')
      // Should create auto internal edge from l1 -> l2
      expect(b1.internalEdges!.length).toBe(1)
      expect(b1.internalEdges![0].source).toBe('l1')
      expect(b1.internalEdges![0].target).toBe('l2')
    })

    it('adds a nested block as child of a top-level block', () => {
      const doc = makeV2Doc()
      const result = dispatch(doc, {
        type: 'ADD_NODE', nodeId: 'b2', parentId: 'b1',
        kind: 'block', name: 'ResBlock',
      })
      const b1 = result.nodes!.find(n => n.id === 'b1')!
      expect(b1.children!.length).toBe(2)
      const nested = b1.children![1]
      expect(nested.kind).toBe('block')
      expect(nested.label).toBe('ResBlock')
      expect(nested.children).toEqual([])
    })
  })

  describe('DELETE_NODE', () => {
    it('deletes a layer from inside a block', () => {
      const doc = makeV2Doc()
      const result = dispatch(doc, { type: 'DELETE_NODE', nodeId: 'l1' })
      const b1 = result.nodes!.find(n => n.id === 'b1')!
      expect(b1.children!.length).toBe(0)
    })

    it('deletes a nested block from inside a parent block', () => {
      const doc = makeV2Doc()
      // First add a nested block
      const withNested = dispatch(doc, {
        type: 'ADD_NODE', nodeId: 'b2', parentId: 'b1',
        kind: 'block', name: 'ResBlock',
      })
      // Now delete it
      const result = dispatch(withNested, { type: 'DELETE_NODE', nodeId: 'b2' })
      const b1 = result.nodes!.find(n => n.id === 'b1')!
      expect(b1.children!.length).toBe(1)
      expect(b1.children![0].id).toBe('l1')
    })
  })

  describe('UPDATE_NODE', () => {
    it('updates a layer nested inside a block', () => {
      const doc = makeV2Doc()
      const result = dispatch(doc, {
        type: 'UPDATE_NODE', nodeId: 'l1',
        field: 'label', value: 'renamed_conv',
      })
      const b1 = result.nodes!.find(n => n.id === 'b1')!
      expect(b1.children![0].label).toBe('renamed_conv')
    })
  })

  describe('immutability', () => {
    it('does not mutate original document on ADD_NODE', () => {
      const original = makeV2Doc()
      const origJson = JSON.stringify(original)
      dispatch(original, {
        type: 'ADD_NODE', nodeId: 'l2', parentId: 'b1',
        kind: 'layer', layerType: 'ReLU', name: 'relu1',
      })
      expect(JSON.stringify(original)).toBe(origJson)
    })

    it('does not mutate original document on DELETE_NODE', () => {
      const original = makeV2Doc()
      const origJson = JSON.stringify(original)
      dispatch(original, { type: 'DELETE_NODE', nodeId: 'l1' })
      expect(JSON.stringify(original)).toBe(origJson)
    })
  })
})
```

**Important:** Keep the existing v1 tests in the file — add these v2 tests as new `describe` blocks after the existing ones. Do NOT remove existing tests.

- [ ] **Step 2: Run tests to verify they pass**

```bash
npx vitest run tests/renderer/networkReducer.test.ts
```

Expected: all tests pass (both existing v1 tests and new v2 tests).

- [ ] **Step 3: Commit**

```bash
git add tests/renderer/networkReducer.test.ts
git commit -m "test: add v2 reducer tests for nested block operations"
```

---

### Task 4: Recursive BlockLayout in NetworkCanvas

**Files:**
- Modify: `src/renderer/src/components/editors/NetworkCanvas.tsx`

**Interfaces:**
- Consumes: `GraphNode`, `GraphEdge`, `BlockDirection` from `note-types.ts`
- Consumes: existing `runLayout`, `autoDetectDirection` functions in the file

- [ ] **Step 1: Move block-padding constants to module level**

In `NetworkCanvas.tsx`, `BLOCK_PAD` and `BLOCK_BOTTOM_PAD` are currently defined inside `render()` (approximately lines 153-154). Move them to the module-level constant block (after line 28, where `BLOCK_HEADER_H` is defined) so `computeBlockLayout` can reference them:

```typescript
const BLOCK_PAD = 20
const BLOCK_BOTTOM_PAD = 14
```

Then remove the same two lines from inside `render()`.

- [ ] **Step 2: Extract `computeBlockLayout` as a recursive function**

Add after the existing `autoDetectDirection` function (around line 81), before the `NetworkCanvas` component. Note: `BlockLayout` is currently typed inline inside `render()` — move it to module level here:

```typescript
type BlockLayout = {
  positions: Map<string, { x: number; y: number }>
  width: number
  height: number
  childOffsetX: number
  childOffsetY: number
  direction: BlockDirection
}

function computeBlockLayout(
  block: GraphNode,
  allLayouts: Map<string, BlockLayout>
): BlockLayout | null {
  if (!block.children || block.children.length === 0) return null

  const children = block.children
  const internalEdges = block.internalEdges ?? []
  const blockDirection = (block.direction as BlockDirection | undefined) ?? autoDetectDirection(internalEdges)

  // Build size overrides for any child blocks (recursive)
  const nodeSizes = new Map<string, { width: number; height: number }>()
  for (const child of children) {
    if (child.kind === 'block') {
      const childLayout = computeBlockLayout(child, allLayouts)
      if (childLayout) {
        allLayouts.set(child.id, childLayout)
        nodeSizes.set(child.id, { width: childLayout.width, height: childLayout.height })
      } else {
        nodeSizes.set(child.id, { width: BLOCK_MIN_W, height: NODE_H + BLOCK_HEADER_H })
      }
    }
  }

  const childPositions = runLayout(children, internalEdges, nodeSizes, blockDirection)

  // Compute bounding box from child positions
  let cMinX = Infinity, cMaxX = -Infinity, cMinY = Infinity, cMaxY = -Infinity
  for (const child of children) {
    const cp = childPositions.get(child.id)
    if (!cp) continue
    const size = nodeSizes.get(child.id) ?? {
      width: child.kind === 'input' || child.kind === 'output' ? INPUT_W : NODE_W,
      height: child.kind === 'input' || child.kind === 'output' ? INPUT_H : NODE_H,
    }
    cMinX = Math.min(cMinX, cp.x - size.width / 2)
    cMaxX = Math.max(cMaxX, cp.x + size.width / 2)
    cMinY = Math.min(cMinY, cp.y - size.height / 2)
    cMaxY = Math.max(cMaxY, cp.y + size.height / 2)
  }

  if (!isFinite(cMinX)) {
    cMinX = -NODE_W / 2; cMaxX = NODE_W / 2
    cMinY = -NODE_H / 2; cMaxY = NODE_H / 2
  }

  const contentW = cMaxX - cMinX
  const contentH = cMaxY - cMinY
  const padX = blockDirection === 'horizontal' ? BLOCK_PAD * 2 : BLOCK_PAD
  const padY = blockDirection === 'vertical' ? BLOCK_PAD * 2 : BLOCK_PAD
  const bw = Math.max(BLOCK_MIN_W, contentW + padX * 2)
  const bh = BLOCK_HEADER_H + contentH + padY + BLOCK_BOTTOM_PAD

  return {
    positions: childPositions,
    width: bw,
    height: bh,
    childOffsetX: padX - cMinX,
    childOffsetY: BLOCK_HEADER_H + padY - cMinY,
    direction: blockDirection,
  }
}
```

- [ ] **Step 3: Remove the `BlockLayout` type alias and block-layout code from inside `render()`**

Remove the `type BlockLayout = { ... }` declaration inside `render()` (approximately line 146) — it's now at module level.

Remove the inline block-layout computation loop inside `render()` that starts with `for (const node of topNodes) { if (node.kind === 'block' && node.children && node.children.length > 0) { ... } }` (approximately lines 157-192). Replace it with:

```typescript
// Build block layouts recursively (top-level only — nested layouts are stored
// inside computeBlockLayout via the allLayouts map)
for (const node of topNodes) {
  if (node.kind === 'block') {
    const layout = computeBlockLayout(node, blockLayouts)
    if (layout) {
      blockLayouts.set(node.id, layout)
    }
  }
}
```

Remove the old inline layout computation block inside `render()` that starts with `for (const node of topNodes) { if (node.kind === 'block' && node.children && node.children.length > 0) { ... } }` — it's about 40 lines. The `computeBlockLayout` function replaces it.

- [ ] **Step 4: Add nested block rendering in the child loop**

Find the child rendering loop inside a block (approximately lines 1054-1248 — the `for (const child of node.children)` loop). Add handling for `child.kind === 'block'` before the existing rendering:

```typescript
// ... inside the child loop, after `const cp = blockLayout.positions.get(child.id)` ...

if (child.kind === 'block') {
  // Render nested block as a mini-block
  const nestedLayout = blockLayouts.get(child.id)
  const nw = nestedLayout?.width ?? BLOCK_MIN_W
  const nh = nestedLayout?.height ?? (NODE_H + BLOCK_HEADER_H)
  const nx = childOffsetX + cp.x - nw / 2
  const ny = childOffsetY + cp.y - nh / 2
  const childIsSelected = child.id === selectedNodeId

  const nestedG = nodeG.append('g')
    .attr('class', 'net-node')
    .attr('data-node-id', child.id)
    .attr('data-node-kind', 'block')
    .style('cursor', 'pointer')

  // Dashed border
  nestedG.append('rect')
    .attr('x', nx).attr('y', ny).attr('width', nw).attr('height', nh)
    .attr('rx', 6).attr('fill', 'none')
    .attr('stroke', childIsSelected ? '#4a90d9' : '#ff9800')
    .attr('stroke-width', childIsSelected ? 2.5 : 1.5)
    .attr('stroke-dasharray', '4,2')

  // Header
  let headerText = child.label
  if (child.repeat && child.repeat > 1) headerText += ` ×${child.repeat}`
  nestedG.append('text')
    .attr('x', nx + 8).attr('y', ny + 14)
    .attr('fill', '#ff9800').attr('font-size', '10px').attr('font-weight', 'bold')
    .text(headerText)

  // Render nested block's children (layers only) and internal edges
  if (nestedLayout && child.children) {
    const nChildOffsetX = nx + nestedLayout.childOffsetX
    const nChildOffsetY = ny + nestedLayout.childOffsetY

    // Internal edges of the nested block
    for (const ie of (child.internalEdges ?? [])) {
      const cpSrc = nestedLayout.positions.get(ie.source)
      const cpTgt = nestedLayout.positions.get(ie.target)
      if (!cpSrc || !cpTgt) continue
      renderEdge(ie,
        { x: nChildOffsetX + cpSrc.x, y: nChildOffsetY + cpSrc.y },
        { x: nChildOffsetX + cpTgt.x, y: nChildOffsetY + cpTgt.y },
        NODE_W, NODE_H, NODE_W, NODE_H, nestedG,
        0, 1, 0, 1,
        nestedLayout.direction, nestedLayout.direction)
    }

    // Layer children of the nested block
    for (const nChild of child.children) {
      const ncp = nestedLayout.positions.get(nChild.id)
      if (!ncp) continue
      const ncx = nChildOffsetX + ncp.x - NODE_W / 2
      const ncy = nChildOffsetY + ncp.y - NODE_H / 2
      const nSelected = nChild.id === selectedNodeId

      let cc = '#888', cf = '#2a2a2a'
      if (nChild.layerType) {
        const def = catalog[nChild.layerType]
        cc = def?.color ?? '#888'
        cf = (def?.color ?? '#888') + '22'
      }

      const nChildG = nestedG.append('g')
        .attr('class', 'net-node')
        .attr('data-node-id', nChild.id)
        .attr('data-node-kind', nChild.kind)
        .style('cursor', 'pointer')

      if (nChild.inputShape) {
        nChildG.append('text')
          .attr('x', ncx + NODE_W / 2).attr('y', ncy - 4)
          .attr('text-anchor', 'middle').attr('fill', '#888').attr('font-size', '9px')
          .text(nChild.inputShape)
      }

      nChildG.append('rect')
        .attr('x', ncx).attr('y', ncy).attr('width', NODE_W).attr('height', NODE_H)
        .attr('rx', 4).attr('fill', cf)
        .attr('stroke', nSelected ? '#4a90d9' : cc)
        .attr('stroke-width', nSelected ? 2.5 : 1)

      nChildG.append('text')
        .attr('x', ncx + NODE_W / 2).attr('y', ncy + NODE_H / 2 + 4)
        .attr('text-anchor', 'middle').attr('fill', '#d4d4d4')
        .attr('font-size', '9px').attr('font-weight', 'bold')
        .text(nChild.label)

      // Click handlers
      if (!readOnly) {
        nChildG.on('click', (event: MouseEvent) => {
          event.stopPropagation()
          if (clickTimersRef.current.has(nChild.id)) return
          const timer = setTimeout(() => {
            onSelectNode?.(nChild.id)
            clickTimersRef.current.delete(nChild.id)
          }, 250)
          clickTimersRef.current.set(nChild.id, timer)
        })
      }
    }
  }

  // Ports on nested block
  if (!readOnly) {
    // Output port
    if (child.kind !== 'output') {
      nestedG.append('circle')
        .attr('class', 'net-port-out')
        .attr('cx', nx + nw / 2).attr('cy', ny + nh)
        .attr('r', 4).attr('fill', '#ff9800').attr('stroke', '#333').attr('stroke-width', 0.5)
        .attr('opacity', 0.5).style('cursor', 'crosshair')
        .on('mouseenter', function () { d3.select(this).attr('opacity', 1).attr('r', 6) })
        .on('mouseleave', function () { d3.select(this).attr('opacity', 0.5).attr('r', 4) })
    }
    // Input port
    if (child.kind !== 'input') {
      nestedG.append('circle')
        .attr('class', 'net-port-in')
        .attr('cx', nx + nw / 2).attr('cy', ny)
        .attr('r', 4).attr('fill', '#ff9800').attr('stroke', '#333').attr('stroke-width', 0.5)
        .attr('opacity', 0.5).style('cursor', 'crosshair')
        .on('mouseenter', function () { d3.select(this).attr('opacity', 1).attr('r', 6) })
        .on('mouseleave', function () { d3.select(this).attr('opacity', 0.5).attr('r', 4) })
    }
  }

  // Click on nested block
  if (!readOnly) {
    nestedG.on('click', (event: MouseEvent) => {
      event.stopPropagation()
      if (clickTimersRef.current.has(child.id)) return
      const timer = setTimeout(() => {
        onSelectNode?.(child.id)
        clickTimersRef.current.delete(child.id)
      }, 250)
      clickTimersRef.current.set(child.id, timer)
    })
  }

  // Drag-to-connect for nested block
  if (!readOnly && child.kind !== 'input' && child.kind !== 'output') {
    const nestedDrag = d3.drag<SVGGElement, unknown>()
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
        // Highlight targets
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
          .attr('stroke', isSel ? '#4a90d9' : '#ff9800')
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
    nestedG.call(nestedDrag as any)
  }

  continue // skip the existing layer rendering for this child
}
```

- [ ] **Step 5: Remove unused `BlockLayout` declaration from inside `render()`**

The `BlockLayout` type alias was previously defined inside `render()` and has already been moved to module level in Step 2. Verify the old inline declaration is removed so there's no duplicate.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/editors/NetworkCanvas.tsx
git commit -m "feat: recursive BlockLayout computation and nested block rendering in NetworkCanvas"
```

---

### Task 5: Smart "Add Block" nesting + recursive selection in NetworkEditor

**Files:**
- Modify: `src/renderer/src/components/editors/NetworkEditor.tsx`

**Interfaces:**
- Consumes: `networkReducer`, `NetworkAction` from `networkReducer.ts`
- Consumes: `GraphNode`, `NetworkDocument` from `note-types.ts`

- [ ] **Step 1: Add recursive node-find helper for selection**

Add a helper function after imports, before the `NetworkEditor` component:

```typescript
/** Recursively find a node by id in the tree. */
function findNodeInTree(nodes: GraphNode[], id: string): GraphNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children) {
      const found = findNodeInTree(n.children, id)
      if (found) return found
    }
  }
  return null
}
```

- [ ] **Step 2: Update the `selectedNode` useMemo**

Replace the existing `selectedNode` useMemo (approximately lines 131-140):

```typescript
const selectedNode = useMemo(() => {
  if (!selectedNodeId) return null
  return findNodeInTree(doc.nodes ?? [], selectedNodeId)
}, [doc.nodes, selectedNodeId])
```

- [ ] **Step 3: Make "Add Block" button smart**

Find the "+ Add Block" button in the toolbar (approximately line 237). Replace its `onClick` handler:

```typescript
<button
  className="network-editor-btn"
  onClick={() => {
    if (selectedNode && selectedNode.kind === 'block') {
      // Add nested block inside selected block
      dispatch({
        type: 'ADD_NODE',
        kind: 'block',
        name: 'New Block',
        parentId: selectedNode.id,
      })
    } else {
      // Add top-level block
      dispatch({ type: 'ADD_NODE', kind: 'block', name: 'New Block' })
    }
  }}
>
  + Add Block
</button>
```

- [ ] **Step 4: Update `handleDropLayer` to handle nested blocks**

The current `handleDropLayer` checks `sel.kind === 'block'` and dispatches with `parentId`. This already works for nested blocks since the selection lookup is now recursive. No code change needed — verify the existing logic:

```typescript
// No changes needed — already dispatches ADD_NODE with parentId when a block is selected
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/editors/NetworkEditor.tsx
git commit -m "feat: recursive selection lookup and smart Add Block nesting in NetworkEditor"
```

---

### Task 6: Show nested blocks in NetworkPanel child list

**Files:**
- Modify: `src/renderer/src/components/editors/NetworkPanel.tsx`

- [ ] **Step 1: Update child list to distinguish nested blocks from layers**

Find the children list display in the block settings section (approximately lines 237-247). Update it to show a block indicator for `kind: "block"` children:

```typescript
{(node.children ?? []).length > 0 && (
  <div className="network-panel-params">
    <div className="network-panel-section-title">
      Children ({node.children!.length})
    </div>
    {node.children!.map(child => (
      <div key={child.id} style={{ fontSize: 10, color: '#d4d4d4', padding: '2px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
        {child.kind === 'block' ? (
          <>
            <span style={{ color: '#ff9800', fontWeight: 'bold' }}>📦</span>
            <span style={{ color: '#ff9800' }}>{child.label}</span>
            {child.repeat && child.repeat > 1 && (
              <span style={{ color: '#888', fontSize: 9 }}>×{child.repeat}</span>
            )}
          </>
        ) : (
          <>
            <span style={{ color: child.layerType ? '#4a90d9' : '#888' }}>{child.layerType ?? child.label}</span>
            <span style={{ color: '#888', fontSize: 9 }}>{child.label}</span>
          </>
        )}
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/editors/NetworkPanel.tsx
git commit -m "feat: distinguish nested blocks from layers in NetworkPanel child list"
```

---

### Task 7: Update add_block.py with --parent flag

**Files:**
- Modify: `skills/network-graph/scripts/add_block.py`

- [ ] **Step 1: Add --parent argument and logic**

```python
#!/usr/bin/env python3
"""Add a block node to a .net.json document."""
import argparse, json, sys, uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import load_network, save_network, resolve_path
from lib.schemas import GraphNode


def find_block_in_tree(nodes, block_id):
    """Recursively find a block node by id."""
    for n in nodes:
        if n.id == block_id:
            return n
        if n.children:
            found = find_block_in_tree(n.children, block_id)
            if found:
                return found
    return None


def main():
    parser = argparse.ArgumentParser(description="Add a block to a network graph")
    parser.add_argument("path", help="Path to the .net.json file")
    parser.add_argument("name", help="Block name")
    parser.add_argument("--repeat", type=int, default=None, help="Repeat count")
    parser.add_argument("--direction", choices=["horizontal", "vertical"],
                        default=None, help="Block layout direction")
    parser.add_argument("--parent", default=None, help="Parent block ID (for nested blocks)")
    args = parser.parse_args()

    args.path = resolve_path(args.path, ".net.json")

    doc = load_network(args.path)
    block = GraphNode(
        id=str(uuid.uuid4()), kind="block", label=args.name,
        repeat=args.repeat, children=[], direction=args.direction
    )

    if args.parent:
        parent = find_block_in_tree(doc.nodes, args.parent)
        if parent is None:
            print(json.dumps({"ok": False, "error": f"Parent block not found: {args.parent}"}))
            sys.exit(1)
        if parent.children is None:
            parent.children = []
        parent.children.append(block)
    else:
        doc.nodes.append(block)

    save_network(args.path, doc)
    print(json.dumps({"ok": True, "id": block.id, "parentId": args.parent}))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Commit**

```bash
git add skills/network-graph/scripts/add_block.py
git commit -m "feat: add --parent flag to add_block.py for nested block creation"
```

---

### Task 8: Update add_node_to_block.py with recursive lookup

**Files:**
- Modify: `skills/network-graph/scripts/add_node_to_block.py`

- [ ] **Step 1: Add recursive search for target node**

```python
#!/usr/bin/env python3
"""Move a node into a block's children."""
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import load_network, save_network


def find_block_in_tree(nodes, block_id):
    """Recursively find a block node by id."""
    for n in nodes:
        if n.id == block_id and n.kind == "block":
            return n
        if n.children:
            found = find_block_in_tree(n.children, block_id)
            if found:
                return found
    return None


def find_node_in_tree(nodes, node_id):
    """Recursively find any node by id anywhere in the tree."""
    for n in nodes:
        if n.id == node_id:
            return n
        if n.children:
            found = find_node_in_tree(n.children, node_id)
            if found:
                return found
    return None


def remove_node_from_tree(nodes, node_id):
    """Recursively remove a node by id. Returns True if removed."""
    for i, n in enumerate(nodes):
        if n.id == node_id:
            nodes.pop(i)
            return True
        if n.children:
            if remove_node_from_tree(n.children, node_id):
                return True
    return False


def main():
    parser = argparse.ArgumentParser(description="Move a node into a block")
    parser.add_argument("path", help="Path to the .net.json file")
    parser.add_argument("block_id", help="ID of the block node")
    parser.add_argument("node_id", help="ID of the node to move")
    args = parser.parse_args()

    doc = load_network(args.path)
    block = find_block_in_tree(doc.nodes, args.block_id)
    if block is None:
        print(json.dumps({"ok": False, "error": f"Block not found: {args.block_id}"}))
        sys.exit(1)

    target = find_node_in_tree(doc.nodes, args.node_id)
    if target is None:
        print(json.dumps({"ok": False, "error": f"Node not found: {args.node_id}"}))
        sys.exit(1)

    # Remove from current position
    remove_node_from_tree(doc.nodes, args.node_id)

    if block.children is None:
        block.children = []
    block.children.append(target)
    save_network(args.path, doc)
    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Commit**

```bash
git add skills/network-graph/scripts/add_node_to_block.py
git commit -m "feat: recursive tree search in add_node_to_block.py"
```

---

### Task 9: Update delete_node.py with recursive removal

**Files:**
- Modify: `skills/network-graph/scripts/delete_node.py`

- [ ] **Step 1: Add recursive removal from children**

The current script only removes from `doc.nodes`. Add recursive tree removal:

```python
#!/usr/bin/env python3
"""Delete a node and its incident edges from a .net.json document."""
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import load_network, save_network, resolve_path


def remove_from_children(children, node_id):
    """Remove a node from a children list and its descendant children. Returns True if removed."""
    for i, child in enumerate(children):
        if child.id == node_id:
            children.pop(i)
            return True
        if child.children:
            if remove_from_children(child.children, node_id):
                # Clean internalEdges referencing the removed node
                if child.internalEdges:
                    child.internalEdges = [
                        e for e in child.internalEdges
                        if e.source != node_id and e.target != node_id
                    ]
                return True
    return False


def main():
    parser = argparse.ArgumentParser(description="Delete a node from a network graph")
    parser.add_argument("path", help="Path to the .net.json file")
    parser.add_argument("node_id", help="ID of the node to delete")
    args = parser.parse_args()

    args.path = resolve_path(args.path, ".net.json")

    doc = load_network(args.path)

    # Try top-level removal
    removed = False
    for i, n in enumerate(doc.nodes):
        if n.id == args.node_id:
            doc.nodes.pop(i)
            removed = True
            break

    # Try nested removal
    if not removed:
        for node in doc.nodes:
            if node.children and remove_from_children(node.children, args.node_id):
                # Clean internalEdges on this node
                if node.internalEdges:
                    node.internalEdges = [
                        e for e in node.internalEdges
                        if e.source != args.node_id and e.target != args.node_id
                    ]
                removed = True
                break

    if not removed:
        print(json.dumps({"ok": False, "error": f"Node not found: {args.node_id}"}))
        sys.exit(1)

    # Also clean top-level edges
    doc.edges = [e for e in doc.edges if e.source != args.node_id and e.target != args.node_id]

    save_network(args.path, doc)
    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Commit**

```bash
git add skills/network-graph/scripts/delete_node.py
git commit -m "feat: recursive node removal from block children in delete_node.py"
```

---

### Task 10: Write Python script tests for nested block operations

**Files:**
- Modify: `skills/network-graph/tests/test_add_block.py`
- Modify: `skills/network-graph/tests/test_delete_node.py`

- [ ] **Step 1: Add `GraphNode` to imports and add `--parent` test to test_add_block.py**

Update the existing import line:

```python
from lib.schemas import create_network_document, GraphNode
```

Then add after the existing `test_creates_block` function:

```python
def test_creates_nested_block():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.net.json")
        doc = create_network_document("Test")
        # Add a top-level block
        parent = GraphNode(id=str(uuid.uuid4()), kind="block", label="Parent", children=[])
        doc.nodes.insert(1, parent)
        save_network(path, doc)

        # Create nested block inside parent
        code, out = run_script(path, "ChildBlock", "--repeat", "2", "--parent", parent.id)
        assert code == 0
        result = json.loads(out)
        assert result["ok"] is True
        assert result["parentId"] == parent.id

        loaded = load_network(path)
        parent_loaded = next(n for n in loaded.nodes if n.id == parent.id)
        assert parent_loaded.children is not None
        assert len(parent_loaded.children) == 1
        assert parent_loaded.children[0].label == "ChildBlock"
        assert parent_loaded.children[0].repeat == 2
```

- [ ] **Step 2: Add recursive removal test to test_delete_node.py**

Add after the existing `test_deletes_node_and_incident_edges` function:

```python
def test_deletes_node_from_nested_block():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.net.json")
        doc = create_network_document("Test")

        # Create a nested structure: block -> nested block -> layer
        layer_id = str(uuid.uuid4())
        nested_block = GraphNode(
            id=str(uuid.uuid4()), kind="block", label="NestedBlock",
            children=[
                GraphNode(id=layer_id, kind="layer", label="inner", layerType="ReLU")
            ],
            internalEdges=[]
        )
        parent_block = GraphNode(
            id=str(uuid.uuid4()), kind="block", label="ParentBlock",
            children=[nested_block],
            internalEdges=[]
        )
        doc.nodes.insert(1, parent_block)
        save_network(path, doc)

        # Delete the layer from inside the nested block
        code, out = run_script(path, layer_id)
        assert code == 0
        loaded = load_network(path)
        parent = next(n for n in loaded.nodes if n.id == parent_block.id)
        nested = parent.children[0]
        assert len(nested.children) == 0
```

- [ ] **Step 3: Run Python tests**

```bash
cd skills/network-graph && python -m pytest tests/test_add_block.py tests/test_delete_node.py -v
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add skills/network-graph/tests/test_add_block.py skills/network-graph/tests/test_delete_node.py
git commit -m "test: add tests for nested block creation and recursive deletion"
```

---

### Task 11: Integration test — build a nested architecture end-to-end

**Files:**
- Modify: `skills/network-graph/tests/test_network_integration.py`

- [ ] **Step 1: Add integration test for nested blocks**

Add at the end of the file, before the final blank line:

```python
def test_nested_block_architecture():
    """Build ResNet-style: Backbone block containing ResBlock with layers inside."""
    with tempfile.TemporaryDirectory() as tmp:
        name = os.path.join(tmp, "nested_net")

        code, out = run("create_network.py", name, "--title", "NestedNet")
        result = json.loads(out)
        path = result["path"]

        # Create parent block (Backbone)
        code, out = run("add_block.py", path, "Backbone")
        result = json.loads(out)
        backbone_id = result["id"]

        # Create nested block (ResBlock) inside Backbone
        code, out = run("add_block.py", path, "ResBlock", "--repeat", "3", "--parent", backbone_id)
        result = json.loads(out)
        resblock_id = result["id"]

        # Add layers inside the nested ResBlock
        run("add_layer.py", path, "Conv2d", "--name", "conv_a", "--params",
            '{"in_channels":64,"out_channels":64,"kernel_size":3,"stride":1,"padding":1}')
        run("add_layer.py", path, "BatchNorm2d", "--name", "bn_a")
        run("add_layer.py", path, "ReLU", "--name", "relu_a")

        # Move layers into the ResBlock (they were added at top level by add_layer.py)
        loaded = load_network(path)
        conv_a = next(n for n in loaded.nodes if n.label == "conv_a")
        bn_a = next(n for n in loaded.nodes if n.label == "bn_a")
        relu_a = next(n for n in loaded.nodes if n.label == "relu_a")

        run("add_node_to_block.py", path, resblock_id, conv_a.id)
        run("add_node_to_block.py", path, resblock_id, bn_a.id)
        run("add_node_to_block.py", path, resblock_id, relu_a.id)

        # Verify
        loaded = load_network(path)
        backbone = next(n for n in loaded.nodes if n.id == backbone_id)
        assert len(backbone.children) == 1  # Only the ResBlock
        assert backbone.children[0].id == resblock_id

        resblock = backbone.children[0]
        assert resblock.label == "ResBlock"
        assert resblock.repeat == 3
        assert len(resblock.children) == 3  # conv_a, bn_a, relu_a
        layer_labels = [c.label for c in resblock.children]
        assert layer_labels == ["conv_a", "bn_a", "relu_a"]
```

- [ ] **Step 2: Run integration test**

```bash
cd skills/network-graph && python -m pytest tests/test_network_integration.py::test_nested_block_architecture -v
```

Expected: PASS.

- [ ] **Step 3: Run all network tests**

```bash
cd skills/network-graph && python -m pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add skills/network-graph/tests/test_network_integration.py
git commit -m "test: add integration test for nested block architecture"
```

---

### Task 12: Run full test suite and final verification

- [ ] **Step 1: Run TypeScript tests**

```bash
npx vitest run tests/renderer/networkReducer.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run Python tests**

```bash
cd skills/network-graph && python -m pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 4: Commit any remaining changes**

```bash
git status
git add -A
git commit -m "chore: final verification — all tests pass, no type errors"
```
