import { useMemo, Fragment } from 'react'
import type { NetworkDocument } from '../../../../main/schemas/note-types'
import { resolveLayerCatalog } from '../../../../main/schemas/layer-catalog'

interface NetworkEmbedViewerProps {
  document: NetworkDocument
  onNavigateToCode?: (filePath: string, line: number) => void
}

function formatLayerLabel(type: string, params: Record<string, unknown>): string[] {
  const inCh = params.in_channels ?? params.in_features
  const outCh = params.out_channels ?? params.out_features
  if (inCh !== undefined && outCh !== undefined) {
    return [type, `${inCh}→${outCh}`]
  }
  if (params.num_features !== undefined) {
    return [type, `${params.num_features}`]
  }
  return [type]
}

export function NetworkEmbedViewer({ document, onNavigateToCode }: NetworkEmbedViewerProps) {
  const catalog = useMemo(() => resolveLayerCatalog(null), [])

  // v2: render nodes with block nesting
  if (document.version === 2 && document.nodes) {
    // Topological sort of top-level nodes based on edges
    const edges = document.edges ?? []
    const adj = new Map<string, string[]>()
    const inDeg = new Map<string, number>()
    for (const n of document.nodes) {
      adj.set(n.id, [])
      inDeg.set(n.id, 0)
    }
    for (const e of edges) {
      if (adj.has(e.source) && inDeg.has(e.target)) {
        adj.get(e.source)!.push(e.target)
        inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1)
      }
    }
    const queue: string[] = []
    for (const [id, deg] of inDeg) {
      if (deg === 0) queue.push(id)
    }
    const order: string[] = []
    while (queue.length > 0) {
      const id = queue.shift()!
      order.push(id)
      for (const next of adj.get(id) ?? []) {
        const newDeg = (inDeg.get(next) ?? 1) - 1
        inDeg.set(next, newDeg)
        if (newDeg === 0) queue.push(next)
      }
    }
    // Append any orphan nodes not reached by edges (in original order)
    const orderedIds = new Set(order)
    for (const n of document.nodes) {
      if (!orderedIds.has(n.id)) order.push(n.id)
    }
    const idToNode = new Map(document.nodes.map(n => [n.id, n]))
    const ordered = order.map(id => idToNode.get(id)!).filter(Boolean)

    return (
      <div style={{
        padding: 12, fontFamily: 'monospace', fontSize: 10, lineHeight: 1.4,
        background: '#1e1e1e', color: '#d4d4d4', borderRadius: 6
      }}>
        <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 8, color: '#ff9800' }}>
          {document.name}
        </div>
        {ordered.map((node, i) => (
          <div key={node.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 4 }}>
            {i > 0 && <div style={{ textAlign: 'center', color: '#888', fontSize: 12, width: '100%' }}>↓</div>}

            {node.kind === 'block' ? (
              /* Block: dashed container with children inside */
              <div style={{
                border: '2px dashed #ff9800', borderRadius: 8, padding: 8,
                minWidth: 120, textAlign: 'center'
              }}>
                <div style={{ fontWeight: 'bold', color: '#ff9800', fontSize: 10, marginBottom: 6 }}>
                  {node.label}{node.repeat && node.repeat > 1 ? ` ×${node.repeat}` : ''}
                </div>
                {(node.children ?? []).length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                    {node.children!.map((child, ci) => (
                      <Fragment key={child.id}>
                        {ci > 0 && <div style={{ color: '#888', fontSize: 11, padding: '1px 0', textAlign: 'center' }}>↓</div>}
                        <span style={{
                          display: 'inline-block', padding: '4px 10px', borderRadius: 6,
                          border: `2px solid ${child.layerType ? (catalog[child.layerType]?.color ?? '#888') : '#888'}`,
                          background: (child.layerType ? (catalog[child.layerType]?.color ?? '#888') : '#888') + '22',
                          color: '#d4d4d4', fontWeight: 'bold', fontSize: 9, minWidth: 50, textAlign: 'center',
                          cursor: child.codeMapping && onNavigateToCode ? 'pointer' : 'default'
                        }}
                          title={child.codeMapping ? `${child.codeMapping.filePath}:${child.codeMapping.startLine}` : child.label}
                          onClick={() => {
                            if (child.codeMapping && onNavigateToCode) {
                              onNavigateToCode(child.codeMapping.filePath, child.codeMapping.startLine)
                            }
                          }}
                        >
                          {child.label}
                        </span>
                      </Fragment>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: '#666', fontSize: 9, padding: '4px 0' }}>(empty block)</div>
                )}
              </div>
            ) : (
              /* Standalone node */
              <span style={{
                display: 'inline-block', padding: '4px 12px', borderRadius: 6,
                border: `2px solid ${
                  node.kind === 'input' || node.kind === 'output' ? '#666' :
                  node.layerType ? (catalog[node.layerType]?.color ?? '#888') : '#888'
                }`,
                background: node.kind === 'input' || node.kind === 'output' ? '#f5f5f5' :
                  node.layerType ? (catalog[node.layerType]?.color ?? '#888') + '22' : 'none',
                color: node.kind === 'input' || node.kind === 'output' ? '#333' : '#d4d4d4',
                fontWeight: 'bold', fontSize: 9, minWidth: 60, textAlign: 'center',
                cursor: node.codeMapping && onNavigateToCode ? 'pointer' : 'default'
              }}
                title={node.codeMapping ? `${node.codeMapping.filePath}:${node.codeMapping.startLine}` : node.label}
                onClick={() => {
                  if (node.codeMapping && onNavigateToCode) {
                    onNavigateToCode(node.codeMapping.filePath, node.codeMapping.startLine)
                  }
                }}
              >
                <span>{node.label}</span>
                {node.inputShape && (
                  <span style={{ color: '#999', fontSize: 8, marginLeft: 4 }}>{node.inputShape}</span>
                )}
              </span>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{
      padding: 12, fontFamily: 'monospace', fontSize: 10, lineHeight: 1.4,
      background: '#1e1e1e', color: '#d4d4d4', borderRadius: 6
    }}>
      {/* Header */}
      <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 8, color: '#ff9800' }}>
        {document.name}
        {document.inputShape && (
          <span style={{ fontWeight: 'normal', color: '#888', marginLeft: 8 }}>
            Input: {document.inputShape}
          </span>
        )}
      </div>

      {/* Input node */}
      <div style={{
        display: 'flex', justifyContent: 'center', marginBottom: 4
      }}>
        <span style={{
          display: 'inline-block', padding: '4px 16px', borderRadius: 6,
          border: '2px solid #666', background: '#f5f5f5',
          color: '#333', fontWeight: 'bold', fontSize: 10
        }}>
          {document.inputShape ? `Input ${document.inputShape}` : 'Input'}
        </span>
      </div>

      {(document.blocks ?? []).map((block, bi) => {
        const blockLabel = block.repeat && block.repeat > 1
          ? `${block.name} ×${block.repeat}`
          : block.name

        return (
          <div key={block.id}>
            {/* Arrow between blocks */}
            <div style={{ textAlign: 'center', color: '#888', fontSize: 12, padding: '2px 0' }}>
              ↓
            </div>

            {/* Block */}
            <div style={{
              border: `2px dashed ${block.id === document.blocks?.[0]?.id ? '#ff9800' : '#4a90d9'}`,
              borderRadius: 8, padding: 8, marginBottom: 0
            }}>
              <div style={{ fontWeight: 'bold', color: '#ff9800', fontSize: 10, marginBottom: 6 }}>
                {blockLabel}
              </div>

              {block.layers.length > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {block.layers.map((layer, i) => {
                    const def = catalog[layer.type]
                    const color = def?.color ?? '#888'
                    const labels = formatLayerLabel(layer.type, layer.params)

                    return (
                      <span key={layer.id} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                        {i > 0 && (
                          <span style={{ color: '#888', margin: '0 2px', fontSize: 11 }}>→</span>
                        )}
                        <span
                          style={{
                            display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
                            padding: '4px 10px', borderRadius: 6,
                            border: `2px solid ${color}`, background: color + '22',
                            fontSize: 9, cursor: layer.codeMapping && onNavigateToCode ? 'pointer' : 'default',
                            minWidth: 60
                          }}
                          title={layer.codeMapping ? `${layer.codeMapping.filePath}:${layer.codeMapping.startLine}` : layer.type}
                          onClick={() => {
                            if (layer.codeMapping && onNavigateToCode) {
                              onNavigateToCode(layer.codeMapping.filePath, layer.codeMapping.startLine)
                            }
                          }}
                        >
                          <span style={{ fontWeight: 'bold' }}>{labels[0]}</span>
                          {labels[1] && (
                            <span style={{ color: '#999', fontSize: 8 }}>{labels[1]}</span>
                          )}
                          {layer.codeMapping && (
                            <span style={{ color: '#4a90d9', fontSize: 6 }}>@ref</span>
                          )}
                        </span>
                      </span>
                    )
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: '#666', fontSize: 9, padding: '8px 0' }}>
                  (empty block)
                </div>
              )}

              {/* Skip connection */}
              {block.skipConnections.length > 0 && (
                <div style={{
                  marginTop: 6, padding: '2px 0',
                  borderTop: '1.5px dashed #34a853',
                  textAlign: 'center', fontSize: 8, color: '#34a853'
                }}>
                  {block.skipConnections[0].label || 'skip'}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
