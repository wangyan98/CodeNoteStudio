---
name: network-graph
description: Create and edit .net.json network graph files — a notebook-specific format for visualizing neural network architectures as directed graphs with nodes (input/output/layer/block) and edges (forward/skip). Use when: (1) Creating new network graphs, (2) Adding layers/blocks/connections, (3) Updating node labels/params/code mappings, (4) Deleting nodes or connections. Triggers on .net.json file operations.
---

# Network Graph Skill

Operates on `.net.json` files — graph-based neural network visualizations with nodes and edges.

## Critical rules

- **NEVER write `.net.json` files directly.** All .net.json creation/modification MUST go through the scripts listed below. The scripts handle UUID generation, edge rewiring, and data integrity.
- **Writing build scripts is allowed.** You MAY directly write generator scripts like `scripts/build_*.py` that programmatically call the existing CRUD scripts (create/add_layer/add_connection/...) to produce a .net.json. This is the preferred approach for large architectures.
- **Scripts directory:** `skills/network-graph/scripts/`

## Purpose

`.net.json` is a notebook-specific format for **neural network architecture diagrams**. Each node represents a network component (input, output, layer, or block), and edges define data flow between them. Nodes carry typed parameters (layer type, shapes, hyperparameters) and optional `codeMapping` links to implementation code.

Typical use cases:
- Documenting model architectures (ResNet, Transformer, etc.)
- Auto-generating architecture diagrams from PyTorch/TensorFlow code
- Tracing forward/backward data flow through skip connections and blocks

## Node Kind Reference

**Label length constraint:** `label` on all node kinds (layer, block, input, output) must be kept **short and concise** — no more than ~20 characters. Long labels overflow the node box in the rendered graph and make diagrams unreadable. Prefer abbreviated or canonical names (e.g. `"Conv2d"` not `"Convolutional 2D Layer"`, `"BatchNorm"` not `"Batch Normalization"`). If a more detailed description is needed, place it in `params` or rely on `layerType` to convey the meaning.

### `kind: "layer"` — Individual network operation

Represents a single layer/operation: Conv2d, ReLU, BatchNorm, MaxPool, etc.

**Properties:** `id`, `kind`, `label`, `layerType`, `params`, `inputShape`, `outputShape`, `codeMapping`

```json
{"id": "uuid", "kind": "layer", "label": "conv1", "layerType": "Conv2d",
 "params": {"in_channels": 3, "out_channels": 16, "kernel_size": 3, "stride": 2},
 "inputShape": "3×640×640", "outputShape": "16×320×320"}
```

- `layerType` MUST match a key in `layer-catalog.json` (e.g. Conv2d, ReLU, BatchNorm2d, Linear, MaxPool2d…)
- `inputShape` / `outputShape`: tensor dimensions in `C×H×W` format (2D), `C×L` (1D), `C×D×H×W` (3D), or `N` (flat). **Always set both when known** — the UI renders them above/below the node box.
- Use `scripts/update_node.py --input-shape "3×640×640" --output-shape "16×320×320"` to set shapes after creating a layer.

### `kind: "block"` — Container for sub-operations

Represents a reusable sub-network (e.g. ResBlock, C2f, Bottleneck). A block **contains** child nodes (layers and internal edges) but does NOT have its own `layerType`, `params`, `inputShape`, or `outputShape`.

**Properties:** `id`, `kind`, `label`, `repeat`, `children`, `internalEdges`, `codeMapping`

```json
{"id": "uuid", "kind": "block", "label": "ResBlock", "repeat": 3,
 "children": [
   {"id": "uuid", "kind": "layer", "label": "conv1", "layerType": "Conv2d", ...},
   {"id": "uuid", "kind": "layer", "label": "conv2", "layerType": "Conv2d", ...}
 ],
 "internalEdges": [
   {"id": "uuid", "source": "<conv1-id>", "target": "<conv2-id>", "style": "forward"}
 ]}
```

**When to use block vs layer:**
- Use **layer** for individual operations (Conv2d, ReLU, MaxPool, Linear…)
- Use **block** only when a group of layers forms a reusable sub-component (ResBlock, C2f, TransformerBlock…)
- Do NOT set `layerType` or `params` on a block node — those fields belong on `kind: "layer"` only
- Do NOT set `inputShape`/`outputShape` on a block node — shapes go on individual layer nodes
- `direction`: Controls the block's internal layout direction — `"horizontal"` (left→right) or `"vertical"` (top→bottom). When omitted/null, the layout is auto-detected.

### Block direction

Direction controls how children are laid out within a block.

- **Vertical (TB)**: children flow top-to-bottom, ports spread horizontally on top/bottom edges. Skip edges exit via left/right sides.
- **Horizontal (LR)**: children flow left-to-right, ports spread vertically on left/right edges. Skip edges exit via top/bottom sides.

The top-level document layout is always vertical (blocks stack top-to-bottom). Direction only affects sub-layout within each block.

### `kind: "input"` / `kind: "output"` — Entry/exit points

```json
{"id": "uuid", "kind": "input", "label": "Input", "inputShape": "3×640×640"}
{"id": "uuid", "kind": "output", "label": "Output"}
```

## Document Structure (v2)

```json
{
  "type": "net", "version": 2, "name": "MyNetwork",
  "nodes": [
    {"id": "uuid", "kind": "input", "label": "Input", "inputShape": "3×640×640"},
    {"id": "uuid", "kind": "layer", "label": "conv1", "layerType": "Conv2d",
     "params": {"in_channels": 3, "out_channels": 16, "kernel_size": 3, "stride": 2},
     "inputShape": "3×640×640", "outputShape": "16×320×320"},
    {"id": "uuid", "kind": "block", "label": "C2f", "repeat": 1, "children": [
      {"id": "uuid", "kind": "layer", "label": "conv1", "layerType": "Conv2d", "params": {...},
       "inputShape": "16×320×320", "outputShape": "16×320×320"}
    ], "internalEdges": [...]},
    {"id": "uuid", "kind": "output", "label": "Output"}
  ],
  "edges": [
    {"id": "uuid", "source": "...", "target": "...", "style": "forward"},
    {"id": "uuid", "source": "...", "target": "...", "style": "skip", "label": "residual"}
  ]
}
```

Edge styles: forward, skip.

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/create_network.py <path> [--name]` | Create .net.json with input/output |
| `scripts/list_preset_layers.py` | List all available preset layer types and their parameters. Call this BEFORE add_layer to see valid layer types. |
| `scripts/add_layer.py <path> <type> [--name] [--params JSON]` | Insert layer before output |
| `scripts/add_block.py <path> <name> [--repeat N] [--direction horizontal|vertical]` | Create block node |
| `scripts/add_node_to_block.py <path> <block-id> <node-id>` | Move node into block |
| `scripts/add_connection.py <path> <from-id> <to-id> [--style] [--label]` | Add edge |
| `scripts/update_node.py <path> <node-id> [--label] [--params] [--input-shape] [--output-shape] [--code-mapping] [--direction horizontal|vertical]` | Update node |
| `scripts/delete_node.py <path> <node-id>` | Delete node + incident edges |
| `scripts/delete_connection.py <path> <edge-id>` | Delete single edge |
| `scripts/build_yolov5n.py <path> [--name]` | Build a complete YOLOv5n net.json with direction-aware blocks |

### create_network.py

```bash
python scripts/create_network.py model.net.json --name "ResNet50"
# => {"ok": true, "inputId": "uuid", "outputId": "uuid"}
```

### add_layer.py

```bash
python scripts/add_layer.py model.net.json Conv2d --name "conv1" --params '{"in_channels":3,"out_channels":64,"kernel_size":7}'
# => {"ok": true, "id": "uuid"}
```

Automatically inserts before output and rewires edges.

### add_connection.py

```bash
python scripts/add_connection.py model.net.json <from-id> <to-id> --style skip --label "residual"
# => {"ok": true, "id": "uuid"}
```

Deduplicates: returns existing edge if same source->target pair already exists.

### update_node.py

```bash
# Update label
python scripts/update_node.py model.net.json <node-id> --label "conv_better_name"

# Update params (JSON)
python scripts/update_node.py model.net.json <node-id> --params '{"in_channels":3,"out_channels":64,"kernel_size":7}'

# Set tensor shapes (use × separator, C×H×W format)
python scripts/update_node.py model.net.json <node-id> --input-shape "3×640×640" --output-shape "16×320×320"

# Code mapping
python scripts/update_node.py model.net.json <node-id> --code-mapping '{"raw":"...","functionName":"...","filePath":"...","startLine":1,"endLine":10}'
```

Flags can be combined in a single call. Shapes only apply to `kind: "layer"` and `kind: "input"`/`"output"` nodes — do NOT set shapes on `kind: "block"` nodes.

### update_node.py (direction)

```bash
# Set block layout direction
python scripts/update_node.py model.net.json <block-id> --direction horizontal
python scripts/update_node.py model.net.json <block-id> --direction vertical
```

### build_yolov5n.py

```bash
python scripts/build_yolov5n.py yolov5n-direction-aware.net.json --name "YOLOv5n (direction-aware)"
# => {"ok": true, "path": "...", "backboneId": "...", "neckId": "...", "detectId": "..."}
```

Creates a complete YOLOv5n net.json with direction-aware blocks for visual clarity.

### add_block.py (direction)

```bash
# Create a block with explicit layout direction
python scripts/add_block.py model.net.json "MyBlock" --direction horizontal
python scripts/add_block.py model.net.json "MyBlock" --direction vertical
```
