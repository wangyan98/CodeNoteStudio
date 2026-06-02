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
