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
