# Network Visualization (.net.json) — Design Spec

## Overview

Add a 5th note type `.net.json` for building and visualizing deep learning neural network architectures. Targets PyTorch as the primary framework. Users manually define network structure in JSON; each layer can link to source code via existing `@ref()` machinery. A rich editor with drag-and-drop palette, block-diagram canvas, and form-based parameter panel supports authoring.

## Data Model

New types in `src/main/schemas/note-types.ts`:

```typescript
interface LayerParams {
  [key: string]: string | number | boolean | number[]
}

interface NetworkLayer {
  id: string
  type: string              // 'Conv2d', 'BatchNorm2d', 'Linear', 'ReLU', etc.
  name?: string             // optional display override
  params: LayerParams       // { in_channels: 3, out_channels: 64, kernel_size: 3 }
  inputShape?: string       // user-annotated: '3×224×224'
  outputShape?: string      // auto-computed or user-overridden
  codeMapping?: CodeMapping // reuses existing type; @ref() resolution
}

interface NetworkConnection {
  id: string
  from: string              // layer id, '#block_input', or '#block_output'
  to: string
  label?: string            // edge annotation (tensor shape)
}

interface NetworkBlock {
  id: string
  name: string              // 'ResidualBlock', 'Stem', etc.
  repeat?: number           // block repeats N times (rendered with ×N badge)
  layers: NetworkLayer[]
  connections: NetworkConnection[]  // if empty, layers connect sequentially by array order
  skipConnections: NetworkConnection[]
  blocks: NetworkBlock[]    // nested sub-blocks
  codeMapping?: CodeMapping
}

interface NetworkDocument {
  type: 'net'
  version: 1
  name: string              // 'ResNet-18'
  inputShape: string        // '3×224×224'
  blocks: NetworkBlock[]
  connections: NetworkConnection[]  // top-level connections between blocks
}
```

Factory and validator functions follow the existing pattern (`createNetworkDocument`, `isValidNetworkDocument`).

## Layer Catalog

### Built-in (`src/main/schemas/layer-catalog.ts`)

A `Record<string, LayerDef>` covering ~25 common `torch.nn` modules:

| Category | Layers |
|---|---|
| Convolution | Conv1d, Conv2d, Conv3d, ConvTranspose2d |
| Normalization | BatchNorm1d, BatchNorm2d, LayerNorm, InstanceNorm2d |
| Activation | ReLU, LeakyReLU, GELU, Sigmoid, Tanh, Softmax |
| Pooling | MaxPool2d, AvgPool2d, AdaptiveAvgPool2d |
| Linear / FC | Linear, Identity |
| Dropout | Dropout, Dropout2d |
| Recurrent | LSTM, GRU |
| Embedding | Embedding |
| Attention | MultiheadAttention |

```typescript
interface LayerParamDef {
  name: string
  type: 'number' | 'string' | 'boolean' | 'number[]'
  default?: unknown
  required?: boolean
}

interface LayerDef {
  category: string     // groups items in the palette strip
  color: string        // hex fill color for diagram nodes
  params: LayerParamDef[]
}
```

### Project overrides (`notes/.layer-catalog.json`)

Optional per-project JSON with `extend` (add custom layers) and `override` (change colors/defaults of built-ins). Merged at load time via `resolveLayerCatalog()`: load built-ins → apply overrides → add extensions.

## Editor Layout (3 vertical panels)

```
┌─────────────────────────────────────────────┐
│ Toolbar: [Network name] [Input shape] [Save]│
├─────────────────────────────────────────────┤
│ Palette strip (horizontal, by category)     │  ← draggable pills
├─────────────────────────────────────────────┤
│                                             │
│  Canvas (SVG block diagram)                 │  ← blocks, layers, connections
│                                             │
├─────────────────────────────────────────────┤ ← resizable handle
│  Edit panel: param form | code mapping      │
└─────────────────────────────────────────────┘
```

### Palette (top strip)

- Horizontal row of draggable layer-type pills, grouped by category with `|` separators
- Pills sourced from the resolved layer catalog
- Dragging a pill onto the canvas adds a new layer of that type

### Canvas (center)

SVG rendered with D3 (already a dependency).

**Block rendering:**
- Dashed rounded rectangle containing its layers and sub-blocks
- Header: block name + repeat badge (`×3` in a colored pill)  
- Nested blocks rendered recursively with slightly smaller font/padding

**Layer rendering:**
- Rounded rect filled with the catalog color for that layer type
- Displays: type name + key params (e.g., `Conv2d 64→64, k=3`)
- Connection port dots on left/right edges when hovered

**Connection rendering:**
- Straight arrows between sequential layers (when `connections` is empty, layers are connected in array order)
- Curved bezier dashed paths for skip connections
- Edge labels show tensor shapes when annotated

**Selection:** click to select (blue glow); Delete key removes and auto-connects predecessor→successor.

### Edit panel (bottom, resizable)

Left side: parameter form auto-generated from the catalog's `LayerParamDef[]` for the selected layer. Right side: `@ref()` input field for code mapping + tensor shape annotation fields.

## Code Mapping Integration

Reuses the existing `CodeMapping` type and `ref-resolver.ts` pipeline:

1. User types `@ref(models/resnet.py:Block.conv1:42)` in the edit panel's code mapping field  
2. On save, `parseRefs()` extracts the raw ref  
3. `resolveRefs()` resolves it against tree-sitter symbol index (5-tier priority)
4. Result cached as `.net.json.refs.json` sidecar via existing `ref-cache.ts`
5. Mermaid/Markdown embed viewers render the `@ref(...)` link with code snippet preview

No new pipeline needed — the layer just stores a `CodeMapping` and the existing machinery handles the rest.

## File Integration

| File | Change |
|---|---|
| `src/main/schemas/note-types.ts` | Add `NetworkLayer`, `NetworkBlock`, `NetworkConnection`, `NetworkDocument` |
| `src/main/schemas/layer-catalog.ts` | **New** — ~25 PyTorch layer definitions + `resolveLayerCatalog()` |
| `src/main/services/note-service.ts` | Add `'net'` case for `.net.json` CRUD |
| `src/main/types.ts` | `NoteFileType` += `'net'` |
| `src/renderer/src/types/index.ts` | `NoteType` += `'net'` |
| `src/renderer/src/components/editors/NetworkEditor.tsx` | **New** — top-level 3-panel editor |
| `src/renderer/src/components/editors/NetworkCanvas.tsx` | **New** — D3 SVG canvas |
| `src/renderer/src/components/editors/NetworkPanel.tsx` | **New** — bottom edit panel |
| `src/renderer/src/components/editors/NetworkPalette.tsx` | **New** — horizontal layer strip |
| `src/renderer/src/components/editors/networkReducer.ts` | **New** — state reducer |
| `src/renderer/src/components/editors/NetworkEmbedViewer.tsx` | **New** — static embed for `.md` |
| `src/renderer/src/services/markdown-renderer.ts` | Add `'net'` to `inferEmbedType` |
| `src/renderer/src/components/NoteViewport.tsx` | Route `'net'` to `NetworkEditor` |

## Embedding in Markdown

- `![[models/resnet.net.json]]` in `.md` files embeds as a **static SVG** diagram
- `inferEmbedType()` recognizes `.net.json` → `'net'`
- `EmbedCard.tsx` loads the JSON and renders via `NetworkEmbedViewer` (read-only, no drag)
- Clicking a layer in the embed still navigates to source code via `onNavigateToCode`
- First-level-only policy enforced by existing `renderMarkdownForEmbed()` stripping

## Future: Agent Integration

The JSON schema is designed for LLM-generatability:
- Structured types with predictable key names
- Optional fields (`name`, `codeMapping`, tensor shapes) have clear defaults
- Layer catalog provides a constrained vocabulary of `type` values
- An agent could parse a `.py` file, extract `nn.*` calls, and emit a `.net.json` document

## Out of Scope

- Auto-parsing Python source to extract layers (agent-driven, future)
- Training metrics / loss curves
- ONNX or model-weight import
- Framework support beyond PyTorch (extensible via catalog overrides, but no built-in TF/JAX catalog)
