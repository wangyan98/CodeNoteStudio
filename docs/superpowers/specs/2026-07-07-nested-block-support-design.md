# Nested Block Support in .net.json

**Date:** 2026-07-07
**Status:** Draft
**Scope:** Allow `kind: "block"` nodes to contain child blocks (one extra level of nesting), enabling patterns like `Backbone > ResBlock > Conv2d`.

## Motivation

Currently, `.net.json` blocks can only contain `kind: "layer"` children. There is no way to express a reusable sub-block (e.g., a ResBlock, a TransformerBlock) inside another block (e.g., a Backbone or Stage block). This forces users to either flatten complex architectures or omit the intermediate block structure, losing semantic information.

Adding one level of block nesting allows:
- `Backbone > ResBlock > Conv2d, BatchNorm, ReLU` (stage contains repeated sub-blocks)
- `TransformerEncoder > TransformerBlock > MultiHeadAttention, FeedForward`
- `FPN Neck > C2f Block > Conv2d, Bottleneck`

## Depth Constraint

**Max depth: 3 levels total.** Top-level block → child block → layer. A nested block's children may only be `kind: "layer"` — no further block nesting. This covers all known NN architecture patterns while keeping the implementation tractable.

## Design

### 1. Data Model (no changes)

`GraphNode` already supports recursion via `children?: GraphNode[]`. No type changes needed.

On-disk structure for a nested block:

```json
{
  "kind": "block", "label": "Backbone",
  "children": [
    { "kind": "layer", "label": "conv1", "layerType": "Conv2d", ... },
    { "kind": "block", "label": "ResBlock", "repeat": 3,
      "children": [
        { "kind": "layer", "label": "conv_a", "layerType": "Conv2d", ... },
        { "kind": "layer", "label": "conv_b", "layerType": "Conv2d", ... }
      ],
      "internalEdges": [
        { "id": "...", "source": "<conv_a>", "target": "<conv_b>", "style": "forward" }
      ]
    }
  ],
  "internalEdges": [
    { "id": "...", "source": "<conv1>", "target": "<ResBlock>", "style": "forward" }
  ]
}
```

### 2. Reducer (networkReducer.ts)

Three operations need recursive tree traversal. Extract helpers:

**`findBlockInTree(nodes: GraphNode[], id: string): GraphNode | null`**
Recursively searches `children` arrays. Used by `ADD_NODE` to locate the parent block regardless of depth.

**`removeNodeFromTree(nodes: GraphNode[], id: string): GraphNode[]`**
Recursively filters `children` arrays and removes matching `internalEdges`. Used by `DELETE_NODE`.

**`updateNodeInTree(nodes: GraphNode[], id: string, updater: (n: GraphNode) => GraphNode): GraphNode[]`**
Recursively maps `children`, applying the updater when `id` matches. Used by `UPDATE_NODE`.

**Changes per action:**

| Action | Current behavior | New behavior |
|--------|-----------------|--------------|
| `ADD_NODE` with `parentId` | Checks only top-level `children` for match | Recursively searches all `children` arrays; appends to matching block |
| `DELETE_NODE` | Filters only `doc.nodes` top-level | Recursively removes from `children` + cleans `internalEdges` |
| `UPDATE_NODE` | Checks `n.children` one level deep | Recurses into child blocks' `children` |

**Selection lookup** (`NetworkEditor.tsx` `selectedNode` useMemo):
Replace the single-level `n.children.find(...)` with a recursive helper that traverses the full tree.

### 3. Rendering (NetworkCanvas.tsx)

**Approach: Recursive Dagre-Per-Block.** Each block independently runs dagre on its own children. Nested blocks recursively run their own sub-layout.

#### 3a. Recursive BlockLayout computation

Currently, `blockLayouts` is built as a flat `Map<string, BlockLayout>` for top-level blocks only. Extend this to be recursive:

```
function computeBlockLayout(node: GraphNode): BlockLayout | null
```

For each block (top-level or nested):
1. Iterate `node.children`. For each child that is `kind: "block"`, recursively call `computeBlockLayout(child)`.
2. Run `runLayout(node.children, node.internalEdges, ..., node.direction)` with size overrides from recursive block layouts.
3. Compute bounding box (same as today: min/max over child positions, plus padding).
4. Return `BlockLayout` with positions, width, height, offsets, and direction.

The top-level loop becomes:
```
for (const node of topNodes) {
  if (node.kind === 'block' && node.children?.length) {
    blockLayouts.set(node.id, computeBlockLayout(node))
  }
}
```

`computeBlockLayout` stores sub-block layouts in the same `blockLayouts` map (keyed by the sub-block's `id`).

#### 3b. Recursive child rendering

Currently, children inside a block are rendered in a flat loop. When rendering a child that is `kind: "block"`:

1. Look up its `BlockLayout` from the map.
2. Draw the dashed-border rectangle (size from layout) at the child's position.
3. Draw the header text (`label [+ ×N]`).
4. Recurse: render its own children (layers only, per depth constraint) inside.
5. Recurse: render its `internalEdges`.

This is structurally identical to how top-level blocks render their children today — the same code, applied recursively.

#### 3c. Ports on nested blocks

Nested blocks get `net-port-in` / `net-port-out` circles on their box edges, just like top-level blocks. This allows edges to flow into/out of nested blocks within the parent's internal edge set.

#### 3d. Column alignment (skip edges)

The column alignment logic for vertical blocks today operates on `node.children` (flat). After nesting, the same logic applies — a nested block is just another child with a computed position. Its `x` position participates in the existing alignment math without special handling.

### 4. UI (NetworkEditor.tsx + NetworkPanel.tsx)

**Toolbar "Add Block" button — smart nesting:**

When a block node is selected, the "+ Add Block" button creates the new block as a child of the selected block (via `ADD_NODE` with `parentId`). When nothing is selected or a non-block is selected, it adds at the top level.

Implementation: `handleDropLayer` already checks `sel.kind === 'block'` → add as child. Replicate this pattern for the "+ Add Block" button.

**Palette drag-and-drop:**

Already works — dropping a layer when a block is selected adds it as a child. No changes needed.

**NetworkPanel.tsx:**

The block settings panel (name, repeat, direction, child list) already renders based on `node.kind === 'block'`. It works for nested blocks without changes — the panel doesn't care about depth. The child list display (`Layers (N)`) should include nested blocks in the count and show them with a distinct visual indicator (e.g., "📦" prefix or orange color).

### 5. Scripts

| Script | Change |
|--------|--------|
| `add_node_to_block.py` | Recursively search `children` arrays for the target node, not just `doc.nodes` |
| `add_block.py` | Accept optional `--parent <block-id>` flag; when set, add new block as child of the specified parent block |
| `delete_node.py` | Recursively remove from `children` arrays + clean `internalEdges`, not just `doc.nodes` |

Other scripts (`add_layer.py`, `add_connection.py`, `update_node.py`) operate on flat node lists or edges and do not need changes.

## Non-Goals

- Arbitrary-depth nesting (excluded per explicit user choice — max 1 extra level)
- Nested block inside nested block (depth 4+)
- Drag-and-drop to reorder children within a block
- Visual collapse/expand of nested blocks in the canvas

## Files Touched

| File | Changes |
|------|---------|
| `src/renderer/src/components/editors/networkReducer.ts` | Recursive tree helpers; update ADD/DELETE/UPDATE cases |
| `src/renderer/src/components/editors/NetworkCanvas.tsx` | Recursive `BlockLayout` computation; recursive child rendering for nested blocks |
| `src/renderer/src/components/editors/NetworkEditor.tsx` | Smart "Add Block" nesting; recursive selection lookup |
| `src/renderer/src/components/editors/NetworkPanel.tsx` | Include nested blocks in child count/label display |
| `skills/network-graph/scripts/add_node_to_block.py` | Recursive node lookup |
| `skills/network-graph/scripts/add_block.py` | `--parent` flag |
| `skills/network-graph/scripts/delete_node.py` | Recursive removal |
