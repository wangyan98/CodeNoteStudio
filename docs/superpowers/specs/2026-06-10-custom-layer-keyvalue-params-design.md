# Custom Layer with Key-Value Params in Network Editor

Date: 2026-06-10

## Problem

When editing `.net.json` files via Agent skills (e.g., `add_layer`), there is no "custom" layer type in the preset palette. Users/Agents often need to represent non-standard layers (C2f, SPPF, Concat, Upsample, etc.) but are forced to use `kind: "block"` instead of `kind: "layer"` because no suitable preset exists. Using blocks as stand-ins for custom layers is semantically wrong and loses the parameter editing UX.

## Solution

Add a **"Custom"** entry to the preset layer palette. Dragging it in creates a `kind: "layer"` node. The parameter panel shows a dynamic key-value editor instead of fixed-typed fields.

## Design

### 1. layer-catalog.json — new "Custom" entry

```json
"Custom": {
  "category": "custom",
  "color": "#9e9e9e",
  "params": []
}
```

### 2. LayerParamDef — extend type union

`src/main/schemas/layer-catalog.ts`:

```ts
export interface LayerParamDef {
  name: string
  type: 'number' | 'string' | 'boolean' | 'number[]' | 'keyValue'
  default?: unknown
  required?: boolean
}
```

The `"keyValue"` type signals the UI to render a dynamic key-value editor instead of a single typed field.

Actually — simpler approach: we don't need a new param type. When `layerType` has an empty params list (or no matching catalog entry), the NetworkPanel renders the key-value editor. No schema change needed.

### 3. NetworkPalette — add "custom" category

`src/renderer/src/components/editors/NetworkPalette.tsx`:

- `CATEGORY_ORDER`: append `"custom"`
- `CATEGORY_LABELS`: add `custom: "Custom"`

### 4. NetworkPanel — key-value param editor

When `node.kind === 'layer'` and `params.length === 0` (no preset params for this layerType), render a key-value editor:

```
┌─ Parameters ──────────────────────┐
│ [key input]  [value input]  [✕]  │
│ [key input]  [value input]  [✕]  │
│ [+ Add param]                     │
└───────────────────────────────────┘
```

Behavior:
- All values stored as strings in `node.params: Record<string, unknown>`
- "Add param" appends a blank row
- "✕" removes the row and deletes the key from params
- Existing params are loaded from `node.params` on mount (supports editing nodes that already have arbitrary params)

### 5. list_preset_layers.py — no changes

Already reads `layer-catalog.json` dynamically and will automatically include the new "Custom" entry.

## Files Changed

| File | Change |
|------|--------|
| `layer-catalog.json` | Add `"Custom"` entry with `category: "custom"`, empty params |
| `src/renderer/src/components/editors/NetworkPalette.tsx` | Add `"custom"` to `CATEGORY_ORDER` and `CATEGORY_LABELS` |
| `src/renderer/src/components/editors/NetworkPanel.tsx` | Add key-value editor for layers with no preset params |

## Non-Goals

- Not adding a project-level layer override system (out of scope)
- Not changing how preset layers (Conv2d, Linear, etc.) render their params
- Not modifying Agent tools — `add_layer` already accepts any `layer_type` string including "Custom"
