# Network Graph Model — Design Spec

## Overview

Refactor the `.net.json` data model from a linear block/layer hierarchy to a full directed acyclic graph (DAG). Enables describing complex network architectures with multi-input branching (e.g., Stable Diffusion) and cross-block skip connections (e.g., U-Net).

**Key decisions:**
- Full graph model — every connection is an explicit edge, no implicit sequential defaults
- Input/output as first-class nodes on the canvas
- Auto DAG layout via dagre
- Dual connection UI: port-drag on canvas + dropdown selection in edit panel

## Motivation

The current v1 model cannot express:

1. **Multi-input branching** — Stable Diffusion has two parallel input paths (Prompt → CLIP, Image → VAE Encoder) that merge before UNet. v1 only supports a single `inputShape` string.
2. **Cross-block skip connections** — U-Net requires Enc1 → Dec1, Enc2 → Dec2 skip edges that connect nodes at different positions in the topology, not within a single block.
3. **Arbitrary DAG topologies** — Inception modules, multi-output heads, feature pyramid networks all require non-linear connection graphs.

## Data Model

### GraphNode

```typescript
type NodeKind = 'input' | 'output' | 'layer' | 'block'

interface GraphNode {
  id: string
  kind: NodeKind
  label: string                // display name
  // kind-specific fields:
  layerType?: string           // 'Conv2d', 'ReLU', etc (kind='layer')
  params?: LayerParams         // reuses existing type (kind='layer')
  inputShape?: string          // annotated tensor shape
  outputShape?: string
  repeat?: number              // block repeat badge (kind='block')
  children?: GraphNode[]       // nested nodes inside this block
  internalEdges?: GraphEdge[]  // edges inside this block
  codeMapping?: CodeMapping    // reuses existing type
}
```

### GraphEdge

```typescript
type EdgeStyle = 'forward' | 'skip'

interface GraphEdge {
  id: string
  source: string               // node id
  target: string               // node id
  label?: string               // tensor shape annotation on the arrow
  style: EdgeStyle             // forward=solid straight, skip=dashed curved
}
```

### NetworkDocument (v2)

```typescript
interface NetworkDocument {
  type: 'net'
  version: 2
  name: string
  nodes: GraphNode[]
  edges: GraphEdge[]
}
```

### Example: Stable Diffusion

```json
{
  "type": "net", "version": 2, "name": "Stable Diffusion",
  "nodes": [
    { "id": "in_prompt", "kind": "input",  "label": "Prompt",  "inputShape": "77×768" },
    { "id": "in_image",  "kind": "input",  "label": "Image",   "inputShape": "3×512×512" },
    { "id": "clip",      "kind": "layer",  "label": "CLIP",    "layerType": "CLIPTextEncoder" },
    { "id": "vae_enc",   "kind": "layer",  "label": "VAE Enc", "layerType": "VAEEncoder" },
    { "id": "unet",      "kind": "block",  "label": "UNet",    "children": [] },
    { "id": "vae_dec",   "kind": "layer",  "label": "VAE Dec", "layerType": "VAEDecoder" },
    { "id": "out",       "kind": "output", "label": "Output" }
  ],
  "edges": [
    { "source": "in_prompt", "target": "clip",     "style": "forward" },
    { "source": "in_image",  "target": "vae_enc",  "style": "forward" },
    { "source": "clip",      "target": "unet",     "style": "forward" },
    { "source": "vae_enc",   "target": "unet",     "style": "forward" },
    { "source": "unet",      "target": "vae_dec",  "style": "forward" },
    { "source": "vae_dec",   "target": "out",      "style": "forward" }
  ]
}
```

### Example: U-Net Skip Connections

```json
{
  "type": "net", "version": 2, "name": "U-Net",
  "nodes": [
    { "id": "input",      "kind": "input",  "label": "Input" },
    { "id": "enc1",       "kind": "block",  "label": "Enc1" },
    { "id": "enc2",       "kind": "block",  "label": "Enc2" },
    { "id": "bottleneck", "kind": "block",  "label": "Bottleneck" },
    { "id": "dec2",       "kind": "block",  "label": "Dec2" },
    { "id": "dec1",       "kind": "block",  "label": "Dec1" },
    { "id": "output",     "kind": "output", "label": "Output" }
  ],
  "edges": [
    { "source": "input",      "target": "enc1",       "style": "forward" },
    { "source": "enc1",       "target": "enc2",       "style": "forward" },
    { "source": "enc2",       "target": "bottleneck", "style": "forward" },
    { "source": "bottleneck", "target": "dec2",       "style": "forward" },
    { "source": "dec2",       "target": "dec1",       "style": "forward" },
    { "source": "dec1",       "target": "output",     "style": "forward" },
    { "source": "enc1",       "target": "dec1",       "style": "skip", "label": "copy" },
    { "source": "enc2",       "target": "dec2",       "style": "skip", "label": "copy" }
  ]
}
```

## v1 Compatibility

No migration. When opening a v1 `.net.json` file (`version: 1`):
- Display a message: "This file uses an older format. Create a new .net.json for the graph editor."
- The v2 graph editor only activates for `version: 2` documents
- App must not crash when encountering either version

## Canvas Rendering

### Layout Engine: dagre

- npm package: `dagre` + `@types/dagre`
- Input: nodes (with width/height estimates) + edges
- Output: `{x, y}` positions for every node
- Direction: top-to-bottom (`rankdir: 'TB'`)
- Called on every render (add/delete node triggers re-layout)

### Node Rendering by Kind

| Kind | Shape | Color | Ports |
|------|-------|-------|-------|
| `input` | Small rounded rect | `#f5f5f5` light gray | Output only (right side) |
| `output` | Small rounded rect | `#f5f5f5` light gray | Input only (left side) |
| `layer` | Rounded rect (LAYER_W × LAYER_H) | Per layer catalog color + 22 alpha fill | Left + right |
| `block` | Dashed rounded rect container | `#ff9800` orange dashed border | Left + right |

### Edge Rendering

- **forward**: Straight path with solid stroke + filled triangle arrowhead at target
- **skip**: Cubic bezier curve with dashed stroke + open triangle arrowhead

### Port Dots

- Rendered as small circles (r=3) on left (input) and right (output) edges of each node
- Semi-transparent by default (`opacity: 0.5`), full opacity on hover
- Output ports: `mousedown` begins drag-connect interaction
- Input ports: `mouseup` over them completes the connection

### Zoom/Pan

- Existing `d3.zoom()` behavior preserved
- Drag-connect interaction must work correctly under zoom transforms

## Connection UI

### A. Port Drag-Connect

1. Hover over output port → port dot highlights (opacity 1.0, larger radius)
2. `mousedown` on output port → temporary rubber-band `<line>` follows cursor
3. `mousemove` → update line endpoint to cursor position (accounting for zoom transform)
4. `mouseup` over input port → create `GraphEdge`, dispatch `ADD_EDGE`
5. `mouseup` over empty space → cancel, remove rubber-band

### B. Edit Panel Connection Management

When a node is selected, the bottom panel shows:

- **Input connections list**: Each incoming edge displayed as `sourceNodeLabel → thisNode [× delete]`
- **Add input dropdown**: `<select>` listing all valid upstream nodes (excludes self, output nodes, and nodes that would create cycles)
- **Output connections list**: Read-only display of outgoing edges (managed from target node's panel)

Port rules:
- `input` kind nodes: no input ports, no "Add input" UI
- `output` kind nodes: no output ports

## Node Operations

### Add Node

- **Layer**: Drag pill from NetworkPalette onto canvas → creates `kind: 'layer'` node. If a node is currently selected, auto-creates a `forward` edge from selected node to new node.
- **Input/Output**: Toolbar buttons "+ Input" / "+ Output" → creates node at top/bottom of graph
- **Block**: Existing "+ Add Block" button → creates `kind: 'block'` node

### Delete Node

- Select node + `Delete` key → removes node AND all edges referencing it (both source and target)

### Edit Node

- Select node → bottom panel shows parameter form (reuses existing `NetworkPanel` parameter rendering for `kind: 'layer'` nodes)
- Rename via label input
- For block nodes: show name + repeat fields (existing behavior)

## Reducer

Replace `networkReducer.ts` with graph-oriented actions:

```
SET_DOCUMENT    — load full document
ADD_NODE        — create node (layer/input/output/block)
DELETE_NODE     — remove node + all connected edges
UPDATE_NODE     — modify node field (label, params, shapes, etc)
ADD_EDGE        — create edge between two nodes
DELETE_EDGE     — remove edge
UPDATE_NETWORK_NAME — rename document
```

All actions use immutable updates (deep clone via `structuredClone`).

## Files to Change

| File | Change | Effort |
|------|--------|--------|
| `src/main/schemas/note-types.ts` | Add `GraphNode`, `GraphEdge`, v2 `NetworkDocument`, update `createNetworkDocument()`, update `isValidNetworkDocument()` | Medium |
| `src/renderer/src/components/editors/networkReducer.ts` | Rewrite: node/edge graph actions | Large |
| `src/renderer/src/components/editors/NetworkCanvas.tsx` | Integrate dagre layout, 4 node kinds, port drag-connect, edge rendering | Large |
| `src/renderer/src/components/editors/NetworkPanel.tsx` | Add connection list UI, "Add Input" dropdown, edge deletion | Medium |
| `src/renderer/src/components/editors/NetworkEditor.tsx` | "+ Input" / "+ Output" toolbar buttons, adapt to new state shape | Small |
| `src/renderer/src/components/editors/NetworkPalette.tsx` | No change required | — |
| `src/renderer/src/components/editors/NetworkEmbedViewer.tsx` | Handle v2 data model for static embed rendering | Small |
| `src/main/schemas/layer-catalog.ts` | No change required | — |
| `package.json` | Add `dagre` + `@types/dagre` | Tiny |

## Out of Scope

- Manual node drag-to-reposition (auto-layout only for now)
- Block collapse/expand in canvas
- Undo/redo
- Cycle detection (assume user creates acyclic graphs)
- v1 → v2 migration (v1 files render with existing v1 code path or show upgrade message)
- Multiple output nodes (initially single output; multi-output can be added later)

## Dependencies

- `dagre` — DAG layout algorithm (~0.8.5, MIT license)
- `@types/dagre` — TypeScript type definitions
