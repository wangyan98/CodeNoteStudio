---
name: network-graph
description: Create and edit .net.json network graph files — a notebook-specific format for visualizing neural network architectures as directed graphs with nodes (input/output/layer/block) and edges (forward/skip). HARD RULES: (1) NEVER write .net.json by hand — use build scripts only, (2) Complex networks MUST be split across multiple .net.json files (overview + component diagrams). Triggers on .net.json file operations.
---

# Network Graph Skill

Operates on `.net.json` files — graph-based neural network visualizations with nodes and edges.

## Critical rules

### 1. NEVER write `.net.json` files directly

You MUST NOT create, write, or edit `.net.json` files by hand. All `.net.json` operations go through the scripts listed below. The scripts handle UUID generation, edge rewiring, and data integrity. **If you find yourself writing JSON — STOP. Use a build script instead.**

Punishment for writing .net.json directly: UUID collision, broken edge references, data corruption.

### 2. Layers and blocks — know the difference

**Layers and blocks are fundamentally different.** A common mistake is treating blocks as if they were layers — setting `layerType`, `params`, `inputShape`, or `outputShape` on a block node. Those fields belong on `kind: "layer"` only.

- **`kind: "layer"`** — A single operation (Conv2d, ReLU, BatchNorm, Linear…). Has `layerType`, `params`, `inputShape`, `outputShape`.
- **`kind: "block"`** — A container that groups nodes together. Has `children`, `internalEdges`, `repeat`, `direction`. Does NOT have `layerType`, `params`, or shapes.

Layers MAY exist at the top level of a diagram alongside input/output nodes. Blocks are the recommended way to organize layers into named sub-components (Backbone, Head, Neck, ConvStage, ResBlock, etc.), but they are not mandatory. Use blocks when grouping improves readability — don't force every layer into a block if it doesn't add clarity.

### 3. Creating new `.net.json` files: build scripts only

  To create a brand-new network graph, you MUST scaffold a build script with
  `scripts/create_build_script.py <full-path> --workspace <workspace-path>`,
  edit it to define the architecture, and execute it. Do NOT use other scripts
  (such as `create_network.py`) for initial file creation — those are
  adjustment tools for existing `.net.json` files only.
  → **MANDATORY: Split complex architectures.** Before writing any build script,
    assess whether the network needs multiple diagrams per the
    [Multi-Diagram Architectures](#multi-diagram-architectures) rules. Almost
    all non-trivial networks need at minimum an overview + 1-2 component
    diagrams. Each diagram gets its own `build_xxx.py` script and its own
    `.net.json` file. A single `build_xxx.py` MAY produce multiple `.net.json`
    files (overview + per-component) for closely related diagrams.
  → All build scripts MUST be created in the workspace directory (not inside
    skills/network-graph/scripts/).
  → Execute them with `python <script-path> <output-path>`. Only Python scripts
    are allowed — do NOT create or execute shell scripts, binaries, or other
    executable types.
  → Output `.net.json` files must also land in the workspace.
  → PermissionGuard enforces these boundaries; violations return an error.
  → For complex networks, a single build script MAY produce multiple `.net.json`
    files (overview + per-component diagrams). See **Multi-Diagram Architectures**
    for when and how to split.
- **Adjusting existing `.net.json` files (#4):** Use the individual scripts
  (`add_layer.py`, `add_block.py`, `add_connection.py`, `update_node.py`,
  `delete_node.py`, `delete_connection.py`, `add_node_to_block.py`) for
  incremental edits to an existing file. These are NOT for initial creation.
- **Scripts directory (#5):** `skills/network-graph/scripts/`

## Purpose

`.net.json` is a notebook-specific format for **neural network architecture diagrams**. Each node represents a network component (input, output, layer, or block), and edges define data flow between them. Nodes carry typed parameters (layer type, shapes, hyperparameters) and optional `codeMapping` links to implementation code.

Typical use cases:
- Documenting model architectures (ResNet, Transformer, etc.)
- Auto-generating architecture diagrams from PyTorch/TensorFlow code
- Tracing forward/backward data flow through skip connections and blocks

## Multi-Diagram Architectures

**This is a HARD rule, not a suggestion.** Complex networks MUST be split across multiple `.net.json` files. Do NOT cram everything into a single diagram.

The overview diagram shows the high-level architecture as blocks and their data flow. Each major sub-module gets its own component diagram with full internal detail. Sub-modules that are themselves complex (e.g., an MLP block with multiple layers) SHOULD appear by name only in the component diagram — their internal structure goes in yet another dedicated diagram built by a separate `build_xxx.py` script.

### How splitting works

```
Overview (.net.json)
  └─ Block "Backbone"       → backbone.net.json (detailed layers)
       └─ Block "MLP"       → mlp.net.json (separate build script)
```

- **Overview diagram** — high-level blocks and inter-block connections. Blocks serve as abstractions with only `label`, `direction`, and `repeat` — NO internal `children` or `internalEdges`. Keep the overview focused on data flow between major components.
- **Component diagrams** — one `.net.json` per major sub-module. When a sub-module contains a reusable sub-component (e.g., MLP, FFN, Attention), keep that sub-component as a single block node by name only (empty `children`), and build its internal details in a separate `.net.json` file with its own `build_xxx.py` script.

### When to split (any of these triggers = MUST split)

- The top-level graph has more than ~8–12 nodes (blocks + layers + input/output)
- A sub-module has significant internal complexity (e.g., ViT with 32 transformer blocks, FPN with multiple scale branches)
- The same sub-module is reused across different architectures (split it out for reuse)
- Cross-block skip connections would create excessive edge crossings in a single diagram
- Block nesting exceeds 2 levels (block → block → layer) — split deeper sub-modules into dedicated component diagrams
- **Any block that itself contains multiple layers** — build it as a separate diagram, reference it by name in the parent

### Naming conventions

- Use a consistent naming pattern: `<model>-overview.net.json`, `<model>-backbone.net.json`, `<model>-neck.net.json`, `<model>-mlp.net.json`, etc.
- Corresponding build scripts: `build_<model>_overview.py`, `build_<model>_backbone.py`, etc.

### How to represent sub-modules

When a component diagram references a sub-module that has its own detailed diagram:

**In the parent diagram**, add a block node with `label` only — no `children`, no `internalEdges`. The label matches the sub-module's name:

```json
{"id": "uuid", "kind": "block", "label": "MLP", "repeat": 1}
```

**In a separate build script**, create the sub-module's dedicated `.net.json` with full internal detail (layers, shapes, edges, parameters).

This keeps each diagram focused and readable — a block labeled "MLP" signals "details in `mlp.net.json`" without cluttering the parent.

### Anti-pattern (avoid)

One monolithic diagram with 20+ top-level nodes, deeply nested block children (3+ levels), and dense cross-graph skip edges. This produces an unreadable graph.

Also avoid: a block with its full internal layers enumerated in the overview diagram. Move those layers to a dedicated component diagram.

### Example — SAM3 split

| File | Build Script | Contents |
|------|-------------|----------|
| `sam3-overview.net.json` | `build_sam3_overview.py` | Image/Text inputs → ViT backbone block → FPN neck block → VL backbone block → Transformer Encoder/Decoder blocks → Segmentation Head block → Output. Blocks show only name + direction + repeat, no internal layers. |
| `sam3-vit-backbone.net.json` | `build_sam3_vit.py` | PatchEmbed → 7 ViT stages (windowed + global attention), with full shape annotations and internal edges. |
| `sam3-fpn-neck.net.json` | `build_sam3_fpn.py` | PositionEmbeddingSine → 4-scale feature pyramid (P2–P5) with individual ConvTranspose2d/Conv2d/MaxPool2d layers. |
| `sam3-transformer-decoder.net.json` | `build_sam3_decoder.py` | Query Embeddings → 6 decoder layers → BBox regression head, with self/cross-attention annotations. |
| `sam3-mlp.net.json` | `build_sam3_mlp.py` | Full MLP internals: Linear → GELU → Dropout → Linear, with shapes and parameters. Referenced by name ("MLP") in the decoder diagram. |

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

**Blocks are always available — no network declaration required.** You can create and use blocks freely in any `.net.json` file without needing to declare or register the network first. Blocks are the fundamental organizational unit and work out of the box.

**When to use block vs layer:**
- Use **layer** for individual operations (Conv2d, ReLU, MaxPool, Linear…). Layers can live at the top level or inside blocks — both are valid.
- Use **block** to group related nodes into a named sub-component. Common block patterns include:
  - **Architectural stages:** Backbone, Head, Neck — high-level YOLO-style network structure concepts
  - **Reusable modules:** ConvStage, ResBlock, MLP, C2f, TransformerBlock, Bottleneck, FPN, SPPF
- Do NOT set `layerType` or `params` on a block node — those fields belong on `kind: "layer"` only
- Do NOT set `inputShape`/`outputShape` on a block node — shapes go on individual layer nodes
- `direction`: Controls the block's internal layout direction — `"horizontal"` (left→right) or `"vertical"` (top→bottom). When omitted/null, the layout is auto-detected.

**Nesting limit:** Blocks can be nested at most **2 levels deep** (block → block → layer). A block's `children` may contain layers and/or one extra level of blocks, but those nested blocks may only contain layers — no further nesting. If an architecture requires deeper nesting (e.g., Stage → ResBlock → Bottleneck → Conv2d), split it into separate `.net.json` files following the [Multi-Diagram Architectures](#multi-diagram-architectures) pattern.

### Block direction

Direction controls how children are laid out within a block.

- **Vertical (TB)**: children flow top-to-bottom, ports spread horizontally on top/bottom edges. Skip edges exit via left/right sides.
- **Horizontal (LR)**: children flow left-to-right, ports spread vertically on left/right edges. Skip edges exit via top/bottom sides.

**Auto-detection rule:** When `direction` is omitted or `null`, the renderer auto-detects the layout by counting outgoing forward edges from each child node. If any child has **2 or more outgoing forward edges** (i.e., the block contains branching/skip connections, shown as green dashed lines), the block is laid out **horizontally (LR)**. Otherwise it defaults to **vertical (TB)**. This convention should guide block creation: use `--direction horizontal` (or omit direction and rely on auto-detection) when a block contains multi-branch skip connections, and `--direction vertical` for simple sequential chains.

Block `direction` only affects the internal layout of children within that block. The top-level arrangement of nodes (blocks, layers, input/output) is auto-detected by the renderer — it is NOT forced to a single orientation. This allows the overview diagram to flow naturally based on the graph structure, while individual blocks can still enforce a consistent internal direction (e.g., a backbone block as horizontal, a neck block as vertical).

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

### Build scripts (create new .net.json files)

| Script | Purpose |
|--------|---------|
| `scripts/create_build_script.py <path> --workspace <dir>` | Scaffold a new build script in workspace. **Use this for creating new .net.json files.** |
| `scripts/build_yolov5n.py <path> [--name]` | Reference: complete YOLOv5n net.json with direction-aware blocks |

### Adjustment scripts (modify existing .net.json files)

| Script | Purpose |
|--------|---------|
| `scripts/list_preset_layers.py` | List all available preset layer types and their parameters. Call this BEFORE add_layer to see valid layer types. |
| `scripts/add_layer.py <path> <type> [--name] [--params JSON]` | Insert layer before output |
| `scripts/add_block.py <path> <name> [--repeat N] [--direction horizontal\|vertical] [--parent <block-id>]` | Add block node |
| `scripts/add_node_to_block.py <path> <block-id> <node-id>` | Move node into block |
| `scripts/add_connection.py <path> <from-id> <to-id> [--style] [--label]` | Add edge |
| `scripts/update_node.py <path> <node-id> [--label] [--params] [--input-shape] [--output-shape] [--code-mapping] [--direction horizontal\|vertical]` | Update node |
| `scripts/delete_node.py <path> <node-id>` | Delete node + incident edges |
| `scripts/delete_connection.py <path> <edge-id>` | Delete single edge |

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
