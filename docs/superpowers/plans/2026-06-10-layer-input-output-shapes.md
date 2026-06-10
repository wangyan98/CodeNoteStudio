# Layer Input/Output Shape Display & Auto-Computation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display input/output tensor shapes on network graph nodes (above/below) and auto-compute output shapes from layer parameters with manual override.

**Architecture:** A pure utility function `computeOutputShape` parses shape strings and applies per-layer-type formulas. NetworkCanvas renders shapes as external text labels. NetworkPanel calls the utility to auto-fill output shapes with a lock/unlock toggle for manual override.

**Tech Stack:** TypeScript, D3.js (canvas rendering), React (panel UI), Vitest (testing)

---

### Task 1: Shape computation utility

**Files:**
- Create: `src/main/utils/shape-computation.ts`
- Create: `tests/main/shape-computation.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect } from 'vitest'
import { computeOutputShape } from '../../src/main/utils/shape-computation'

describe('computeOutputShape', () => {
  // --- Conv2d ---
  it('computes Conv2d output with stride=1, no padding', () => {
    const result = computeOutputShape('Conv2d', '3×640×640', {
      in_channels: 3, out_channels: 16, kernel_size: 3, stride: 1, padding: 0
    })
    expect(result).toBe('16×638×638')
  })

  it('computes Conv2d output with stride=2 (YOLOv8 backbone example)', () => {
    const result = computeOutputShape('Conv2d', '3×640×640', {
      in_channels: 3, out_channels: 16, kernel_size: 3, stride: 2, padding: 1
    })
    expect(result).toBe('16×320×320')
  })

  it('computes Conv2d output with dilation', () => {
    const result = computeOutputShape('Conv2d', '64×80×80', {
      in_channels: 64, out_channels: 64, kernel_size: 3, stride: 1, padding: 2, dilation: 2
    })
    // out = floor((80 - 2*(3-1) - 1 + 2*2) / 1 + 1) = floor(80) = 80
    expect(result).toBe('64×80×80')
  })

  // --- Conv1d ---
  it('computes Conv1d output', () => {
    const result = computeOutputShape('Conv1d', '16×128', {
      in_channels: 16, out_channels: 32, kernel_size: 3, stride: 1, padding: 0
    })
    expect(result).toBe('32×126')
  })

  // --- ConvTranspose2d ---
  it('computes ConvTranspose2d upsampling', () => {
    const result = computeOutputShape('ConvTranspose2d', '128×20×20', {
      in_channels: 128, out_channels: 64, kernel_size: 2, stride: 2, padding: 0
    })
    // out = (20 - 1)*2 - 0 + 2 = 40
    expect(result).toBe('64×40×40')
  })

  // --- MaxPool2d ---
  it('computes MaxPool2d with kernel=2 stride=2', () => {
    const result = computeOutputShape('MaxPool2d', '64×160×160', {
      kernel_size: 2, stride: 2, padding: 0
    })
    expect(result).toBe('64×80×80')
  })

  // --- AvgPool2d ---
  it('computes AvgPool2d with padding', () => {
    const result = computeOutputShape('AvgPool2d', '64×80×80', {
      kernel_size: 3, stride: 2, padding: 1
    })
    // out = floor((80 - 3 + 2) / 2 + 1) = floor(40.5) = 40
    expect(result).toBe('64×40×40')
  })

  // --- Passthrough layers ---
  it('passes through BatchNorm2d unchanged', () => {
    const result = computeOutputShape('BatchNorm2d', '64×80×80', { num_features: 64 })
    expect(result).toBe('64×80×80')
  })

  it('passes through ReLU unchanged', () => {
    const result = computeOutputShape('ReLU', '64×80×80', { inplace: false })
    expect(result).toBe('64×80×80')
  })

  it('passes through Dropout unchanged', () => {
    const result = computeOutputShape('Dropout', '256×40×40', { p: 0.5 })
    expect(result).toBe('256×40×40')
  })

  it('passes through Identity unchanged', () => {
    const result = computeOutputShape('Identity', '128×20×20', {})
    expect(result).toBe('128×20×20')
  })

  it('passes through GELU unchanged', () => {
    const result = computeOutputShape('GELU', '64×80×80', {})
    expect(result).toBe('64×80×80')
  })

  it('passes through Sigmoid unchanged', () => {
    const result = computeOutputShape('Sigmoid', '64×80×80', {})
    expect(result).toBe('64×80×80')
  })

  it('passes through Softmax unchanged', () => {
    const result = computeOutputShape('Softmax', '64×80×80', { dim: -1 })
    expect(result).toBe('64×80×80')
  })

  // --- Linear ---
  it('computes Linear output from 1D input', () => {
    const result = computeOutputShape('Linear', '512', {
      in_features: 512, out_features: 256
    })
    expect(result).toBe('256')
  })

  // --- LSTM ---
  it('computes LSTM output', () => {
    const result = computeOutputShape('LSTM', '128×64', {
      input_size: 128, hidden_size: 256
    })
    expect(result).toBe('256')
  })

  // --- Embedding ---
  it('computes Embedding output', () => {
    const result = computeOutputShape('Embedding', '1000', {
      num_embeddings: 1000, embedding_dim: 128
    })
    expect(result).toBe('128')
  })

  // --- Upsample (custom, by scale_factor param) ---
  it('computes Upsample with scale_factor=2', () => {
    const result = computeOutputShape('Upsample', '256×40×40', { scale_factor: 2 })
    expect(result).toBe('256×80×80')
  })

  // --- Null cases ---
  it('returns null for unknown layer type', () => {
    const result = computeOutputShape('UnknownLayer', '64×80×80', {})
    expect(result).toBeNull()
  })

  it('returns null for missing required params', () => {
    const result = computeOutputShape('Conv2d', '3×640×640', {})
    expect(result).toBeNull()
  })

  it('returns null for malformed input shape', () => {
    const result = computeOutputShape('Conv2d', 'not-a-shape', {
      in_channels: 3, out_channels: 16, kernel_size: 3, stride: 1
    })
    expect(result).toBeNull()
  })

  it('returns null for empty input shape', () => {
    const result = computeOutputShape('Conv2d', '', {
      in_channels: 3, out_channels: 16, kernel_size: 3, stride: 1
    })
    expect(result).toBeNull()
  })

  // --- LayerNorm (passthrough) ---
  it('passes through LayerNorm unchanged', () => {
    const result = computeOutputShape('LayerNorm', '64×80×80', { normalized_shape: '80' })
    expect(result).toBe('64×80×80')
  })

  // --- Conv3d ---
  it('computes Conv3d output', () => {
    const result = computeOutputShape('Conv3d', '3×16×224×224', {
      in_channels: 3, out_channels: 64, kernel_size: 3, stride: 1, padding: 1
    })
    expect(result).toBe('64×16×224×224')
  })
})
```

- [ ] **Step 2: Verify test fails (file doesn't exist yet)**

Run:
```bash
cd /Users/wangyan/Desktop/note && npx vitest run tests/main/shape-computation.test.ts
```
Expected: Module not found error for `../../src/main/utils/shape-computation`

- [ ] **Step 3: Write the shape computation utility**

```ts
/**
 * Computes the output tensor shape for a layer given its input shape and parameters.
 *
 * Shape format: "C×H×W" (2D), "C×L" (1D), "C×D×H×W" (3D), "N" (flat features).
 * Returns null if the shape cannot be computed (missing params, unknown layer, malformed input).
 */

// Layer types that don't change the tensor shape
const PASSTHROUGH_LAYERS = new Set([
  'BatchNorm1d', 'BatchNorm2d', 'BatchNorm3d',
  'LayerNorm', 'InstanceNorm1d', 'InstanceNorm2d', 'InstanceNorm3d',
  'ReLU', 'LeakyReLU', 'GELU', 'Sigmoid', 'Tanh', 'Softmax',
  'Identity', 'Dropout', 'Dropout2d', 'Dropout3d',
])

function parseShape(shape: string): number[] | null {
  if (!shape || !shape.trim()) return null
  const parts = shape.split('×').map(s => {
    const n = Number(s.trim())
    return Number.isFinite(n) ? n : NaN
  })
  if (parts.some(n => Number.isNaN(n))) return null
  return parts
}

function formatShape(parts: number[]): string {
  return parts.join('×')
}

function convOutSize(
  inSize: number,
  kernel: number,
  stride: number,
  padding: number,
  dilation: number
): number {
  return Math.floor((inSize - dilation * (kernel - 1) - 1 + 2 * padding) / stride + 1)
}

function convTransposeOutSize(
  inSize: number,
  kernel: number,
  stride: number,
  padding: number
): number {
  return (inSize - 1) * stride - 2 * padding + kernel
}

export function computeOutputShape(
  layerType: string,
  inputShape: string,
  params: Record<string, unknown>
): string | null {
  const inParts = parseShape(inputShape)
  if (!inParts) return null

  const getNum = (key: string): number | undefined => {
    const v = params[key]
    if (typeof v === 'number') return v
    if (typeof v === 'string') {
      const n = Number(v)
      return Number.isFinite(n) ? n : undefined
    }
    return undefined
  }

  // Passthrough layers: output shape = input shape
  if (PASSTHROUGH_LAYERS.has(layerType)) {
    return formatShape(inParts)
  }

  switch (layerType) {
    case 'Conv1d': {
      const outCh = getNum('out_channels')
      const k = getNum('kernel_size') ?? 3
      const s = getNum('stride') ?? 1
      const p = getNum('padding') ?? 0
      const d = getNum('dilation') ?? 1
      if (outCh === undefined || inParts.length < 2) return null
      const outL = convOutSize(inParts[inParts.length - 1], k, s, p, d)
      return formatShape([outCh, outL])
    }

    case 'Conv2d':
    case 'ConvTranspose2d': {
      const outCh = getNum('out_channels')
      const k = getNum('kernel_size') ?? 3
      const s = getNum('stride') ?? 1
      const p = getNum('padding') ?? 0
      if (outCh === undefined || inParts.length < 3) return null
      const inH = inParts[1]
      const inW = inParts[2]
      let outH: number, outW: number
      if (layerType === 'ConvTranspose2d') {
        outH = convTransposeOutSize(inH, k, s, p)
        outW = convTransposeOutSize(inW, k, s, p)
      } else {
        const d = getNum('dilation') ?? 1
        outH = convOutSize(inH, k, s, p, d)
        outW = convOutSize(inW, k, s, p, d)
      }
      return formatShape([outCh, outH, outW])
    }

    case 'Conv3d': {
      const outCh = getNum('out_channels')
      const k = getNum('kernel_size') ?? 3
      const s = getNum('stride') ?? 1
      const p = getNum('padding') ?? 0
      const d = getNum('dilation') ?? 1
      if (outCh === undefined || inParts.length < 4) return null
      const inD = inParts[1]
      const inH = inParts[2]
      const inW = inParts[3]
      const outD = convOutSize(inD, k, s, p, d)
      const outH = convOutSize(inH, k, s, p, d)
      const outW = convOutSize(inW, k, s, p, d)
      return formatShape([outCh, outD, outH, outW])
    }

    case 'MaxPool2d':
    case 'AvgPool2d': {
      const k = getNum('kernel_size') ?? 2
      const s = getNum('stride') ?? k
      const p = getNum('padding') ?? 0
      if (inParts.length < 3) return null
      const outH = convOutSize(inParts[1], k, s, p, 1)
      const outW = convOutSize(inParts[2], k, s, p, 1)
      return formatShape([inParts[0], outH, outW])
    }

    case 'Linear': {
      const outFeat = getNum('out_features')
      if (outFeat === undefined) return null
      return formatShape([outFeat])
    }

    case 'LSTM':
    case 'GRU': {
      const hidden = getNum('hidden_size')
      if (hidden === undefined) return null
      return formatShape([hidden])
    }

    case 'Embedding': {
      const embDim = getNum('embedding_dim')
      if (embDim === undefined) return null
      return formatShape([embDim])
    }

    case 'Upsample': {
      const scale = getNum('scale_factor')
      if (scale === undefined) return null
      const outParts = [inParts[0]]
      for (let i = 1; i < inParts.length; i++) {
        outParts.push(inParts[i] * scale)
      }
      return formatShape(outParts)
    }

    default:
      return null
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd /Users/wangyan/Desktop/note && npx vitest run tests/main/shape-computation.test.ts
```
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/wangyan/Desktop/note add src/main/utils/shape-computation.ts tests/main/shape-computation.test.ts
git -C /Users/wangyan/Desktop/note commit -m "feat: add shape computation utility for layer output dimensions"
```

---

### Task 2: Render shapes on NetworkCanvas nodes

**Files:**
- Modify: `src/renderer/src/components/editors/NetworkCanvas.tsx`

- [ ] **Step 1: Add input/output shape text above/below top-level layer nodes**

In the layer node rendering block (around line 605-628, after the label text), add shape text elements before and after the rect. Replace the layer node rendering block starting at the `else` on line 605:

```tsx
      } else {
        // layer — render input/output shapes outside the node box
        if (node.inputShape) {
          nodeG.append('text')
            .attr('x', nx + nw / 2).attr('y', ny - 4)
            .attr('text-anchor', 'middle').attr('fill', '#888')
            .attr('font-size', '9px')
            .text(node.inputShape)
        }
        nodeG.append('rect')
          .attr('x', nx).attr('y', ny).attr('width', nw).attr('height', nh)
          .attr('rx', 6).attr('fill', fill)
          .attr('stroke', isSelected ? '#4a90d9' : color)
          .attr('stroke-width', isSelected ? 2.5 : 1.5)
        nodeG.append('text')
          .attr('x', nx + nw / 2).attr('y', ny + nh / 2 + 4)
          .attr('text-anchor', 'middle').attr('fill', '#d4d4d4')
          .attr('font-size', '10px').attr('font-weight', 'bold')
          .text(node.label)
        if (node.outputShape) {
          nodeG.append('text')
            .attr('x', nx + nw / 2).attr('y', ny + nh + 12)
            .attr('text-anchor', 'middle').attr('fill', '#bbb')
            .attr('font-size', '9px')
            .text(node.outputShape)
        }
        if (node.codeMapping && onNavigateToCode && node.codeMapping.filePath) {
          nodeG.append('text')
            .attr('x', nx + nw - 14).attr('y', ny + nh / 2 + 4)
            .attr('fill', '#4a90d9').attr('font-size', '14px')
            .attr('font-weight', 'bold')
            .style('cursor', 'pointer')
            .text('→')
            .on('click', (event: MouseEvent) => {
              event.stopPropagation()
              onNavigateToCode(node.codeMapping!.filePath, node.codeMapping!.startLine)
            })
        }
      }
```

- [ ] **Step 2: Add input/output shape text above/below child nodes (inside blocks)**

In the child node rendering (around line 434-443, before the rect and after the label text), add the same pattern. Replace lines 434-443:

```tsx
            if (child.inputShape) {
              childG.append('text')
                .attr('x', cx + NODE_W / 2).attr('y', cy - 4)
                .attr('text-anchor', 'middle').attr('fill', '#888')
                .attr('font-size', '9px')
                .text(child.inputShape)
            }
            childG.append('rect')
              .attr('x', cx).attr('y', cy).attr('width', NODE_W).attr('height', NODE_H)
              .attr('rx', 6).attr('fill', cf)
              .attr('stroke', childIsSelected ? '#4a90d9' : cc)
              .attr('stroke-width', childIsSelected ? 2.5 : 1.5)
            childG.append('text')
              .attr('x', cx + NODE_W / 2).attr('y', cy + NODE_H / 2 + 4)
              .attr('text-anchor', 'middle').attr('fill', '#d4d4d4')
              .attr('font-size', '10px').attr('font-weight', 'bold')
              .text(child.label)
            if (child.outputShape) {
              childG.append('text')
                .attr('x', cx + NODE_W / 2).attr('y', cy + NODE_H + 12)
                .attr('text-anchor', 'middle').attr('fill', '#bbb')
                .attr('font-size', '9px')
                .text(child.outputShape)
            }
```

- [ ] **Step 3: Verify it compiles**

Run:
```bash
cd /Users/wangyan/Desktop/note && npx tsc --noEmit src/renderer/src/components/editors/NetworkCanvas.tsx 2>&1 | head -20
```
Expected: No type errors (or only pre-existing unrelated errors)

- [ ] **Step 4: Commit**

```bash
git -C /Users/wangyan/Desktop/note add src/renderer/src/components/editors/NetworkCanvas.tsx
git -C /Users/wangyan/Desktop/note commit -m "feat: render input/output tensor shapes outside network graph nodes"
```

---

### Task 3: Auto-compute output shape in NetworkPanel

**Files:**
- Modify: `src/renderer/src/components/editors/NetworkPanel.tsx`

- [ ] **Step 1: Add imports and local state for auto-compute toggle**

At the top of the file, add the import for `computeOutputShape` and React hooks:

```tsx
import { useEffect, useMemo, useState } from 'react'
import type { LayerDef } from '../../../../main/schemas/layer-catalog'
import type { GraphNode } from '../../../../main/schemas/note-types'
import { computeOutputShape } from '../../../../main/utils/shape-computation'
import { CodeMappingField } from '../CodeMappingField'
import './NetworkPanel.css'
```

- [ ] **Step 2: Add auto-compute logic inside the NetworkPanel component**

Add before the `if (!node)` early return (after the `paramIdsRef` line):

```tsx
  const paramIdsRef = useRef<Map<string, string>>(new Map())

  // Auto-compute output shape from layer params + input shape
  const [outputAutoMode, setOutputAutoMode] = useState(true)

  const computedOutput = useMemo(() => {
    if (!node || node.kind !== 'layer' || !node.layerType || !node.inputShape) return null
    return computeOutputShape(node.layerType, node.inputShape, node.params ?? {})
  }, [node?.layerType, node?.inputShape, JSON.stringify(node?.params)])

  // Reset to auto mode when switching nodes
  useEffect(() => {
    setOutputAutoMode(true)
  }, [node?.id])

  // Auto-update node's outputShape when computed value changes
  useEffect(() => {
    if (!node || !computedOutput || !outputAutoMode) return
    if (node.outputShape !== computedOutput) {
      onUpdateNode(node.id, 'outputShape', computedOutput)
    }
  }, [computedOutput, outputAutoMode])
```

- [ ] **Step 3: Replace the Tensor Shapes section in the layer side panel**

Replace the existing Tensor Shapes section (around lines 249-264) with the new auto-compute-aware version:

```tsx
          <div className="network-panel-section-title" style={{ marginTop: 12 }}>Tensor Shapes</div>
          <div className="network-panel-shapes">
            <input
              className="network-panel-input"
              value={node.inputShape || ''}
              onChange={(e) => onUpdateNode(node.id, 'inputShape', e.target.value)}
              placeholder="input (e.g., 3×640×640)"
            />
            <span className="network-panel-shape-arrow">→</span>
            {outputAutoMode && computedOutput ? (
              <div className="network-panel-shape-computed">
                <span className="network-panel-shape-computed-value">{computedOutput}</span>
                <button
                  className="network-panel-shape-toggle"
                  onClick={() => setOutputAutoMode(false)}
                  title="Edit manually"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                </button>
              </div>
            ) : (
              <div className="network-panel-shape-manual">
                <input
                  className="network-panel-input"
                  value={node.outputShape || ''}
                  onChange={(e) => onUpdateNode(node.id, 'outputShape', e.target.value)}
                  placeholder="output"
                />
                {computedOutput && (
                  <button
                    className="network-panel-shape-toggle"
                    onClick={() => setOutputAutoMode(true)}
                    title="Auto-compute from params"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M9 11V7a3 3 0 016 0v4"/></svg>
                  </button>
                )}
              </div>
            )}
          </div>
```

- [ ] **Step 4: Verify it compiles**

Run:
```bash
cd /Users/wangyan/Desktop/note && npx tsc --noEmit 2>&1 | grep -i "NetworkPanel\|shape-computation" | head -10
```
Expected: No errors mentioning NetworkPanel or shape-computation

- [ ] **Step 5: Commit**

```bash
git -C /Users/wangyan/Desktop/note add src/renderer/src/components/editors/NetworkPanel.tsx
git -C /Users/wangyan/Desktop/note commit -m "feat: auto-compute output tensor shape from layer params with manual override"
```

---

### Task 4: Integration check — run all tests

**Files:** None (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
cd /Users/wangyan/Desktop/note && npx vitest run
```
Expected: All tests pass, including the new shape-computation tests

- [ ] **Step 2: Run the app and visually verify**

Launch the app and open a `.net.json` file:
```bash
cd /Users/wangyan/Desktop/note && npm run dev
```

Verify:
1. Layer nodes with `inputShape`/`outputShape` display those values above/below the node box
2. In the edit panel, entering an input shape and params for a Conv2d node auto-fills the output shape
3. Clicking the lock/unlock toggle switches between auto-compute and manual editing
4. Child nodes inside blocks also show shapes
