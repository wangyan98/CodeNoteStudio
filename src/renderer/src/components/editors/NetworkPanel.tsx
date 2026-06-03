import type { LayerDef } from '../../../../main/schemas/layer-catalog'
import type { GraphNode, CodeMapping } from '../../../../main/schemas/note-types'
import './NetworkPanel.css'

interface NetworkPanelProps {
  node: GraphNode | null
  nodeDef: LayerDef | undefined
  onUpdateNode: (nodeId: string, field: string, value: unknown, paramKey?: string) => void
  onAddEdge: (source: string, target: string) => void
  onResolveRef: (raw: string) => void
  resolvedMapping: CodeMapping | null
}

function renderField(node: GraphNode, param: { name: string; type: string; default?: unknown }, onChange: (key: string, value: unknown) => void) {
  const value = node.params?.[param.name]
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
  node, nodeDef, onUpdateNode, onAddEdge, onResolveRef, resolvedMapping
}: NetworkPanelProps) {

  if (!node) {
    return (
      <div className="network-panel">
        <div className="network-panel-empty">Select a node to edit</div>
      </div>
    )
  }

  const params = nodeDef?.params ?? []

  return (
    <div className="network-panel">
      <div className="network-panel-main">
        <div className="network-panel-header">
          <span className="network-panel-layer-type" style={{ color: node.kind === 'block' ? '#ff9800' : (nodeDef?.color ?? '#888') }}>
            {node.kind === 'input' ? 'Input' : node.kind === 'output' ? 'Output' : node.kind === 'block' ? 'Block' : node.layerType ?? 'Node'}
          </span>
          <input
            className="network-panel-name-input"
            value={node.label}
            onChange={(e) => onUpdateNode(node.id, 'label', e.target.value)}
            placeholder="Node label"
          />
        </div>

        {/* Layer params (kind='layer' only) */}
        {node.kind === 'layer' && params.length > 0 && (
          <div className="network-panel-params">
            <div className="network-panel-section-title">Parameters</div>
            <div className="network-panel-params-grid">
              {params.map(p => renderField(node, p, (key, val) => onUpdateNode(node.id, 'params', val, key)))}
            </div>
          </div>
        )}

        {node.kind === 'layer' && params.length === 0 && (
          <div className="network-panel-params">
            <div className="network-panel-section-title">Parameters</div>
            <span className="network-panel-no-params">This layer has no parameters</span>
          </div>
        )}

        {/* Block settings */}
        {node.kind === 'block' && (
          <div className="network-panel-params">
            <div className="network-panel-section-title">Block Settings</div>
            <div className="network-panel-params-grid">
              <div className="network-panel-field" style={{ gridColumn: 'span 3' }}>
                <label className="network-panel-field-label">Name</label>
                <input
                  className="network-panel-input"
                  type="text"
                  value={node.label}
                  onChange={(e) => onUpdateNode(node.id, 'label', e.target.value)}
                />
              </div>
              <div className="network-panel-field">
                <label className="network-panel-field-label">Repeat</label>
                <input
                  className="network-panel-input"
                  type="number"
                  value={node.repeat ?? 1}
                  min={1}
                  onChange={(e) => onUpdateNode(node.id, 'repeat', Math.max(1, Number(e.target.value)))}
                />
              </div>
            </div>
          </div>
        )}

        {/* Input/Output node settings */}
        {(node.kind === 'input' || node.kind === 'output') && (
          <div className="network-panel-params">
            <div className="network-panel-section-title">Settings</div>
            <div className="network-panel-params-grid">
              <div className="network-panel-field" style={{ gridColumn: 'span 2' }}>
                <label className="network-panel-field-label">Label</label>
                <input
                  className="network-panel-input"
                  type="text"
                  value={node.label}
                  onChange={(e) => onUpdateNode(node.id, 'label', e.target.value)}
                />
              </div>
              <div className="network-panel-field" style={{ gridColumn: 'span 2' }}>
                <label className="network-panel-field-label">Shape</label>
                <input
                  className="network-panel-input"
                  type="text"
                  value={node.inputShape ?? ''}
                  onChange={(e) => onUpdateNode(node.id, 'inputShape', e.target.value)}
                  placeholder="e.g., 3x224x224"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Side: Code mapping + Tensor shapes (layer only) */}
      {node.kind === 'layer' && (
        <div className="network-panel-side">
          <div className="network-panel-section-title">Code Mapping</div>
          <input
            className="network-panel-input"
            value={node.codeMapping?.raw ?? ''}
            onChange={(e) => {
              const raw = e.target.value
              if (raw) {
                onResolveRef(raw)
              } else {
                onUpdateNode(node.id, 'codeMapping', null)
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
              value={node.inputShape || ''}
              onChange={(e) => onUpdateNode(node.id, 'inputShape', e.target.value)}
              placeholder="input (e.g., 64x56x56)"
            />
            <span className="network-panel-shape-arrow">→</span>
            <input
              className="network-panel-input"
              value={node.outputShape || ''}
              onChange={(e) => onUpdateNode(node.id, 'outputShape', e.target.value)}
              placeholder="output"
            />
          </div>
        </div>
      )}
    </div>
  )
}
