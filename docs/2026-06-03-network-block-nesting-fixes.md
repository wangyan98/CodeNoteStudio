# Network Graph Block Nesting & Embed Rendering Fixes

Date: 2026-06-03

## Issues Fixed

### 1. Block visual nesting on canvas

**Problem**: Block children (layers inside a block) were rendered as standalone nodes in the main DAG layout, not visually inside the block's dashed border.

**Fix** (`NetworkCanvas.tsx`):
- Separated top-level layout from block internals: `runLayout()` only arranges top-level nodes. Block children are excluded.
- For each block with children, a separate dagre sub-layout runs on children + internal edges. The block rect expands to contain all children with padding.
- Children are rendered at relative offsets inside the block's enlarged dashed border, with internal edges drawn within the block group.
- Extracted `renderEdge` helper shared between top-level and internal edge rendering.

### 2. Block expansion causing node overlaps

**Problem**: When layers were added inside a block, the block expanded but the top-level dagre layout still used the default small block size (200×66), causing external nodes to overlap with the expanded block.

**Fix** (`NetworkCanvas.tsx`):
- Two-pass layout: run sub-layouts for blocks FIRST to compute actual dimensions, then build a `nodeSizes` map, then run the top-level dagre layout with real block sizes.
- `runLayout()` now accepts an optional `nodeSizes` parameter to override default node dimensions.

### 3. Edge connection points on expanded blocks

**Problem**: After block expansion, external edges still connected to the old (default-size) block boundary, not the actual expanded boundary.

**Fix** (`NetworkCanvas.tsx`):
- Added `getNodeSize()` helper that checks `blockLayouts` for actual block dimensions.
- Edge rendering uses this helper instead of falling through to default `NODE_W`/`NODE_H`.

### 4. Edge deletion

**Problem**: No way to delete edges from the canvas.

**Fix** (`NetworkCanvas.tsx`, `NetworkEditor.tsx`):
- Click any edge to select it (turns blue with thicker stroke).
- Added transparent 12px hit area on forward edges for easier clicking.
- Press Delete/Backspace to delete the selected edge.
- Edge selection and node selection are mutually exclusive.

### 5. MD embed not scrollable

**Problem**: Network embeds in markdown preview could not scroll vertically when content exceeded the container.

**Fix** (`NetworkEmbedViewer.tsx`, `MdEditor.css`):
- Removed `overflow: auto` from `NetworkEmbedViewer` root div (was creating a double-scroll conflict with parent `.note-embed-body`).
- Added explicit `.note-embed-body.net-embed` CSS rule with `max-height: 400px; overflow-y: auto`.

### 6. Arrow direction in block children (embed)

**Problem**: The `↓` arrow between layers inside a block was rendered inline to the left of each layer label (in the same flex row), appearing horizontal instead of vertical.

**Fix** (`NetworkEmbedViewer.tsx`):
- Changed to render `↓` on its own line above each child, using `Fragment` to group arrow + node without extra wrapper divs.

### 7. Node ordering in embed viewer

**Problem**: Nodes in MD embed were rendered in JSON array order, not in topological order. E.g., Output appeared second (its array position) when it should appear last (end of the data flow).

**Fix** (`NetworkEmbedViewer.tsx`):
- Added topological sort of top-level nodes based on edges before rendering.
- Nodes are ordered by graph flow (BFS from sources), with orphan nodes appended in original order.

## Files Changed

- `src/renderer/src/components/editors/NetworkCanvas.tsx` — Block sub-layout, two-pass sizing, edge connection points, edge selection
- `src/renderer/src/components/editors/NetworkEditor.tsx` — Edge selection state, keyboard edge deletion
- `src/renderer/src/components/editors/NetworkEmbedViewer.tsx` — Topological sort, arrow direction fix, scroll fix
- `src/renderer/src/components/editors/MdEditor.css` — `.note-embed-body.net-embed` scroll rule
