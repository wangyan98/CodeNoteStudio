# Network Visualization (.net.json) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 5th note type `.net.json` for visualizing PyTorch neural network architectures with a rich drag-and-drop editor, block-diagram canvas, and source-code mapping via @ref().

**Architecture:** Follows the existing `.derive.json` / `.mind.json` pattern: schema + factory/validator in `src/main/schemas/note-types.ts`, CRUD in `note-service.ts`, reducer-based state management, D3 SVG canvas, and React component hierarchy. The layer catalog provides type-safe parameter definitions for ~25 PyTorch layers with per-project override support.

**Tech Stack:** TypeScript, React 18, D3 v7 (already in deps), Electron, Vitest

---

### Task 1: Schema types, factory, and validator

**Files:**
- Modify: `src/main/schemas/note-types.ts`
- Test: `tests/main/note-types.test.ts`

**Context:** Add `NetworkLayer`, `NetworkConnection`, `NetworkBlock`, `NetworkDocument` types, plus `createNetworkDocument`, `createNetworkLayer`, `createNetworkBlock`, `isValidNetworkDocument`. These follow the exact same pattern as `MindMapDocument` and `DerivationDocument` types already in the file.

- [ ] **Step 1: Add failing tests to `tests/main/note-types.test.ts`**

Add these tests after the existing `DerivationDocument` describe block, before the file's closing:

```typescript
import {
  createNetworkDocument,
  createNetworkLayer,
  createNetworkBlock,
  isValidNetworkDocument
} from '../../src/main/schemas/note-types'

describe('NetworkDocument', () => {
  it('createNetworkDocument returns a valid empty document', () => {
    const doc = createNetworkDocument()
    expect(doc.type).toBe('net')
    expect(doc.version).toBe(1)
    expect(doc.name).toBe('New Network')
    expect(doc.inputShape).toBe('')
    expect(doc.blocks).toEqual([])
    expect(doc.connections).toEqual([])
  })

  it('createNetworkLayer generates a unique id', () => {
    const layer1 = createNetworkLayer('Conv2d')
    const layer2 = createNetworkLayer('Conv2d')
    expect(layer1.id).toBeDefined()
    expect(layer1.id).not.toBe(layer2.id)
    expect(layer1.type).toBe('Conv2d')
    expect(layer1.params).toEqual({})
  })

  it('createNetworkBlock returns a block with unique id', () => {
    const block = createNetworkBlock('ResidualBlock')
    expect(block.id).toBeDefined()
    expect(block.name).toBe('ResidualBlock')
    expect(block.layers).toEqual([])
    expect(block.connections).toEqual([])
    expect(block.skipConnections).toEqual([])
    expect(block.blocks).toEqual([])
  })

  it('createNetworkBlock supports repeat', () => {
    const block = createNetworkBlock('ResidualBlock', 3)
    expect(block.repeat).toBe(3)
  })

  it('isValidNetworkDocument validates correctly', () => {
    const doc = createNetworkDocument()
    expect(isValidNetworkDocument(doc)).toBe(true)
  })

  it('isValidNetworkDocument rejects null', () => {
    expect(isValidNetworkDocument(null)).toBe(false)
  })

  it('isValidNetworkDocument rejects wrong type', () => {
    expect(isValidNetworkDocument({ type: 'mind', version: 1 })).toBe(false)
  })

  it('isValidNetworkDocument rejects missing blocks', () => {
    expect(isValidNetworkDocument({ type: 'net', version: 1, name: 'test', inputShape: '', connections: [] })).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/main/note-types.test.ts 2>&1 | tail -20
```

Expected: FAIL — `createNetworkDocument`, `createNetworkLayer`, `createNetworkBlock`, `isValidNetworkDocument` are not exported from `note-types`.

- [ ] **Step 3: Add types and factories to `src/main/schemas/note-types.ts`**

Add after the `DerivationDocument` block (after `isValidDerivationDocument` function, before the file ends):

```typescript
// --- Network Visualization (.net.json) ---

export interface LayerParams {
  [key: string]: string | number | boolean | number[]
}

export interface NetworkLayer {
  id: string
  type: string
  name?: string
  params: LayerParams
  inputShape?: string
  outputShape?: string
  codeMapping?: CodeMapping
}

export interface NetworkConnection {
  id: string
  from: string
  to: string
  label?: string
}

export interface NetworkBlock {
  id: string
  name: string
  repeat?: number
  layers: NetworkLayer[]
  connections: NetworkConnection[]
  skipConnections: NetworkConnection[]
  blocks: NetworkBlock[]
  codeMapping?: CodeMapping
}

export interface NetworkDocument {
  type: 'net'
  version: 1
  name: string
  inputShape: string
  blocks: NetworkBlock[]
  connections: NetworkConnection[]
}

export function createNetworkLayer(type = 'Linear'): NetworkLayer {
  return {
    id: uuidv4(),
    type,
    params: {}
  }
}

export function createNetworkBlock(name = 'New Block', repeat?: number): NetworkBlock {
  return {
    id: uuidv4(),
    name,
    repeat,
    layers: [],
    connections: [],
    skipConnections: [],
    blocks: []
  }
}

export function createNetworkDocument(name = 'New Network'): NetworkDocument {
  return {
    type: 'net',
    version: 1,
    name,
    inputShape: '',
    blocks: [],
    connections: []
  }
}

export function isValidNetworkDocument(obj: unknown): obj is NetworkDocument {
  if (!obj || typeof obj !== 'object') return false
  const doc = obj as Record<string, unknown>
  return doc.type === 'net' && doc.version === 1 && typeof doc.name === 'string' && Array.isArray(doc.blocks)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/main/note-types.test.ts 2>&1 | tail -20
```

Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/main/schemas/note-types.ts tests/main/note-types.test.ts
git commit -m "feat: add NetworkDocument schema types, factory, and validator"
```

---

### Task 2: Layer catalog with built-in PyTorch layers

**Files:**
- Create: `src/main/schemas/layer-catalog.ts`
- Test: `tests/main/layer-catalog.test.ts`

- [ ] **Step 1: Write the test file `tests/main/layer-catalog.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { BUILTIN_LAYERS, resolveLayerCatalog, getLayerDef } from '../../src/main/schemas/layer-catalog'

describe('BUILTIN_LAYERS', () => {
  it('contains Conv2d', () => {
    expect(BUILTIN_LAYERS.Conv2d).toBeDefined()
    expect(BUILTIN_LAYERS.Conv2d.category).toBe('convolution')
    expect(BUILTIN_LAYERS.Conv2d.params.length).toBeGreaterThan(0)
    expect(BUILTIN_LAYERS.Conv2d.params.find(p => p.name === 'in_channels')!.required).toBe(true)
  })

  it('contains ReLU with no required params', () => {
    expect(BUILTIN_LAYERS.ReLU).toBeDefined()
    expect(BUILTIN_LAYERS.ReLU.category).toBe('activation')
  })

  it('contains Linear', () => {
    expect(BUILTIN_LAYERS.Linear).toBeDefined()
    expect(BUILTIN_LAYERS.Linear.params.find(p => p.name === 'in_features')!.required).toBe(true)
    expect(BUILTIN_LAYERS.Linear.params.find(p => p.name === 'out_features')!.required).toBe(true)
  })

  it('each layer has a color', () => {
    for (const [name, def] of Object.entries(BUILTIN_LAYERS)) {
      expect(def.color, `${name} missing color`).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  it('all layer names are valid PyTorch nn module names', () => {
    const known = [
      'Conv1d', 'Conv2d', 'Conv3d', 'ConvTranspose2d',
      'BatchNorm1d', 'BatchNorm2d', 'LayerNorm', 'InstanceNorm2d',
      'ReLU', 'LeakyReLU', 'GELU', 'Sigmoid', 'Tanh', 'Softmax',
      'MaxPool2d', 'AvgPool2d', 'AdaptiveAvgPool2d',
      'Linear', 'Identity',
      'Dropout', 'Dropout2d',
      'LSTM', 'GRU',
      'Embedding',
      'MultiheadAttention'
    ]
    for (const name of known) {
      expect(BUILTIN_LAYERS[name], `missing built-in layer: ${name}`).toBeDefined()
    }
  })
})

describe('resolveLayerCatalog', () => {
  it('returns built-in layers when no overrides provided', () => {
    const catalog = resolveLayerCatalog(null)
    expect(catalog.Conv2d).toBeDefined()
    expect(catalog.Conv2d.color).toBe('#4a90d9')
  })

  it('applies overrides', () => {
    const overrides = { override: { Conv2d: { color: '#ff0000' } } }
    const catalog = resolveLayerCatalog(overrides)
    expect(catalog.Conv2d.color).toBe('#ff0000')
    // Other props preserved
    expect(catalog.Conv2d.category).toBe('convolution')
  })

  it('adds extended custom layers', () => {
    const overrides = {
      extend: {
        MyCustomLayer: {
          category: 'custom',
          color: '#9c27b0',
          params: [{ name: 'dim', type: 'number' as const, required: true }]
        }
      }
    }
    const catalog = resolveLayerCatalog(overrides)
    expect(catalog.MyCustomLayer).toBeDefined()
    expect(catalog.MyCustomLayer.color).toBe('#9c27b0')
  })

  it('overrides do not affect built-in if no override given', () => {
    const overrides = { extend: {}, override: {} }
    const catalog = resolveLayerCatalog(overrides)
    expect(catalog.Conv2d).toEqual(BUILTIN_LAYERS.Conv2d)
  })

  it('handles null overrides gracefully', () => {
    const catalog = resolveLayerCatalog(null)
    expect(Object.keys(catalog).length).toBeGreaterThan(20)
  })
})

describe('getLayerDef', () => {
  it('returns built-in layer when no project overrides', () => {
    const def = getLayerDef('Conv2d', null)
    expect(def).toBeDefined()
    expect(def!.color).toBe('#4a90d9')
  })

  it('returns undefined for unknown layer', () => {
    const def = getLayerDef('NonExistentLayer', null)
    expect(def).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/main/layer-catalog.test.ts 2>&1 | tail -15
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/main/schemas/layer-catalog.ts`**

```typescript
export interface LayerParamDef {
  name: string
  type: 'number' | 'string' | 'boolean' | 'number[]'
  default?: unknown
  required?: boolean
}

export interface LayerDef {
  category: string
  color: string
  params: LayerParamDef[]
}

export interface LayerCatalogOverrides {
  extend?: Record<string, LayerDef>
  override?: Record<string, Partial<LayerDef>>
}

export const BUILTIN_LAYERS: Record<string, LayerDef> = {
  // Convolution
  Conv1d: {
    category: 'convolution', color: '#4a90d9',
    params: [
      { name: 'in_channels', type: 'number', required: true },
      { name: 'out_channels', type: 'number', required: true },
      { name: 'kernel_size', type: 'number', default: 3 },
      { name: 'stride', type: 'number', default: 1 },
      { name: 'padding', type: 'number', default: 0 },
      { name: 'dilation', type: 'number', default: 1 },
      { name: 'bias', type: 'boolean', default: true },
    ]
  },
  Conv2d: {
    category: 'convolution', color: '#4a90d9',
    params: [
      { name: 'in_channels', type: 'number', required: true },
      { name: 'out_channels', type: 'number', required: true },
      { name: 'kernel_size', type: 'number', default: 3 },
      { name: 'stride', type: 'number', default: 1 },
      { name: 'padding', type: 'number', default: 0 },
      { name: 'dilation', type: 'number', default: 1 },
      { name: 'groups', type: 'number', default: 1 },
      { name: 'bias', type: 'boolean', default: true },
    ]
  },
  Conv3d: {
    category: 'convolution', color: '#4a90d9',
    params: [
      { name: 'in_channels', type: 'number', required: true },
      { name: 'out_channels', type: 'number', required: true },
      { name: 'kernel_size', type: 'number', default: 3 },
      { name: 'stride', type: 'number', default: 1 },
      { name: 'padding', type: 'number', default: 0 },
      { name: 'bias', type: 'boolean', default: true },
    ]
  },
  ConvTranspose2d: {
    category: 'convolution', color: '#4a90d9',
    params: [
      { name: 'in_channels', type: 'number', required: true },
      { name: 'out_channels', type: 'number', required: true },
      { name: 'kernel_size', type: 'number', default: 3 },
      { name: 'stride', type: 'number', default: 1 },
      { name: 'padding', type: 'number', default: 0 },
      { name: 'bias', type: 'boolean', default: true },
    ]
  },

  // Normalization
  BatchNorm1d: {
    category: 'normalization', color: '#ea4335',
    params: [
      { name: 'num_features', type: 'number', required: true },
      { name: 'eps', type: 'number', default: 1e-5 },
      { name: 'momentum', type: 'number', default: 0.1 },
    ]
  },
  BatchNorm2d: {
    category: 'normalization', color: '#ea4335',
    params: [
      { name: 'num_features', type: 'number', required: true },
      { name: 'eps', type: 'number', default: 1e-5 },
      { name: 'momentum', type: 'number', default: 0.1 },
    ]
  },
  LayerNorm: {
    category: 'normalization', color: '#ea4335',
    params: [
      { name: 'normalized_shape', type: 'string', required: true },
      { name: 'eps', type: 'number', default: 1e-5 },
    ]
  },
  InstanceNorm2d: {
    category: 'normalization', color: '#ea4335',
    params: [
      { name: 'num_features', type: 'number', required: true },
      { name: 'eps', type: 'number', default: 1e-5 },
    ]
  },

  // Activation
  ReLU: {
    category: 'activation', color: '#34a853',
    params: [{ name: 'inplace', type: 'boolean', default: false }]
  },
  LeakyReLU: {
    category: 'activation', color: '#34a853',
    params: [
      { name: 'negative_slope', type: 'number', default: 0.01 },
      { name: 'inplace', type: 'boolean', default: false },
    ]
  },
  GELU: {
    category: 'activation', color: '#34a853',
    params: []
  },
  Sigmoid: {
    category: 'activation', color: '#34a853',
    params: []
  },
  Tanh: {
    category: 'activation', color: '#34a853',
    params: []
  },
  Softmax: {
    category: 'activation', color: '#34a853',
    params: [{ name: 'dim', type: 'number', default: -1 }]
  },

  // Pooling
  MaxPool2d: {
    category: 'pooling', color: '#ff9800',
    params: [
      { name: 'kernel_size', type: 'number', default: 2 },
      { name: 'stride', type: 'number', default: 2 },
      { name: 'padding', type: 'number', default: 0 },
    ]
  },
  AvgPool2d: {
    category: 'pooling', color: '#ff9800',
    params: [
      { name: 'kernel_size', type: 'number', default: 2 },
      { name: 'stride', type: 'number', default: 2 },
      { name: 'padding', type: 'number', default: 0 },
    ]
  },
  AdaptiveAvgPool2d: {
    category: 'pooling', color: '#ff9800',
    params: [
      { name: 'output_size', type: 'string', default: '1' },
    ]
  },

  // Linear
  Linear: {
    category: 'linear', color: '#4a90d9',
    params: [
      { name: 'in_features', type: 'number', required: true },
      { name: 'out_features', type: 'number', required: true },
      { name: 'bias', type: 'boolean', default: true },
    ]
  },
  Identity: {
    category: 'linear', color: '#4a90d9',
    params: []
  },

  // Dropout
  Dropout: {
    category: 'dropout', color: '#9c27b0',
    params: [
      { name: 'p', type: 'number', default: 0.5 },
      { name: 'inplace', type: 'boolean', default: false },
    ]
  },
  Dropout2d: {
    category: 'dropout', color: '#9c27b0',
    params: [
      { name: 'p', type: 'number', default: 0.5 },
      { name: 'inplace', type: 'boolean', default: false },
    ]
  },

  // Recurrent
  LSTM: {
    category: 'recurrent', color: '#795548',
    params: [
      { name: 'input_size', type: 'number', required: true },
      { name: 'hidden_size', type: 'number', required: true },
      { name: 'num_layers', type: 'number', default: 1 },
      { name: 'bias', type: 'boolean', default: true },
      { name: 'dropout', type: 'number', default: 0 },
    ]
  },
  GRU: {
    category: 'recurrent', color: '#795548',
    params: [
      { name: 'input_size', type: 'number', required: true },
      { name: 'hidden_size', type: 'number', required: true },
      { name: 'num_layers', type: 'number', default: 1 },
      { name: 'bias', type: 'boolean', default: true },
      { name: 'dropout', type: 'number', default: 0 },
    ]
  },

  // Embedding
  Embedding: {
    category: 'embedding', color: '#009688',
    params: [
      { name: 'num_embeddings', type: 'number', required: true },
      { name: 'embedding_dim', type: 'number', required: true },
    ]
  },

  // Attention
  MultiheadAttention: {
    category: 'attention', color: '#e91e63',
    params: [
      { name: 'embed_dim', type: 'number', required: true },
      { name: 'num_heads', type: 'number', required: true },
      { name: 'dropout', type: 'number', default: 0 },
      { name: 'bias', type: 'boolean', default: true },
    ]
  },
}

function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target }
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sv = source[key]
    const tv = target[key]
    if (sv && typeof sv === 'object' && !Array.isArray(sv) && tv && typeof tv === 'object' && !Array.isArray(tv)) {
      result[key] = deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>) as T[keyof T]
    } else {
      result[key] = sv as T[keyof T]
    }
  }
  return result
}

export function resolveLayerCatalog(overrides: LayerCatalogOverrides | null): Record<string, LayerDef> {
  const catalog: Record<string, LayerDef> = {}

  // Start with built-ins
  for (const [name, def] of Object.entries(BUILTIN_LAYERS)) {
    catalog[name] = { ...def, params: def.params.map(p => ({ ...p })) }
  }

  if (!overrides) return catalog

  // Apply overrides
  if (overrides.override) {
    for (const [name, partial] of Object.entries(overrides.override)) {
      if (catalog[name]) {
        catalog[name] = deepMerge(catalog[name] as unknown as Record<string, unknown>, partial as unknown as Record<string, unknown>) as unknown as LayerDef
      }
    }
  }

  // Add extensions
  if (overrides.extend) {
    for (const [name, def] of Object.entries(overrides.extend)) {
      catalog[name] = def
    }
  }

  return catalog
}

export function getLayerDef(type: string, overrides: LayerCatalogOverrides | null): LayerDef | undefined {
  const catalog = resolveLayerCatalog(overrides)
  return catalog[type]
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/main/layer-catalog.test.ts 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/schemas/layer-catalog.ts tests/main/layer-catalog.test.ts
git commit -m "feat: add layer catalog with 26 built-in PyTorch layer definitions"
```

---

### Task 3: Integrate `'net'` into note-service, types, and file creation

**Files:**
- Modify: `src/main/types.ts`
- Modify: `src/main/services/note-service.ts`
- Modify: `src/renderer/src/types/index.ts`

- [ ] **Step 1: Add `'net'` to `NoteFileType` in `src/main/types.ts`**

```typescript
// Change line 14 from:
export type NoteFileType = 'mind' | 'md' | 'derive' | 'seq'
// To:
export type NoteFileType = 'mind' | 'md' | 'derive' | 'seq' | 'net'
```

- [ ] **Step 2: Add `'net'` to `NoteType` in `src/renderer/src/types/index.ts`**

```typescript
// Change line 1 from:
export type NoteType = 'mind' | 'md' | 'derive' | 'seq'
// To:
export type NoteType = 'mind' | 'md' | 'derive' | 'seq' | 'net'
```

- [ ] **Step 3: Add `'net'` case to `getNoteType` in `src/main/services/note-service.ts`**

In `getNoteType()` function (line 23-29), add before `return null`:

```typescript
if (fileName.endsWith('.net.json')) return 'net'
```

- [ ] **Step 4: Add `'net'` case to `createNote` in `src/main/services/note-service.ts`**

In the `createNote` function's switch statement, add after the `'seq'` case:

```typescript
case 'net': {
  const { createNetworkDocument } = await import('../schemas/note-types')
  const content = createNetworkDocument()
  await writeJsonFile(fullPath, content)
  break
}
```

- [ ] **Step 5: Add `'net'` case to `readNote` in `src/main/services/note-service.ts`**

In the `readNote` function, add before the final `return readTextFile(fullPath)`:

```typescript
if (relativePath.endsWith('.net.json')) {
  const { isValidNetworkDocument } = await import('../schemas/note-types')
  const doc = await readJsonFile(fullPath)
  if (!isValidNetworkDocument(doc)) {
    throw new Error(`Invalid network document: ${relativePath}`)
  }
  return doc
}
```

Note: for readability, the final `readNote` should group `.mind.json` and `.net.json` checks together before `.seq.mermaid`.

- [ ] **Step 6: Run existing tests to verify nothing broke**

```bash
npx vitest run 2>&1 | tail -20
```

Expected: all existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add src/main/types.ts src/main/services/note-service.ts src/renderer/src/types/index.ts
git commit -m "feat: integrate 'net' note type into file system and type system"
```

---

### Task 4: networkReducer — state management for the network editor

**Files:**
- Create: `src/renderer/src/components/editors/networkReducer.ts`
- Test: `tests/renderer/networkReducer.test.ts`

- [ ] **Step 1: Write the test file `tests/renderer/networkReducer.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { networkReducer } from '../../src/renderer/src/components/editors/networkReducer'
import type { NetworkAction } from '../../src/renderer/src/components/editors/networkReducer'
import type { NetworkDocument } from '../../src/main/schemas/note-types'
import { createNetworkDocument } from '../../src/main/schemas/note-types'

function makeDoc(): NetworkDocument {
  return {
    type: 'net',
    version: 1,
    name: 'TestNet',
    inputShape: '3×224×224',
    blocks: [
      {
        id: 'b1',
        name: 'Stem',
        layers: [
          { id: 'l1', type: 'Conv2d', params: { in_channels: 3, out_channels: 64, kernel_size: 7, stride: 2, padding: 3 } },
          { id: 'l2', type: 'BatchNorm2d', params: { num_features: 64 } },
          { id: 'l3', type: 'ReLU', params: { inplace: true } },
        ],
        connections: [],
        skipConnections: [],
        blocks: []
      }
    ],
    connections: []
  }
}

function dispatch(doc: NetworkDocument, action: NetworkAction): NetworkDocument {
  return networkReducer(doc, action)
}

describe('networkReducer', () => {
  describe('SET_DOCUMENT', () => {
    it('replaces the entire document', () => {
      const old = makeDoc()
      const fresh = createNetworkDocument('Fresh')
      const result = dispatch(old, { type: 'SET_DOCUMENT', document: fresh })
      expect(result.name).toBe('Fresh')
      expect(result.blocks.length).toBe(0)
    })
  })

  describe('UPDATE_NETWORK_NAME', () => {
    it('changes the network name', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'UPDATE_NETWORK_NAME', name: 'ResNet-50' })
      expect(result.name).toBe('ResNet-50')
    })
  })

  describe('UPDATE_INPUT_SHAPE', () => {
    it('changes the input shape', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'UPDATE_INPUT_SHAPE', shape: '1×28×28' })
      expect(result.inputShape).toBe('1×28×28')
    })
  })

  describe('ADD_LAYER', () => {
    it('adds a layer to a block', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'ADD_LAYER', blockId: 'b1', layerType: 'Linear', afterLayerId: 'l2' })
      expect(result.blocks[0].layers.length).toBe(4)
      expect(result.blocks[0].layers[2].type).toBe('Linear')
    })

    it('adds a layer at the end when no afterLayerId', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'ADD_LAYER', blockId: 'b1', layerType: 'Dropout' })
      expect(result.blocks[0].layers.length).toBe(4)
      expect(result.blocks[0].layers[3].type).toBe('Dropout')
    })

    it('does nothing for non-existent block', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'ADD_LAYER', blockId: 'bogus', layerType: 'Conv2d' })
      expect(result).toEqual(doc)
    })
  })

  describe('UPDATE_LAYER', () => {
    it('updates a layer parameter', () => {
      const doc = makeDoc()
      const result = dispatch(doc, {
        type: 'UPDATE_LAYER',
        blockId: 'b1', layerId: 'l1',
        field: 'params',
        paramKey: 'out_channels',
        value: 128
      })
      expect(result.blocks[0].layers[0].params.out_channels).toBe(128)
    })

    it('updates layer name', () => {
      const doc = makeDoc()
      const result = dispatch(doc, {
        type: 'UPDATE_LAYER',
        blockId: 'b1', layerId: 'l1',
        field: 'name',
        value: 'initial_conv'
      })
      expect(result.blocks[0].layers[0].name).toBe('initial_conv')
    })

    it('updates input shape', () => {
      const doc = makeDoc()
      const result = dispatch(doc, {
        type: 'UPDATE_LAYER',
        blockId: 'b1', layerId: 'l1',
        field: 'inputShape',
        value: '3×224×224'
      })
      expect(result.blocks[0].layers[0].inputShape).toBe('3×224×224')
    })
  })

  describe('UPDATE_LAYER_CODE_MAPPING', () => {
    it('sets a code mapping on a layer', () => {
      const doc = makeDoc()
      const mapping = {
        raw: 'models/resnet.py:conv1:42',
        functionName: 'conv1',
        filePath: 'models/resnet.py',
        startLine: 42,
        endLine: 43
      }
      const result = dispatch(doc, {
        type: 'UPDATE_LAYER_CODE_MAPPING',
        blockId: 'b1', layerId: 'l1',
        codeMapping: mapping
      })
      expect(result.blocks[0].layers[0].codeMapping).toEqual(mapping)
    })

    it('clears code mapping with null', () => {
      const doc = makeDoc()
      const withMapping = dispatch(doc, {
        type: 'UPDATE_LAYER_CODE_MAPPING',
        blockId: 'b1', layerId: 'l1',
        codeMapping: { raw: 'test', functionName: 'f', filePath: 'f.py', startLine: 1, endLine: 2 }
      })
      const cleared = dispatch(withMapping, {
        type: 'UPDATE_LAYER_CODE_MAPPING',
        blockId: 'b1', layerId: 'l1',
        codeMapping: null
      })
      expect(cleared.blocks[0].layers[0].codeMapping).toBeUndefined()
    })
  })

  describe('DELETE_LAYER', () => {
    it('deletes a layer from a block', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'DELETE_LAYER', blockId: 'b1', layerId: 'l2' })
      expect(result.blocks[0].layers.length).toBe(2)
      expect(result.blocks[0].layers[0].id).toBe('l1')
      expect(result.blocks[0].layers[1].id).toBe('l3')
    })
  })

  describe('ADD_BLOCK', () => {
    it('adds a block to the document', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'ADD_BLOCK', name: 'Stage2', afterBlockId: 'b1' })
      expect(result.blocks.length).toBe(2)
      expect(result.blocks[1].name).toBe('Stage2')
    })
  })

  describe('UPDATE_BLOCK', () => {
    it('updates block name', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'UPDATE_BLOCK', blockId: 'b1', field: 'name', value: 'NewStem' })
      expect(result.blocks[0].name).toBe('NewStem')
    })

    it('updates block repeat', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'UPDATE_BLOCK', blockId: 'b1', field: 'repeat', value: 3 })
      expect(result.blocks[0].repeat).toBe(3)
    })
  })

  describe('DELETE_BLOCK', () => {
    it('deletes a block', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'DELETE_BLOCK', blockId: 'b1' })
      expect(result.blocks.length).toBe(0)
    })
  })

  describe('immutability', () => {
    it('does not mutate original on ADD_LAYER', () => {
      const original = makeDoc()
      const origJson = JSON.stringify(original)
      dispatch(original, { type: 'ADD_LAYER', blockId: 'b1', layerType: 'Linear' })
      expect(JSON.stringify(original)).toBe(origJson)
    })

    it('does not mutate original on DELETE_LAYER', () => {
      const original = makeDoc()
      const origJson = JSON.stringify(original)
      dispatch(original, { type: 'DELETE_LAYER', blockId: 'b1', layerId: 'l2' })
      expect(JSON.stringify(original)).toBe(origJson)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/renderer/networkReducer.test.ts 2>&1 | tail -15
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/renderer/src/components/editors/networkReducer.ts`**

```typescript
import type { NetworkDocument, NetworkLayer, NetworkBlock, CodeMapping } from '../../../../main/schemas/note-types'
import { createNetworkLayer, createNetworkBlock } from '../../../../main/schemas/note-types'
import { v4 as uuidv4 } from 'uuid'

export interface NetworkAction {
  type: string
  document?: NetworkDocument
  name?: string
  shape?: string
  blockId?: string
  layerId?: string
  layerType?: string
  afterLayerId?: string
  afterBlockId?: string
  field?: string
  paramKey?: string
  value?: unknown
  codeMapping?: CodeMapping | null
}

function cloneDoc(doc: NetworkDocument): NetworkDocument {
  return {
    ...doc,
    blocks: doc.blocks.map(cloneBlock),
    connections: doc.connections.map(c => ({ ...c }))
  }
}

function cloneBlock(block: NetworkBlock): NetworkBlock {
  return {
    ...block,
    layers: block.layers.map(l => ({ ...l, params: { ...l.params }, codeMapping: l.codeMapping ? { ...l.codeMapping } : undefined })),
    connections: block.connections.map(c => ({ ...c })),
    skipConnections: block.skipConnections.map(c => ({ ...c })),
    blocks: block.blocks.map(cloneBlock)
  }
}

function findBlock(doc: NetworkDocument, blockId: string): NetworkBlock | null {
  function search(blocks: NetworkBlock[]): NetworkBlock | null {
    for (const b of blocks) {
      if (b.id === blockId) return b
      const found = search(b.blocks)
      if (found) return found
    }
    return null
  }
  return search(doc.blocks)
}

function updateBlockInPlace(blocks: NetworkBlock[], blockId: string, updater: (b: NetworkBlock) => NetworkBlock): NetworkBlock[] {
  return blocks.map(b => {
    if (b.id === blockId) return updater(b)
    if (b.blocks.length > 0) {
      const updated = updateBlockInPlace(b.blocks, blockId, updater)
      if (updated !== b.blocks) return { ...b, blocks: updated }
    }
    return b
  })
}

export function networkReducer(doc: NetworkDocument, action: NetworkAction): NetworkDocument {
  switch (action.type) {

    case 'SET_DOCUMENT':
      return cloneDoc(action.document!)

    case 'UPDATE_NETWORK_NAME':
      return { ...doc, name: action.name! }

    case 'UPDATE_INPUT_SHAPE':
      return { ...doc, inputShape: action.shape! }

    case 'ADD_LAYER': {
      const cloned = cloneDoc(doc)
      const idx = action.afterLayerId
        ? cloned.blocks[0].layers.findIndex(l => l.id === action.afterLayerId)
        : cloned.blocks[0].layers.length - 1
      const newLayer = createNetworkLayer(action.layerType!)
      cloned.blocks = updateBlockInPlace(cloned.blocks, action.blockId!, b => {
        const layers = [...b.layers]
        layers.splice(idx >= 0 ? idx + 1 : layers.length, 0, newLayer)
        return { ...b, layers }
      })
      return cloned
    }

    case 'UPDATE_LAYER': {
      const cloned = cloneDoc(doc)
      cloned.blocks = updateBlockInPlace(cloned.blocks, action.blockId!, b => ({
        ...b,
        layers: b.layers.map(l => {
          if (l.id !== action.layerId!) return l
          if (action.field === 'params' && action.paramKey) {
            return { ...l, params: { ...l.params, [action.paramKey]: action.value } }
          }
          return { ...l, [action.field!]: action.value }
        })
      }))
      return cloned
    }

    case 'UPDATE_LAYER_CODE_MAPPING': {
      const cloned = cloneDoc(doc)
      cloned.blocks = updateBlockInPlace(cloned.blocks, action.blockId!, b => ({
        ...b,
        layers: b.layers.map(l =>
          l.id === action.layerId! ? { ...l, codeMapping: action.codeMapping ?? undefined } : l
        )
      }))
      return cloned
    }

    case 'DELETE_LAYER': {
      const cloned = cloneDoc(doc)
      cloned.blocks = updateBlockInPlace(cloned.blocks, action.blockId!, b => ({
        ...b,
        layers: b.layers.filter(l => l.id !== action.layerId!)
      }))
      return cloned
    }

    case 'ADD_BLOCK': {
      const cloned = cloneDoc(doc)
      const newBlock = createNetworkBlock(action.name || 'New Block')
      const idx = action.afterBlockId
        ? cloned.blocks.findIndex(b => b.id === action.afterBlockId)
        : cloned.blocks.length - 1
      const blocks = [...cloned.blocks]
      blocks.splice(idx >= 0 ? idx + 1 : blocks.length, 0, newBlock)
      return { ...cloned, blocks }
    }

    case 'UPDATE_BLOCK': {
      const cloned = cloneDoc(doc)
      cloned.blocks = updateBlockInPlace(cloned.blocks, action.blockId!, b => ({
        ...b,
        [action.field!]: action.value
      }))
      return cloned
    }

    case 'DELETE_BLOCK': {
      const cloned = cloneDoc(doc)
      return { ...cloned, blocks: cloned.blocks.filter(b => b.id !== action.blockId!) }
    }

    default:
      return doc
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/renderer/networkReducer.test.ts 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/editors/networkReducer.ts tests/renderer/networkReducer.test.ts
git commit -m "feat: add networkReducer for .net.json state management"
```

---

### Task 5: NetworkPalette — horizontal layer strip

**Files:**
- Create: `src/renderer/src/components/editors/NetworkPalette.tsx`
- Create: `src/renderer/src/components/editors/NetworkPalette.css`

- [ ] **Step 1: Create `src/renderer/src/components/editors/NetworkPalette.tsx`**

```typescript
import type { LayerDef } from '../../../../main/schemas/layer-catalog'
import './NetworkPalette.css'

interface NetworkPaletteProps {
  catalog: Record<string, LayerDef>
}

const CATEGORY_ORDER = ['convolution', 'normalization', 'activation', 'pooling', 'linear', 'dropout', 'recurrent', 'embedding', 'attention']

const CATEGORY_LABELS: Record<string, string> = {
  convolution: 'Conv',
  normalization: 'Norm',
  activation: 'Act',
  pooling: 'Pool',
  linear: 'Linear',
  dropout: 'Drop',
  recurrent: 'RNN',
  embedding: 'Emb',
  attention: 'Attn'
}

export function NetworkPalette({ catalog }: NetworkPaletteProps) {
  const byCategory = new Map<string, Array<[string, LayerDef]>>()
  for (const [name, def] of Object.entries(catalog)) {
    if (!def.category) continue
    if (!byCategory.has(def.category)) byCategory.set(def.category, [])
    byCategory.get(def.category)!.push([name, def])
  }

  const handleDragStart = (e: React.DragEvent, layerType: string) => {
    e.dataTransfer.setData('application/x-net-layer', layerType)
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div className="network-palette">
      {CATEGORY_ORDER.map(cat => {
        const items = byCategory.get(cat)
        if (!items || items.length === 0) return null
        return (
          <span key={cat} className="network-palette-group">
            <span className="network-palette-cat-label">{CATEGORY_LABELS[cat] || cat}</span>
            {items.map(([name, def]) => (
              <span
                key={name}
                className="network-palette-pill"
                style={{ borderLeftColor: def.color }}
                draggable
                onDragStart={(e) => handleDragStart(e, name)}
                title={name}
              >
                {name}
              </span>
            ))}
            <span className="network-palette-sep">|</span>
          </span>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Create `src/renderer/src/components/editors/NetworkPalette.css`**

```css
.network-palette {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 10px;
  background: var(--panel-bg, #1e1e1e);
  border-bottom: 1px solid var(--border-color, #333);
  overflow-x: auto;
  flex-wrap: wrap;
  min-height: 32px;
}

.network-palette-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.network-palette-cat-label {
  font-size: 8px;
  color: var(--placeholder-color, #888);
  text-transform: uppercase;
  font-weight: 600;
  margin-right: 2px;
}

.network-palette-pill {
  padding: 2px 8px;
  font-size: 10px;
  background: var(--card-bg, #2a2a2a);
  border-left: 3px solid #888;
  border-radius: 3px;
  cursor: grab;
  white-space: nowrap;
  color: var(--text-color, #d4d4d4);
  user-select: none;
}

.network-palette-pill:hover {
  background: var(--hover-bg, #383838);
}

.network-palette-pill:active {
  cursor: grabbing;
}

.network-palette-sep {
  color: var(--border-color, #333);
  margin: 0 4px;
  font-size: 10px;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/editors/NetworkPalette.tsx src/renderer/src/components/editors/NetworkPalette.css
git commit -m "feat: add NetworkPalette horizontal layer strip component"
```

---

### Task 6: NetworkPanel — bottom edit panel with param form + code mapping

**Files:**
- Create: `src/renderer/src/components/editors/NetworkPanel.tsx`
- Create: `src/renderer/src/components/editors/NetworkPanel.css`

- [ ] **Step 1: Create `src/renderer/src/components/editors/NetworkPanel.tsx`**

```typescript
import type { LayerDef } from '../../../../main/schemas/layer-catalog'
import type { NetworkLayer, CodeMapping } from '../../../../main/schemas/note-types'
import './NetworkPanel.css'

interface NetworkPanelProps {
  layer: NetworkLayer | null
  layerDef: LayerDef | undefined
  onUpdateParam: (layerId: string, paramKey: string, value: unknown) => void
  onUpdateInputShape: (layerId: string, shape: string) => void
  onUpdateOutputShape: (layerId: string, shape: string) => void
  onUpdateCodeMapping: (layerId: string, mapping: CodeMapping | null) => void
  onUpdateLayerName: (layerId: string, name: string) => void
  onResolveRef: (raw: string) => void
  resolvedMapping: CodeMapping | null
}

function renderField(layer: NetworkLayer, param: { name: string; type: string; default?: unknown }, onChange: (key: string, value: unknown) => void) {
  const value = layer.params[param.name]
  const displayValue = value !== undefined ? String(value) : (param.default !== undefined ? String(param.default) : '')

  if (param.type === 'boolean') {
    return (
      <label className="network-panel-checkbox" key={param.name}>
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(param.name, e.target.checked)}
        />
        <span className="network-panel-field-label">{param.name}</span>
      </label>
    )
  }

  return (
    <div className="network-panel-field" key={param.name}>
      <label className="network-panel-field-label">{param.name}</label>
      <input
        className="network-panel-input"
        type={param.type === 'number' ? 'number' : 'text'}
        value={displayValue}
        onChange={(e) => {
          const v = param.type === 'number'
            ? (e.target.value === '' ? undefined : Number(e.target.value))
            : e.target.value
          onChange(param.name, v)
        }}
        placeholder={param.default !== undefined ? String(param.default) : ''}
      />
    </div>
  )
}

export function NetworkPanel({
  layer, layerDef, onUpdateParam, onUpdateInputShape, onUpdateOutputShape,
  onUpdateCodeMapping, onUpdateLayerName, onResolveRef, resolvedMapping
}: NetworkPanelProps) {

  if (!layer) {
    return (
      <div className="network-panel">
        <div className="network-panel-empty">Select a layer to edit its parameters</div>
      </div>
    )
  }

  const params = layerDef?.params ?? []

  return (
    <div className="network-panel">
      <div className="network-panel-main">
        <div className="network-panel-header">
          <span className="network-panel-layer-type" style={{ color: layerDef?.color }}>
            {layer.type}
          </span>
          <input
            className="network-panel-name-input"
            value={layer.name || ''}
            onChange={(e) => onUpdateLayerName(layer.id, e.target.value)}
            placeholder="Layer name (optional)"
          />
        </div>

        {params.length > 0 && (
          <div className="network-panel-params">
            <div className="network-panel-section-title">Parameters</div>
            <div className="network-panel-params-grid">
              {params.map(p => renderField(layer, p, (key, val) => onUpdateParam(layer.id, key, val)))}
            </div>
          </div>
        )}

        {params.length === 0 && (
          <div className="network-panel-params">
            <div className="network-panel-section-title">Parameters</div>
            <span className="network-panel-no-params">This layer has no parameters</span>
          </div>
        )}
      </div>

      <div className="network-panel-side">
        <div className="network-panel-section-title">Code Mapping</div>
        <input
          className="network-panel-input"
          value={layer.codeMapping?.raw ?? ''}
          onChange={(e) => {
            const raw = e.target.value
            if (raw) {
              onResolveRef(raw)
            } else {
              onUpdateCodeMapping(layer.id, null)
            }
          }}
          placeholder="@ref(path:name:line)"
        />
        {resolvedMapping && (
          <div className="network-panel-resolved-ref">
            → {resolvedMapping.filePath}:{resolvedMapping.startLine}
          </div>
        )}

        <div className="network-panel-section-title" style={{ marginTop: 12 }}>Tensor Shapes</div>
        <div className="network-panel-shapes">
          <input
            className="network-panel-input"
            value={layer.inputShape || ''}
            onChange={(e) => onUpdateInputShape(layer.id, e.target.value)}
            placeholder="input (e.g., 64×56×56)"
          />
          <span className="network-panel-shape-arrow">→</span>
          <input
            className="network-panel-input"
            value={layer.outputShape || ''}
            onChange={(e) => onUpdateOutputShape(layer.id, e.target.value)}
            placeholder="output"
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/renderer/src/components/editors/NetworkPanel.css`**

```css
.network-panel {
  display: flex;
  gap: 16px;
  padding: 10px 16px;
  background: var(--panel-bg, #1e1e1e);
  border-top: 1px solid var(--border-color, #333);
  min-height: 120px;
  max-height: 220px;
  overflow-y: auto;
}

.network-panel-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--placeholder-color, #888);
  font-size: 12px;
}

.network-panel-main {
  flex: 1;
}

.network-panel-side {
  width: 220px;
  border-left: 1px solid var(--border-color, #333);
  padding-left: 12px;
  flex-shrink: 0;
}

.network-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.network-panel-layer-type {
  font-weight: 700;
  font-size: 13px;
}

.network-panel-name-input {
  flex: 1;
  padding: 2px 6px;
  font-size: 11px;
  background: var(--input-bg, #2a2a2a);
  color: var(--text-color, #d4d4d4);
  border: 1px solid var(--border-color, #444);
  border-radius: 3px;
}

.network-panel-section-title {
  font-size: 9px;
  color: var(--placeholder-color, #888);
  text-transform: uppercase;
  font-weight: 600;
  margin-bottom: 4px;
}

.network-panel-params-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 4px 12px;
}

.network-panel-field {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.network-panel-field-label {
  font-size: 9px;
  color: var(--placeholder-color, #888);
}

.network-panel-input {
  width: 100%;
  padding: 2px 4px;
  font-size: 10px;
  background: var(--input-bg, #2a2a2a);
  color: var(--text-color, #d4d4d4);
  border: 1px solid var(--border-color, #444);
  border-radius: 2px;
  box-sizing: border-box;
}

.network-panel-checkbox {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--text-color, #d4d4d4);
}

.network-panel-checkbox input {
  margin: 0;
}

.network-panel-no-params {
  font-size: 10px;
  color: var(--placeholder-color, #666);
  font-style: italic;
}

.network-panel-resolved-ref {
  font-size: 9px;
  color: var(--accent-color, #4a90d9);
  margin-top: 2px;
}

.network-panel-shapes {
  display: flex;
  align-items: center;
  gap: 4px;
}

.network-panel-shape-arrow {
  color: var(--placeholder-color, #888);
  font-size: 12px;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/editors/NetworkPanel.tsx src/renderer/src/components/editors/NetworkPanel.css
git commit -m "feat: add NetworkPanel bottom edit panel with param form and code mapping"
```

---

### Task 7: NetworkCanvas — D3 SVG block diagram

**Files:**
- Create: `src/renderer/src/components/editors/NetworkCanvas.tsx`
- Create: `src/renderer/src/components/editors/NetworkCanvas.css`

- [ ] **Step 1: Create `src/renderer/src/components/editors/NetworkCanvas.tsx`**

```typescript
import { useRef, useEffect, useCallback } from 'react'
import * as d3 from 'd3'
import type { NetworkDocument, NetworkBlock, NetworkLayer } from '../../../../main/schemas/note-types'
import type { LayerDef } from '../../../../main/schemas/layer-catalog'
import './NetworkCanvas.css'

interface NetworkCanvasProps {
  doc: NetworkDocument
  catalog: Record<string, LayerDef>
  selectedBlockId: string | null
  selectedLayerId: string | null
  onSelectLayer: (blockId: string, layerId: string) => void
  onSelectBlock: (blockId: string) => void
  onDropLayer: (blockId: string, layerType: string, afterLayerId?: string) => void
  onDeleteLayer: (blockId: string, layerId: string) => void
}

const LAYER_W = 120
const LAYER_H = 42
const LAYER_GAP = 14
const BLOCK_PAD = 20
const ARROW_W = 24

function formatLayerLabel(layer: NetworkLayer): string {
  const p = layer.params
  // Show key params inline: type name + in/out channels if present
  const inCh = p.in_channels ?? p.in_features
  const outCh = p.out_channels ?? p.out_features
  if (inCh !== undefined && outCh !== undefined) {
    return `${layer.type}\n${inCh}→${outCh}`
  }
  if (p.num_features !== undefined) {
    return `${layer.type}\n${p.num_features}`
  }
  return layer.type
}

export function NetworkCanvas({
  doc, catalog, selectedBlockId, selectedLayerId,
  onSelectLayer, onSelectBlock, onDropLayer, onDeleteLayer
}: NetworkCanvasProps) {

  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const render = useCallback(() => {
    const svg = d3.select(svgRef.current)
    const container = containerRef.current
    if (!container) return

    const W = container.clientWidth || 800
    const H = container.clientHeight || 500
    svg.attr('width', W).attr('height', H)
    svg.selectAll('g').remove()

    const g = svg.append('g')

    let cy = 30

    // Input node
    const inputLabel = doc.inputShape ? `Input ${doc.inputShape}` : 'Input'
    g.append('rect')
      .attr('x', W / 2 - 60).attr('y', cy).attr('width', 120).attr('height', 28)
      .attr('rx', 6).attr('fill', '#f5f5f5').attr('stroke', '#666').attr('stroke-width', 2)
    g.append('text')
      .attr('x', W / 2).attr('y', cy + 18).attr('text-anchor', 'middle')
      .attr('fill', '#333').attr('font-size', '11px').attr('font-weight', 'bold')
      .text(inputLabel)

    cy += 40

    // Render blocks
    for (let bi = 0; bi < doc.blocks.length; bi++) {
      const block = doc.blocks[bi]

      // Arrow between blocks
      if (bi > 0 || true) {
        g.append('text')
          .attr('x', W / 2).attr('y', cy - 6).attr('text-anchor', 'middle')
          .attr('fill', '#888').attr('font-size', '14px')
          .text('↓')
        cy += 8
      }

      const layerCount = block.layers.length
      const blockW = layerCount * (LAYER_W + ARROW_W) - ARROW_W + BLOCK_PAD * 2
      const blockH = LAYER_H + BLOCK_PAD * 2 + 28

      const blockX = (W - blockW) / 2
      const isSelected = block.id === selectedBlockId

      // Block rect
      const blockG = g.append('g')
        .attr('class', 'net-block')
        .attr('data-block-id', block.id)
        .style('cursor', 'pointer')

      blockG.append('rect')
        .attr('x', blockX).attr('y', cy).attr('width', blockW).attr('height', blockH)
        .attr('rx', 10).attr('fill', 'none')
        .attr('stroke', isSelected ? '#4a90d9' : '#ff9800')
        .attr('stroke-width', isSelected ? 2.5 : 1.5)
        .attr('stroke-dasharray', '6,3')

      // Block header
      let headerText = block.name
      if (block.repeat && block.repeat > 1) headerText += ` ×${block.repeat}`

      blockG.append('text')
        .attr('x', blockX + 10).attr('y', cy + 16)
        .attr('fill', '#ff9800').attr('font-size', '11px').attr('font-weight', 'bold')
        .text(headerText)

      blockG.on('click', (event: MouseEvent) => {
        event.stopPropagation()
        onSelectBlock(block.id)
      })

      // Render layers within block
      if (layerCount > 0) {
        const layersStartX = blockX + BLOCK_PAD
        const layersY = cy + BLOCK_PAD + 16

        for (let li = 0; li < layerCount; li++) {
          const layer = block.layers[li]
          const lx = layersStartX + li * (LAYER_W + ARROW_W)
          const def = catalog[layer.type]
          const color = def?.color ?? '#888'
          const isLayerSelected = layer.id === selectedLayerId

          const layerG = blockG.append('g')
            .attr('class', 'net-layer')
            .attr('data-layer-id', layer.id)
            .attr('data-block-id', block.id)
            .style('cursor', 'pointer')

          layerG.append('rect')
            .attr('x', lx).attr('y', layersY).attr('width', LAYER_W).attr('height', LAYER_H)
            .attr('rx', 6).attr('fill', color + '22')
            .attr('stroke', color).attr('stroke-width', isLayerSelected ? 2.5 : 1.5)

          // Layer type label
          const label = formatLayerLabel(layer)
          const lines = label.split('\n')
          layerG.append('text')
            .attr('x', lx + LAYER_W / 2).attr('y', layersY + 16)
            .attr('text-anchor', 'middle').attr('fill', '#d4d4d4')
            .attr('font-size', '10px').attr('font-weight', 'bold')
            .text(lines[0])
          if (lines[1]) {
            layerG.append('text')
              .attr('x', lx + LAYER_W / 2).attr('y', layersY + 30)
              .attr('text-anchor', 'middle').attr('fill', '#999')
              .attr('font-size', '9px')
              .text(lines[1])
          }

          // Code mapping indicator
          if (layer.codeMapping) {
            layerG.append('circle')
              .attr('cx', lx + LAYER_W - 8).attr('cy', layersY + 8).attr('r', 3)
              .attr('fill', '#4a90d9')
          }

          layerG.on('click', (event: MouseEvent) => {
            event.stopPropagation()
            onSelectLayer(block.id, layer.id)
          })

          // Connection port dots
          layerG.append('circle')
            .attr('cx', lx).attr('cy', layersY + LAYER_H / 2).attr('r', 3)
            .attr('fill', color).attr('stroke', '#333').attr('stroke-width', 0.5)
            .style('opacity', 0.7)
          layerG.append('circle')
            .attr('cx', lx + LAYER_W).attr('cy', layersY + LAYER_H / 2).attr('r', 3)
            .attr('fill', color).attr('stroke', '#333').attr('stroke-width', 0.5)
            .style('opacity', 0.7)

          // Arrow between layers
          if (li < layerCount - 1) {
            const ax = lx + LAYER_W
            const ay = layersY + LAYER_H / 2
            // Draw arrow
            blockG.append('line')
              .attr('x1', ax + 2).attr('y1', ay)
              .attr('x2', ax + ARROW_W - 4).attr('y2', ay)
              .attr('stroke', '#888').attr('stroke-width', 1.5)
            blockG.append('polygon')
              .attr('points', `${ax + ARROW_W - 4},${ay - 4} ${ax + ARROW_W},${ay} ${ax + ARROW_W - 4},${ay + 4}`)
              .attr('fill', '#888')
          }
        }
      } else {
        // Empty block placeholder
        blockG.append('text')
          .attr('x', blockX + blockW / 2).attr('y', cy + blockH / 2 + 10)
          .attr('text-anchor', 'middle').attr('fill', '#666').attr('font-size', '10px')
          .text('Drop layers here')
      }

      // Skip connection rendering
      if (block.skipConnections.length > 0) {
        const connY = cy + blockH - 4
        for (const sc of block.skipConnections) {
          blockG.append('line')
            .attr('x1', blockX).attr('y1', connY)
            .attr('x2', blockX + blockW).attr('y2', connY)
            .attr('stroke', '#34a853').attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '4,2')
          if (sc.label) {
            blockG.append('text')
              .attr('x', blockX + blockW / 2).attr('y', connY - 4)
              .attr('text-anchor', 'middle').attr('fill', '#34a853').attr('font-size', '8px')
              .text(sc.label)
          }
        }
      }

      cy += blockH + 12
    }

    // Drop target for entire canvas (add layer to last block or root)
    // Handled by NetworkEditor wrapper

    // Background click to deselect
    svg.on('click', () => {
      onSelectLayer('', '')
    })

    // Total SVG height
    svg.attr('height', Math.max(H, cy + 30))

  }, [doc, catalog, selectedBlockId, selectedLayerId, onSelectLayer, onSelectBlock])

  useEffect(() => {
    render()
  }, [render])

  // Keyboard: Delete
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedLayerId && selectedBlockId) {
        e.preventDefault()
        onDeleteLayer(selectedBlockId, selectedLayerId)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedLayerId, selectedBlockId, onDeleteLayer])

  // Handle drop from palette
  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-net-layer')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const layerType = e.dataTransfer.getData('application/x-net-layer')
    if (!layerType) return

    // Find which block was targeted, or use first block
    const targetBlockId = doc.blocks.length > 0 ? doc.blocks[0].id : null
    if (targetBlockId) {
      onDropLayer(targetBlockId, layerType)
    }
  }

  return (
    <div
      className="network-canvas-container"
      ref={containerRef}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <svg ref={svgRef} />
    </div>
  )
}
```

- [ ] **Step 2: Create `src/renderer/src/components/editors/NetworkCanvas.css`**

```css
.network-canvas-container {
  flex: 1;
  overflow: auto;
  background: var(--editor-bg, #1e1e1e);
}

.network-canvas-container svg {
  display: block;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/editors/NetworkCanvas.tsx src/renderer/src/components/editors/NetworkCanvas.css
git commit -m "feat: add NetworkCanvas D3 SVG block diagram component"
```

---

### Task 8: NetworkEditor — top-level 3-panel editor

**Files:**
- Create: `src/renderer/src/components/editors/NetworkEditor.tsx`
- Create: `src/renderer/src/components/editors/NetworkEditor.css`

- [ ] **Step 1: Create `src/renderer/src/components/editors/NetworkEditor.tsx`**

```typescript
import { useReducer, useEffect, useRef, useState, useCallback, useMemo } from 'react'
import type { NetworkDocument, CodeMapping } from '../../../../main/schemas/note-types'
import type { LayerDef, LayerCatalogOverrides } from '../../../../main/schemas/layer-catalog'
import { resolveLayerCatalog, getLayerDef } from '../../../../main/schemas/layer-catalog'
import { networkReducer } from './networkReducer'
import type { NetworkAction } from './networkReducer'
import { NetworkPalette } from './NetworkPalette'
import { NetworkCanvas } from './NetworkCanvas'
import { NetworkPanel } from './NetworkPanel'
import './NetworkEditor.css'

interface NetworkEditorProps {
  document: NetworkDocument
  notePath: string
  onSave: (doc: NetworkDocument) => Promise<void>
  onNavigateToCode?: (filePath: string, line: number) => void
}

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'

export function NetworkEditor({ document: initialDoc, notePath, onSave, onNavigateToCode }: NetworkEditorProps) {
  const [doc, dispatch] = useReducer(networkReducer, initialDoc)
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  const [panelHeight, setPanelHeight] = useState(0.3)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [catalogOverrides, setCatalogOverrides] = useState<LayerCatalogOverrides | null>(null)
  const [resolvedMapping, setResolvedMapping] = useState<CodeMapping | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const oldDocRef = useRef(doc)

  // Resolve catalog (built-in + project overrides)
  const catalog = useMemo(() => resolveLayerCatalog(catalogOverrides), [catalogOverrides])

  // Reset when opening a different document
  useEffect(() => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
    dispatch({ type: 'SET_DOCUMENT', document: initialDoc })
    oldDocRef.current = initialDoc
    setSelectedBlockId(null)
    setSelectedLayerId(null)
    setSaveStatus('saved')
  }, [initialDoc])

  // Auto-save with 300ms debounce
  useEffect(() => {
    if (doc === oldDocRef.current) return
    oldDocRef.current = doc
    setSaveStatus('unsaved')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving')
      try { await onSave(doc); setSaveStatus('saved') }
      catch { setSaveStatus('error') }
    }, 300)
  }, [doc, onSave])

  // Ctrl+S immediate save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        setSaveStatus('saving')
        onSave(doc).then(() => setSaveStatus('saved')).catch(() => setSaveStatus('error'))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [doc, onSave])

  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [])

  // Load project-level layer catalog overrides
  useEffect(() => {
    const loadOverrides = async () => {
      try {
        const ov = await window.electronAPI.readLayerCatalog()
        if (ov) setCatalogOverrides(ov)
      } catch { /* no override file, use defaults */ }
    }
    loadOverrides()
  }, [notePath])

  const selectedLayer = useMemo(() => {
    if (!selectedBlockId || !selectedLayerId) return null
    for (const block of doc.blocks) {
      if (block.id === selectedBlockId) {
        return block.layers.find(l => l.id === selectedLayerId) || null
      }
    }
    return null
  }, [doc.blocks, selectedBlockId, selectedLayerId])

  const selectedLayerDef = useMemo(() => {
    if (!selectedLayer) return undefined
    return getLayerDef(selectedLayer.type, catalogOverrides)
  }, [selectedLayer, catalogOverrides])

  const handleSelectLayer = useCallback((blockId: string, layerId: string) => {
    setSelectedBlockId(blockId || null)
    setSelectedLayerId(layerId || null)
  }, [])

  const handleSelectBlock = useCallback((blockId: string) => {
    setSelectedBlockId(blockId)
    setSelectedLayerId(null)
  }, [])

  const handleDropLayer = useCallback((blockId: string, layerType: string, afterLayerId?: string) => {
    dispatch({ type: 'ADD_LAYER', blockId, layerType, afterLayerId })
  }, [])

  const handleDeleteLayer = useCallback((blockId: string, layerId: string) => {
    dispatch({ type: 'DELETE_LAYER', blockId, layerId })
    setSelectedBlockId(null)
    setSelectedLayerId(null)
  }, [])

  const handleResolveRef = useCallback(async (raw: string) => {
    if (!selectedLayerId || !selectedBlockId) return
    try {
      const mappings = await window.electronAPI.resolveRefs(notePath, `@ref(${raw})`, undefined)
      if (mappings.length > 0) {
        const m = mappings[0]
        setResolvedMapping(m)
        dispatch({ type: 'UPDATE_LAYER_CODE_MAPPING', blockId: selectedBlockId, layerId: selectedLayerId, codeMapping: m })
      }
    } catch { /* ref resolution failed */ }
  }, [notePath, selectedBlockId, selectedLayerId])

  const handlePanelResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const container = (e.target as HTMLElement).closest('.network-editor')
    if (!container) return
    const containerHeight = container.getBoundingClientRect().height
    const onMove = (ev: MouseEvent) => {
      const dy = startY - ev.clientY
      const newFrac = Math.min(0.55, Math.max(0.15, (dy / containerHeight) + panelHeight))
      setPanelHeight(newFrac)
    }
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [panelHeight])

  const saveStatusClass =
    saveStatus === 'saved' ? 'net-save-saved' :
    saveStatus === 'saving' ? 'net-save-saving' :
    saveStatus === 'unsaved' ? 'net-save-unsaved' : 'net-save-error'

  return (
    <div className="network-editor">
      {/* Toolbar */}
      <div className="network-editor-toolbar">
        <span className="network-editor-label">Network:</span>
        <input
          className="network-editor-name-input"
          value={doc.name}
          onChange={(e) => dispatch({ type: 'UPDATE_NETWORK_NAME', name: e.target.value })}
        />
        <span className="network-editor-label">Input:</span>
        <input
          className="network-editor-shape-input"
          value={doc.inputShape}
          onChange={(e) => dispatch({ type: 'UPDATE_INPUT_SHAPE', shape: e.target.value })}
          placeholder="3×224×224"
        />
        <span style={{ flex: 1 }} />
        <button className="network-editor-btn" onClick={() => dispatch({ type: 'ADD_BLOCK', name: 'New Block' })}>
          + Add Block
        </button>
        <span className={`network-editor-save-status ${saveStatusClass}`}>
          {saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving...' : saveStatus === 'unsaved' ? 'Unsaved' : 'Error'}
        </span>
      </div>

      {/* Palette */}
      <NetworkPalette catalog={catalog} />

      {/* Canvas */}
      <div style={{ flex: `0 0 ${100 - panelHeight * 100}%`, overflow: 'hidden' }}>
        <NetworkCanvas
          doc={doc}
          catalog={catalog}
          selectedBlockId={selectedBlockId}
          selectedLayerId={selectedLayerId}
          onSelectLayer={handleSelectLayer}
          onSelectBlock={handleSelectBlock}
          onDropLayer={handleDropLayer}
          onDeleteLayer={handleDeleteLayer}
        />
      </div>

      {/* Resize handle */}
      <div className="network-editor-resize-handle" onMouseDown={handlePanelResize} />

      {/* Edit panel */}
      <div className="network-editor-panel" style={{ flex: `0 0 ${panelHeight * 100}%` }}>
        <NetworkPanel
          layer={selectedLayer}
          layerDef={selectedLayerDef}
          onUpdateParam={(layerId, key, val) => dispatch({ type: 'UPDATE_LAYER', blockId: selectedBlockId!, layerId, field: 'params', paramKey: key, value: val })}
          onUpdateInputShape={(layerId, shape) => dispatch({ type: 'UPDATE_LAYER', blockId: selectedBlockId!, layerId, field: 'inputShape', value: shape })}
          onUpdateOutputShape={(layerId, shape) => dispatch({ type: 'UPDATE_LAYER', blockId: selectedBlockId!, layerId, field: 'outputShape', value: shape })}
          onUpdateCodeMapping={(layerId, mapping) => dispatch({ type: 'UPDATE_LAYER_CODE_MAPPING', blockId: selectedBlockId!, layerId, codeMapping: mapping })}
          onUpdateLayerName={(layerId, name) => dispatch({ type: 'UPDATE_LAYER', blockId: selectedBlockId!, layerId, field: 'name', value: name })}
          onResolveRef={handleResolveRef}
          resolvedMapping={resolvedMapping}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/renderer/src/components/editors/NetworkEditor.css`**

```css
.network-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--editor-bg, #1e1e1e);
  color: var(--text-color, #d4d4d4);
}

.network-editor-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--panel-bg, #252526);
  border-bottom: 1px solid var(--border-color, #333);
}

.network-editor-label {
  font-size: 11px;
  color: var(--placeholder-color, #888);
  font-weight: 600;
}

.network-editor-name-input {
  width: 130px;
  padding: 2px 6px;
  font-size: 11px;
  background: var(--input-bg, #2a2a2a);
  color: var(--text-color, #d4d4d4);
  border: 1px solid var(--border-color, #444);
  border-radius: 3px;
}

.network-editor-shape-input {
  width: 80px;
  padding: 2px 6px;
  font-size: 11px;
  background: var(--input-bg, #2a2a2a);
  color: var(--text-color, #d4d4d4);
  border: 1px solid var(--border-color, #444);
  border-radius: 3px;
}

.network-editor-btn {
  padding: 3px 10px;
  font-size: 10px;
  background: var(--accent-color, #4a90d9);
  color: #fff;
  border: none;
  border-radius: 3px;
  cursor: pointer;
}

.network-editor-btn:hover {
  background: var(--accent-hover, #3a7bc8);
}

.network-editor-save-status {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
}

.net-save-saved { color: var(--green, #4caf50); }
.net-save-saving { color: var(--yellow, #ff9800); }
.net-save-unsaved { color: var(--orange, #ff9800); }
.net-save-error { color: var(--red, #f44336); }

.network-editor-resize-handle {
  height: 4px;
  background: var(--border-color, #333);
  cursor: ns-resize;
  flex-shrink: 0;
}

.network-editor-resize-handle:hover {
  background: var(--accent-color, #4a90d9);
}

.network-editor-panel {
  overflow: hidden;
  flex-shrink: 0;
  border-top: 1px solid var(--border-color, #333);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/editors/NetworkEditor.tsx src/renderer/src/components/editors/NetworkEditor.css
git commit -m "feat: add NetworkEditor 3-panel editor component"
```

---

### Task 9: NetworkEmbedViewer — static embed for `.md` files

**Files:**
- Create: `src/renderer/src/components/editors/NetworkEmbedViewer.tsx`

- [ ] **Step 1: Create `src/renderer/src/components/editors/NetworkEmbedViewer.tsx`**

```typescript
import { useMemo } from 'react'
import type { NetworkDocument } from '../../../../main/schemas/note-types'
import { resolveLayerCatalog } from '../../../../main/schemas/layer-catalog'

interface NetworkEmbedViewerProps {
  document: NetworkDocument
  onNavigateToCode?: (filePath: string, line: number) => void
}

export function NetworkEmbedViewer({ document, onNavigateToCode }: NetworkEmbedViewerProps) {
  const catalog = useMemo(() => resolveLayerCatalog(null), [])

  return (
    <div className="net-embed-viewer" style={{ padding: 12, fontFamily: 'monospace', fontSize: 10, lineHeight: 1.4, overflow: 'auto', background: '#1e1e1e', color: '#d4d4d4', borderRadius: 6 }}>
      <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 8, color: '#ff9800' }}>
        {document.name}
        {document.inputShape && <span style={{ fontWeight: 'normal', color: '#888', marginLeft: 8 }}>Input: {document.inputShape}</span>}
      </div>

      {document.blocks.map(block => {
        const blockLabel = block.repeat && block.repeat > 1
          ? `${block.name} ×${block.repeat}`
          : block.name

        return (
          <div key={block.id} style={{ border: '2px dashed #ff9800', borderRadius: 8, padding: 8, marginBottom: 8 }}>
            <div style={{ fontWeight: 'bold', color: '#ff9800', fontSize: 10, marginBottom: 4 }}>{blockLabel}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              {block.layers.map((layer, i) => {
                const def = catalog[layer.type]
                const color = def?.color ?? '#888'
                return (
                  <span key={layer.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {i > 0 && <span style={{ color: '#888' }}>→</span>}
                    <span
                      style={{
                        display: 'inline-block', padding: '3px 8px', borderRadius: 4,
                        border: `2px solid ${color}`, background: color + '22',
                        fontSize: 9, cursor: layer.codeMapping && onNavigateToCode ? 'pointer' : 'default'
                      }}
                      title={layer.codeMapping ? `${layer.codeMapping.filePath}:${layer.codeMapping.startLine}` : undefined}
                      onClick={() => {
                        if (layer.codeMapping && onNavigateToCode) {
                          onNavigateToCode(layer.codeMapping.filePath, layer.codeMapping.startLine)
                        }
                      }}
                    >
                      <strong>{layer.type}</strong>
                      {layer.params.in_channels !== undefined && layer.params.out_channels !== undefined && (
                        <span style={{ color: '#888', marginLeft: 4 }}>{layer.params.in_channels}→{layer.params.out_channels}</span>
                      )}
                      {layer.codeMapping && (
                        <span style={{ color: '#4a90d9', fontSize: 7, marginLeft: 4 }}>@ref</span>
                      )}
                    </span>
                  </span>
                )
              })}
            </div>
            {block.skipConnections.length > 0 && (
              <div style={{ marginTop: 4, fontSize: 8, color: '#34a853', textAlign: 'center' }}>
                ──── skip connection ────
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/editors/NetworkEmbedViewer.tsx
git commit -m "feat: add NetworkEmbedViewer for static .md embed rendering"
```

---

### Task 10: Wire up `'net'` type in NoteViewport, EmbedCard, and markdown-renderer

**Files:**
- Modify: `src/renderer/src/components/NoteViewport.tsx`
- Modify: `src/renderer/src/components/editors/EmbedCard.tsx`
- Modify: `src/renderer/src/services/markdown-renderer.ts`

- [ ] **Step 1: Add import and routing in `src/renderer/src/components/NoteViewport.tsx`**

Add import next to other editor imports (after the `SequenceEditor` import):

```typescript
import { NetworkEditor } from './editors/NetworkEditor'
```

Add import for the type:

```typescript
import type { MindMapDocument, DerivationDocument, NetworkDocument } from '../../../main/schemas/note-types'
```

Add the `'net'` case in the `renderEditor` switch, after the `'seq'` case (before `default`):

```typescript
case 'net':
  return (
    <NetworkEditor
      document={activeNoteContent as NetworkDocument}
      notePath={selectedNoteId}
      onSave={async (doc: NetworkDocument) => {
        await saveNote(selectedNoteId, doc)
      }}
      onNavigateToCode={(filePath: string, line: number) => {
        navigateToCode(filePath, line)
      }}
    />
  )
```

Add `'net'` to the type labels record:

```typescript
const typeLabels: Record<string, string> = {
  md: 'MD', mind: 'Mind', derive: 'Derive', seq: 'Seq', net: 'Net'
}
```

- [ ] **Step 2: Add `'net'` to `EmbedCard.tsx`**

Add to the `typeLabels` record:

```typescript
const typeLabels: Record<NoteType, string> = {
  mind: 'Mind Map',
  md: 'Markdown',
  derive: 'Derivation',
  seq: 'Sequence Diagram',
  net: 'Network'
}
```

- [ ] **Step 3: Add `'net'` to `inferEmbedType` in `src/renderer/src/services/markdown-renderer.ts`**

Add after the `.seq.mermaid` check:

```typescript
if (path.endsWith('.net.json')) return 'net'
```

- [ ] **Step 4: Add `'net'` embed rendering in `MindMapCanvas.tsx` embed section**

In the `EmbedCard` component's `EmbedCardBody` in `src/renderer/src/components/editors/MindMapCanvas.tsx`:

Add import at top:

```typescript
import { NetworkEmbedViewer } from './NetworkEmbedViewer'
```

Add rendering case in the embed content section (after the `seq` case in the `EmbedCard` component):

```typescript
{cached.noteType === 'net' && (
  <NetworkEmbedViewer document={cached.content as NetworkDocument} />
)}
```

Also add `NetworkDocument` to the `NoteContent` type:

```typescript
type NoteContent = string | MindMapDocument | DerivationDocument | NetworkDocument
```

- [ ] **Step 5: Run the full test suite to verify no regressions**

```bash
npx vitest run 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/NoteViewport.tsx src/renderer/src/components/editors/EmbedCard.tsx src/renderer/src/services/markdown-renderer.ts src/renderer/src/components/editors/MindMapCanvas.tsx
git commit -m "feat: wire up 'net' type in Viewport, Embeds, and markdown renderer"
```

---

### Task 11: Add `readLayerCatalog` IPC handler and type bridge

**Files:**
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/renderer/src/types/electron.d.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/components/editors/NetworkEditor.tsx`
- Modify: `src/renderer/src/components/NoteViewport.tsx`

- [ ] **Step 1: Add IPC handler in `src/main/ipc-handlers.ts`**

Find the section near other `code:` handlers and add:

```typescript
ipcMain.handle('catalog:read-layer-catalog', async (_event, projectPath: string) => {
  const { readTextFile, fileExists } = await import('./services/file-system')
  const path = require('path')
  const catalogPath = path.join(projectPath, 'notes', '.layer-catalog.json')
  const exists = await fileExists(catalogPath)
  if (!exists) return null
  const raw = await readTextFile(catalogPath)
  return JSON.parse(raw)
})
```

- [ ] **Step 2: Add type declaration in `src/renderer/src/types/electron.d.ts`**

Add after the `resolveRefs` entry:

```typescript
readLayerCatalog: (projectPath: string) => Promise<{
  extend?: Record<string, { category: string; color: string; params: Array<{ name: string; type: string; default?: unknown; required?: boolean }> }>
  override?: Record<string, { color?: string }>
} | null>
```

- [ ] **Step 3: Expose in preload `src/preload/index.ts`**

Add after the `resolveRefs` line in the `api` object:

```typescript
readLayerCatalog: (projectPath: string) =>
  ipcRenderer.invoke('catalog:read-layer-catalog', projectPath),
```

- [ ] **Step 4: Pass `workspacePath` to NetworkEditor**

In `src/renderer/src/components/editors/NetworkEditor.tsx`, add `workspacePath` to props:

```typescript
interface NetworkEditorProps {
  document: NetworkDocument
  notePath: string
  workspacePath: string | null
  onSave: (doc: NetworkDocument) => Promise<void>
  onNavigateToCode?: (filePath: string, line: number) => void
}
```

Update the catalog loading effect:

```typescript
useEffect(() => {
  const loadOverrides = async () => {
    if (!workspacePath) return
    try {
      const ov = await window.electronAPI.readLayerCatalog(workspacePath)
      if (ov) setCatalogOverrides(ov)
    } catch { /* no override file, use defaults */ }
  }
  loadOverrides()
}, [workspacePath])
```

- [ ] **Step 5: Pass `workspacePath` from NoteViewport**

In `src/renderer/src/components/NoteViewport.tsx`, update the `'net'` case to pass `workspacePath`:

```typescript
case 'net':
  return (
    <NetworkEditor
      document={activeNoteContent as NetworkDocument}
      notePath={selectedNoteId}
      workspacePath={state.workspacePath}
      onSave={async (doc: NetworkDocument) => {
        await saveNote(selectedNoteId, doc)
      }}
      onNavigateToCode={(filePath: string, line: number) => {
        navigateToCode(filePath, line)
      }}
    />
  )
```

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc-handlers.ts src/renderer/src/types/electron.d.ts src/preload/index.ts
git commit -m "feat: add readLayerCatalog IPC handler for project-level layer overrides"
```

---

### Task 12: End-to-end smoke test and cleanup

**Files:**
- (None new — verify whole app compiles and tests pass)

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run 2>&1
```

Expected: all tests pass, including the new `note-types`, `layer-catalog`, and `networkReducer` tests.

- [ ] **Step 2: Type-check the project**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Fix any type errors that surface.

- [ ] **Step 3: Verify build succeeds**

```bash
npx electron-vite build 2>&1 | tail -10
```

Expected: build completes without errors.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final integration fixes and type checks for .net.json feature"
```
