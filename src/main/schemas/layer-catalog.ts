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

import layerCatalogJson from '../../../layer-catalog.json'

export const BUILTIN_LAYERS: Record<string, LayerDef> =
  layerCatalogJson.layers as Record<string, LayerDef>

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
