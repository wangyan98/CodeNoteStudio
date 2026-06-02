import type { LayerDef } from '../../../../main/schemas/layer-catalog'
import type { NetworkLayer, NetworkBlock, CodeMapping } from '../../../../main/schemas/note-types'
import './NetworkPanel.css'

interface NetworkPanelProps {
  block: NetworkBlock | null
  layer: NetworkLayer | null
  layerDef: LayerDef | undefined
  onUpdateBlock: (blockId: string, field: string, value: string | number) => void
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
  block, layer, layerDef, onUpdateBlock, onUpdateParam, onUpdateInputShape,
  onUpdateOutputShape, onUpdateCodeMapping, onUpdateLayerName, onResolveRef, resolvedMapping
}: NetworkPanelProps) {

  // Block editing (no layer selected)
  if (!layer && block) {
    return (
      <div className="network-panel">
        <div className="network-panel-main">
          <div className="network-panel-header">
            <span className="network-panel-layer-type" style={{ color: '#ff9800' }}>
              Block: {block.name}
            </span>
          </div>
          <div className="network-panel-params">
            <div className="network-panel-section-title">Block Settings</div>
            <div className="network-panel-params-grid">
              <div className="network-panel-field" style={{ gridColumn: 'span 3' }}>
                <label className="network-panel-field-label">Name</label>
                <input
                  className="network-panel-input"
                  type="text"
                  value={block.name}
                  onChange={(e) => onUpdateBlock(block.id, 'name', e.target.value)}
                />
              </div>
              <div className="network-panel-field">
                <label className="network-panel-field-label">Repeat</label>
                <input
                  className="network-panel-input"
                  type="number"
                  value={block.repeat ?? 1}
                  min={1}
                  onChange={(e) => onUpdateBlock(block.id, 'repeat', Math.max(1, Number(e.target.value)))}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="network-panel-side">
          <div className="network-panel-section-title">Block</div>
          <span className="network-panel-no-params">Select a layer inside this block to edit parameters</span>
        </div>
      </div>
    )
  }

  if (!layer) {
    return (
      <div className="network-panel">
        <div className="network-panel-empty">Select a block or layer to edit</div>
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
