import { useMemo } from 'react'
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

  return (
    <div style={{
      padding: 12, fontFamily: 'monospace', fontSize: 10, lineHeight: 1.4,
      overflow: 'auto', background: '#1e1e1e', color: '#d4d4d4', borderRadius: 6
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

      {document.blocks.map((block, bi) => {
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
              border: `2px dashed ${block.id === document.blocks[0]?.id ? '#ff9800' : '#4a90d9'}`,
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
