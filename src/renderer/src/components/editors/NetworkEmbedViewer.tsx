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
