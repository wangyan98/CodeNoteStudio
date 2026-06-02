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

  for (const [name, def] of Object.entries(BUILTIN_LAYERS)) {
    catalog[name] = { ...def, params: def.params.map(p => ({ ...p })) }
  }

  if (!overrides) return catalog

  if (overrides.override) {
    for (const [name, partial] of Object.entries(overrides.override)) {
      if (catalog[name]) {
        catalog[name] = deepMerge(catalog[name] as unknown as Record<string, unknown>, partial as unknown as Record<string, unknown>) as unknown as LayerDef
      }
    }
  }

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
