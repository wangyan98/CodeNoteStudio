---
name: network-graph
description: Create and edit .net.json network graph files — a notebook-specific format for visualizing neural network architectures as directed graphs with nodes (input/output/layer/block) and edges (forward/skip). Use when: (1) Creating new network graphs, (2) Adding layers/blocks/connections, (3) Updating node labels/params/code mappings, (4) Deleting nodes or connections. Triggers on .net.json file operations.
---

# Network Graph Skill

Operates on `.net.json` files — graph-based neural network visualizations with nodes and edges.

## Purpose

`.net.json` is a notebook-specific format for **neural network architecture diagrams**. Each node represents a network component (input, output, layer, or block), and edges define data flow between them. Nodes carry typed parameters (layer type, shapes, hyperparameters) and optional `codeMapping` links to implementation code.

Typical use cases:
- Documenting model architectures (ResNet, Transformer, etc.)
- Auto-generating architecture diagrams from PyTorch/TensorFlow code
- Tracing forward/backward data flow through skip connections and blocks

## Document Structure (v2)

```json
{
  "type": "net", "version": 2, "name": "MyNetwork",
  "nodes": [
    {"id": "uuid", "kind": "input", "label": "Input"},
    {"id": "uuid", "kind": "layer", "label": "conv1", "layerType": "Conv2d", "params": {"in_channels": 3}},
    {"id": "uuid", "kind": "block", "label": "ResBlock", "repeat": 3, "children": [...]},
    {"id": "uuid", "kind": "output", "label": "Output"}
  ],
  "edges": [
    {"id": "uuid", "source": "...", "target": "...", "style": "forward", "label": null},
    {"id": "uuid", "source": "...", "target": "...", "style": "skip", "label": "residual"}
  ]
}
```

Node kinds: input, output, layer, block. Edge styles: forward, skip.

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/create_network.py <path> [--name]` | Create .net.json with input/output |
| `scripts/add_layer.py <path> <type> [--name] [--params JSON]` | Insert layer before output |
| `scripts/add_block.py <path> <name> [--repeat N]` | Create block node |
| `scripts/add_node_to_block.py <path> <block-id> <node-id>` | Move node into block |
| `scripts/add_connection.py <path> <from-id> <to-id> [--style] [--label]` | Add edge |
| `scripts/update_node.py <path> <node-id> (--label|--params|--code-mapping) <value>` | Update node |
| `scripts/delete_node.py <path> <node-id>` | Delete node + incident edges |
| `scripts/delete_connection.py <path> <edge-id>` | Delete single edge |

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
