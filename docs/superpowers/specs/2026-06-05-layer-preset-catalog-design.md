# Design: Network Graph — Preset Layer Catalog from Single JSON Source

## Context

The network-graph skill (`skills/network-graph/`) creates `.net.json` files for neural network architecture diagrams. The UI already has a draggable palette of ~25 preset layers (Conv2d, BatchNorm, ReLU, LSTM, etc.) defined in `src/main/schemas/layer-catalog.ts` as hardcoded TypeScript. Each layer has a `category`, `color`, and typed `params` list (param name, type, default, required).

**Problem**: The agent has zero knowledge of these preset layers. When calling `add_layer`, it invents `layer_type` strings from scratch without any param guidance. The palette catalog and agent catalog are completely disconnected.

## Design

**Single source of truth**: `layer-catalog.json` at the project root. Both Python (agent) and TypeScript (UI) read from this file.

### Data Flow

```
layer-catalog.json (project root)
    ├── Python: list_preset_layers.py reads → agent tool
    └── TS: layer-catalog.ts imports → NetworkPalette UI + resolveLayerCatalog()
```

### JSON Schema

```json
{
  "layers": {
    "Conv2d": {
      "category": "convolution",
      "color": "#4a90d9",
      "params": [
        { "name": "in_channels",  "type": "number",  "required": true,  "default": null },
        { "name": "out_channels", "type": "number",  "required": true,  "default": null },
        { "name": "kernel_size",  "type": "number",  "required": false, "default": 3 },
        { "name": "stride",       "type": "number",  "required": false, "default": 1 },
        { "name": "padding",      "type": "number",  "required": false, "default": 0 },
        { "name": "dilation",     "type": "number",  "required": false, "default": 1 },
        { "name": "groups",       "type": "number",  "required": false, "default": 1 },
        { "name": "bias",         "type": "boolean", "required": false, "default": true }
      ]
    },
    ...
  }
}
```

### File Changes

| Action | File | Purpose |
|--------|------|---------|
| Create | `layer-catalog.json` | Single source: all preset layers extracted from BUILTIN_LAYERS |
| Create | `skills/network-graph/scripts/list_preset_layers.py` | Script that reads JSON and prints layer list to stdout |
| Modify | `agent/tools/network_tools.py` | Register `list_preset_layers` tool |
| Modify | `src/main/schemas/layer-catalog.ts` | Replace hardcoded `BUILTIN_LAYERS` with JSON import; keep `LayerDef`, `LayerCatalogOverrides`, `resolveLayerCatalog()`, `getLayerDef()` |
| Modify | `agent/context.py` | Mention `list_preset_layers` in Network graphs line |

### Agent Tool: list_preset_layers

- **Name**: `list_preset_layers`
- **Description**: List available preset layer types and their parameter definitions
- **Parameters**: none
- **Handler**: Runs `skills/network-graph/scripts/list_preset_layers.py`
- **Output**: JSON with all layers and their params (name, type, default, required)

### Behavior

- Agent calls `list_preset_layers` to see available layer types and their params
- Agent uses `add_layer(path, layer_type, name)` with a known preset type and fills params via `update_node --params`
- Custom layers NOT in the catalog still work — `add_layer` accepts any `layer_type` string

## Non-Goals

- No change to `add_layer` tool signature
- No automatic param validation in the agent flow
- No catalog hot-reload (JSON is read at import time on TS side, at script invocation on Python side)

## Testing

- `list_preset_layers.py` returns valid JSON with all layers
- `layer-catalog.ts` compiles and produces same catalog as before (same layer names, same params)
- NetworkPalette renders same pills as before
- Existing network-graph tests pass
