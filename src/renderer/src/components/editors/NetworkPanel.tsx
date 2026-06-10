import { useRef, useEffect, useMemo, useState } from 'react'
import type { LayerDef } from '../../../../main/schemas/layer-catalog'
import type { GraphNode } from '../../../../main/schemas/note-types'
import { computeOutputShape } from '../../../../main/utils/shape-computation'
import { CodeMappingField } from '../CodeMappingField'
import './NetworkPanel.css'

interface NetworkPanelProps {
  node: GraphNode | null
  nodeDef: LayerDef | undefined
  onUpdateNode: (nodeId: string, field: string, value: unknown, paramKey?: string) => void
  onAddEdge: (source: string, target: string) => void
  notePath: string
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
  node, nodeDef, onUpdateNode, onAddEdge, notePath
}: NetworkPanelProps) {

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

        {node.kind === 'layer' && params.length === 0 && (() => {
          // Stable IDs for React keys — avoids focus loss when renaming params
          const entries = Object.entries(node.params ?? {})
          const stableIds: string[] = []
          for (const [k] of entries) {
            let sid = paramIdsRef.current.get(k)
            if (!sid) {
              sid = k
              paramIdsRef.current.set(k, sid)
            }
            stableIds.push(sid)
          }
          return (
          <div className="network-panel-params">
            <div className="network-panel-section-title">Parameters</div>
            <div className="network-panel-kv-list">
              {entries.map(([key, value], idx) => (
                <div key={stableIds[idx]} className="network-panel-kv-row">
                  <input
                    className="network-panel-input network-panel-kv-key"
                    type="text"
                    value={key}
                    onChange={(e) => {
                      const newKey = e.target.value
                      const currentParams = { ...node.params }
                      const oldValue = currentParams[key]
                      delete currentParams[key]
                      if (newKey) {
                        currentParams[newKey] = oldValue
                        paramIdsRef.current.set(newKey, paramIdsRef.current.get(key) ?? key)
                      }
                      paramIdsRef.current.delete(key)
                      onUpdateNode(node.id, 'params', currentParams)
                    }}
                    placeholder="key"
                  />
                  <input
                    className="network-panel-input network-panel-kv-value"
                    type="text"
                    value={String(value ?? '')}
                    onChange={(e) => {
                      onUpdateNode(node.id, 'params', { ...node.params, [key]: e.target.value })
                    }}
                    placeholder="value"
                  />
                  <button
                    className="network-panel-kv-remove"
                    onClick={() => {
                      const next = { ...node.params }
                      delete next[key]
                      paramIdsRef.current.delete(key)
                      onUpdateNode(node.id, 'params', next)
                    }}
                    title="Remove parameter"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              className="network-panel-kv-add"
              onClick={() => {
                const next = { ...node.params }
                let n = Object.keys(next).length + 1
                while (`param${n}` in next) n++
                const newKey = `param${n}`
                next[newKey] = ''
                paramIdsRef.current.set(newKey, newKey)
                onUpdateNode(node.id, 'params', next)
              }}
            >
              + Add param
            </button>
          </div>
          )
        })()}

        {/* Block settings */}
        {node.kind === 'block' && (
          <>
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
                <div className="network-panel-field" style={{ gridColumn: 'span 2' }}>
                  <label className="network-panel-field-label">Direction</label>
                  <select
                    className="network-panel-input"
                    value={node.direction ?? 'auto'}
                    onChange={(e) => {
                      onUpdateNode(
                        node.id,
                        'direction',
                        e.target.value === 'auto' ? undefined : e.target.value
                      )
                    }}
                  >
                    <option value="auto">Auto (detect)</option>
                    <option value="vertical">Vertical (top→bottom)</option>
                    <option value="horizontal">Horizontal (left→right)</option>
                  </select>
                </div>
              </div>
            </div>
            {(node.children ?? []).length > 0 && (
              <div className="network-panel-params">
                <div className="network-panel-section-title">Layers ({node.children!.length})</div>
                {node.children!.map(child => (
                  <div key={child.id} style={{ fontSize: 10, color: '#d4d4d4', padding: '2px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: child.layerType ? '#4a90d9' : '#888' }}>{child.layerType ?? child.label}</span>
                    <span style={{ color: '#888', fontSize: 9 }}>{child.label}</span>
                  </div>
                ))}
              </div>
            )}
          </>
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
          <CodeMappingField
            codeMapping={node.codeMapping}
            notePath={notePath}
            onChange={(mapping) => onUpdateNode(node.id, 'codeMapping', mapping)}
          />
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
        </div>
      )}
    </div>
  )
}
