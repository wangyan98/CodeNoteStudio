# Layer Input/Output Shape Display & Auto-Computation

## Summary

Display input and output tensor shapes on network graph nodes (above/below the node box), and auto-compute output shapes from layer parameters when possible, with manual override support.

## Motivation

The YOLOv8n reference table (06_network_architecture.md) shows each layer's input/output dimensions alongside its parameter count — e.g., `Conv(3→16, s=2): 640×640×3 → 320×320×16`. Currently, network nodes only show the layer label. Users must manually trace dimensions through the network, which is error-prone and slow.

## Design

### 1. Shape Computation Utility (`src/main/utils/shape-computation.ts`)

Pure function with the signature:

```ts
export function computeOutputShape(
  layerType: string,
  inputShape: string,
  params: Record<string, unknown>
): string | null
```

**Shape format:** `C×H×W` for 2D layers, `C×L` for 1D, `N` for Linear output.

**Computation rules by layer type:**

| Layer Type | Relevant Params | Output Formula |
|---|---|---|
| Conv1d/2d/3d | `out_channels`, `kernel_size`, `stride`, `padding`, `dilation` | `out_spatial = floor((in - dilation*(k-1) - 1 + 2p) / s + 1)`, out_ch = `out_channels` |
| ConvTranspose2d | same as Conv | `out_spatial = (in - 1) * s - 2p + k` |
| MaxPool2d/AvgPool2d | `kernel_size`, `stride`, `padding` | same spatial formula as Conv, out_ch = in_ch |
| Linear | `out_features` | output = `out_features` (flattens spatial dims → scalar features) |
| BatchNorm*, LayerNorm, InstanceNorm*, ReLU, GELU, Sigmoid, Tanh, Softmax, Identity, Dropout* | — | passthrough: output = input |
| LSTM, GRU | `hidden_size` | output = `hidden_size` (1D) |
| Embedding | `embedding_dim` | output = `embedding_dim` |
| Everything else | — | returns `null` (requires manual entry) |

### 2. Canvas Rendering (`NetworkCanvas.tsx`)

Display shape strings outside the node rectangle:

```
      3×640×640       ← input shape, 9px, #888, above node
    ┌──────────┐
    │  Conv2d  │       ← node box unchanged (42px)
    └──────────┘
     16×320×320       ← output shape, 9px, #bbb, below node
```

- Text positioned at `ny - 4` (input) and `ny + NODE_H + 12` (output), text-anchor middle
- Only rendered when `inputShape`/`outputShape` is non-empty
- Same treatment for children inside block nodes
- Input/output kind nodes keep existing behavior (already show shape inside the box)
- Layout unchanged — shapes are outside node bounds, no dagre height adjustment needed

### 3. Panel Auto-Computation (`NetworkPanel.tsx`)

- Call `computeOutputShape(layerType, inputShape, params)` whenever params or inputShape change
- Display computed output shape in the "Tensor Shapes" section with a dimmed style
- Add a lock/unlock toggle button next to the output shape input:
  - **Locked (auto):** read-only display of computed value; dimmed text
  - **Unlocked (manual):** editable input for user override
- Initial state: auto if computation succeeds, manual otherwise
- Clearing the manual value reverts to auto mode

### 4. Tests (`tests/unit/shape-computation.test.ts`)

- Conv2d with stride=1, stride=2, with padding, with dilation
- MaxPool2d kernel=2 stride=2
- ConvTranspose2d upsampling
- Passthrough layers (BatchNorm, ReLU, Dropout)
- Linear layer
- Returns null for missing params or invalid input shape string
- Malformed input shape string returns null

## File Changes

| File | Change |
|---|---|
| `src/main/utils/shape-computation.ts` | New: shape computation utility |
| `src/renderer/src/components/editors/NetworkCanvas.tsx` | Render inputShape/outputShape text above/below layer nodes |
| `src/renderer/src/components/editors/NetworkPanel.tsx` | Auto-compute + lock toggle for output shape |
| `tests/unit/shape-computation.test.ts` | New: unit tests |
