import { useRef, useEffect, useCallback } from 'react'
import * as d3 from 'd3'
import type { NetworkDocument, NetworkLayer } from '../../../../main/schemas/note-types'
import type { LayerDef } from '../../../../main/schemas/layer-catalog'
import './NetworkCanvas.css'

interface NetworkCanvasProps {
  doc: NetworkDocument
  catalog: Record<string, LayerDef>
  selectedBlockId: string | null
  selectedLayerId: string | null
  onSelectLayer: (blockId: string, layerId: string) => void
  onSelectBlock: (blockId: string) => void
  onDropLayer: (blockId: string, layerType: string, afterLayerId?: string) => void
  onDeleteLayer: (blockId: string, layerId: string) => void
}

const LAYER_W = 120
const LAYER_H = 42
const LAYER_GAP = 14
const BLOCK_PAD = 20
const ARROW_W = 24

function formatLayerLabel(layer: NetworkLayer): string {
  const p = layer.params
  const inCh = p.in_channels ?? p.in_features
  const outCh = p.out_channels ?? p.out_features
  if (inCh !== undefined && outCh !== undefined) {
    return `${layer.type}\n${inCh}→${outCh}`
  }
  if (p.num_features !== undefined) {
    return `${layer.type}\n${p.num_features}`
  }
  return layer.type
}

export function NetworkCanvas({
  doc, catalog, selectedBlockId, selectedLayerId,
  onSelectLayer, onSelectBlock, onDropLayer, onDeleteLayer
}: NetworkCanvasProps) {

  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const blockPositionsRef = useRef<Array<{ blockId: string; y: number; height: number }>>([])

  const render = useCallback(() => {
    const svg = d3.select(svgRef.current)
    const container = containerRef.current
    if (!container) return

    const W = container.clientWidth || 800
    const H = container.clientHeight || 500
    svg.attr('width', W).attr('height', H)
    svg.selectAll('*').remove()

    const g = svg.append('g')

    let cy = 30

    // Input node
    const inputLabel = doc.inputShape ? `Input ${doc.inputShape}` : 'Input'
    g.append('rect')
      .attr('x', W / 2 - 60).attr('y', cy).attr('width', 120).attr('height', 28)
      .attr('rx', 6).attr('fill', '#f5f5f5').attr('stroke', '#666').attr('stroke-width', 2)
    g.append('text')
      .attr('x', W / 2).attr('y', cy + 18).attr('text-anchor', 'middle')
      .attr('fill', '#333').attr('font-size', '11px').attr('font-weight', 'bold')
      .text(inputLabel)

    cy += 40

    // Reset block positions for drop hit-testing
    const positions: Array<{ blockId: string; y: number; height: number }> = []

    // Render blocks
    for (let bi = 0; bi < doc.blocks.length; bi++) {
      const block = doc.blocks[bi]

      // Arrow between blocks
      g.append('text')
        .attr('x', W / 2).attr('y', cy - 6).attr('text-anchor', 'middle')
        .attr('fill', '#888').attr('font-size', '14px')
        .text('↓')
      cy += 8

      const layerCount = block.layers.length
      const blockW = layerCount > 0
        ? layerCount * (LAYER_W + ARROW_W) - ARROW_W + BLOCK_PAD * 2
        : 200
      const blockH = LAYER_H + BLOCK_PAD * 2 + 28

      // Record block position for drop hit-test
      positions.push({ blockId: block.id, y: cy, height: blockH })

      const blockX = (W - blockW) / 2
      const isSelected = block.id === selectedBlockId

      // Block rect
      const blockG = g.append('g')
        .attr('class', 'net-block')
        .attr('data-block-id', block.id)
        .style('cursor', 'pointer')

      blockG.append('rect')
        .attr('x', blockX).attr('y', cy).attr('width', blockW).attr('height', blockH)
        .attr('rx', 10).attr('fill', 'none')
        .attr('stroke', isSelected ? '#4a90d9' : '#ff9800')
        .attr('stroke-width', isSelected ? 2.5 : 1.5)
        .attr('stroke-dasharray', '6,3')

      // Block header
      let headerText = block.name
      if (block.repeat && block.repeat > 1) headerText += ` ×${block.repeat}`

      blockG.append('text')
        .attr('x', blockX + 10).attr('y', cy + 16)
        .attr('fill', '#ff9800').attr('font-size', '11px').attr('font-weight', 'bold')
        .text(headerText)

      blockG.on('click', (event: MouseEvent) => {
        event.stopPropagation()
        onSelectBlock(block.id)
      })

      // Render layers within block
      if (layerCount > 0) {
        const layersStartX = blockX + BLOCK_PAD
        const layersY = cy + BLOCK_PAD + 16

        for (let li = 0; li < layerCount; li++) {
          const layer = block.layers[li]
          const lx = layersStartX + li * (LAYER_W + ARROW_W)
          const def = catalog[layer.type]
          const color = def?.color ?? '#888'
          const isLayerSelected = layer.id === selectedLayerId

          const layerG = blockG.append('g')
            .attr('class', 'net-layer')
            .attr('data-layer-id', layer.id)
            .attr('data-block-id', block.id)
            .style('cursor', 'pointer')

          layerG.append('rect')
            .attr('x', lx).attr('y', layersY).attr('width', LAYER_W).attr('height', LAYER_H)
            .attr('rx', 6).attr('fill', color + '22')
            .attr('stroke', color).attr('stroke-width', isLayerSelected ? 2.5 : 1.5)

          // Layer type label
          const label = formatLayerLabel(layer)
          const lines = label.split('\n')
          layerG.append('text')
            .attr('x', lx + LAYER_W / 2).attr('y', layersY + 16)
            .attr('text-anchor', 'middle').attr('fill', '#d4d4d4')
            .attr('font-size', '10px').attr('font-weight', 'bold')
            .text(lines[0])
          if (lines[1]) {
            layerG.append('text')
              .attr('x', lx + LAYER_W / 2).attr('y', layersY + 30)
              .attr('text-anchor', 'middle').attr('fill', '#999')
              .attr('font-size', '9px')
              .text(lines[1])
          }

          // Code mapping indicator
          if (layer.codeMapping) {
            layerG.append('circle')
              .attr('cx', lx + LAYER_W - 8).attr('cy', layersY + 8).attr('r', 3)
              .attr('fill', '#4a90d9')
          }

          layerG.on('click', (event: MouseEvent) => {
            event.stopPropagation()
            onSelectLayer(block.id, layer.id)
          })

          // Connection port dots
          layerG.append('circle')
            .attr('cx', lx).attr('cy', layersY + LAYER_H / 2).attr('r', 3)
            .attr('fill', color).attr('stroke', '#333').attr('stroke-width', 0.5)
            .style('opacity', 0.7)
          layerG.append('circle')
            .attr('cx', lx + LAYER_W).attr('cy', layersY + LAYER_H / 2).attr('r', 3)
            .attr('fill', color).attr('stroke', '#333').attr('stroke-width', 0.5)
            .style('opacity', 0.7)

          // Arrow between layers
          if (li < layerCount - 1) {
            const ax = lx + LAYER_W
            const ay = layersY + LAYER_H / 2
            blockG.append('line')
              .attr('x1', ax + 2).attr('y1', ay)
              .attr('x2', ax + ARROW_W - 4).attr('y2', ay)
              .attr('stroke', '#888').attr('stroke-width', 1.5)
            blockG.append('polygon')
              .attr('points', `${ax + ARROW_W - 4},${ay - 4} ${ax + ARROW_W},${ay} ${ax + ARROW_W - 4},${ay + 4}`)
              .attr('fill', '#888')
          }
        }
      } else {
        // Empty block placeholder
        blockG.append('text')
          .attr('x', blockX + blockW / 2).attr('y', cy + blockH / 2 + 10)
          .attr('text-anchor', 'middle').attr('fill', '#666').attr('font-size', '10px')
          .text('Drop layers here')
      }

      // Skip connection rendering
      if (block.skipConnections.length > 0) {
        const connY = cy + blockH - 4
        for (const sc of block.skipConnections) {
          blockG.append('line')
            .attr('x1', blockX).attr('y1', connY)
            .attr('x2', blockX + blockW).attr('y2', connY)
            .attr('stroke', '#34a853').attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '4,2')
          if (sc.label) {
            blockG.append('text')
              .attr('x', blockX + blockW / 2).attr('y', connY - 4)
              .attr('text-anchor', 'middle').attr('fill', '#34a853').attr('font-size', '8px')
              .text(sc.label)
          }
        }
      }

      cy += blockH + 12
    }

    // Save positions for drop hit-testing
    blockPositionsRef.current = positions

    // Background click to deselect
    svg.on('click', () => {
      onSelectLayer('', '')
    })

    // Total SVG height
    svg.attr('height', Math.max(H, cy + 30))

  }, [doc, catalog, selectedBlockId, selectedLayerId, onSelectLayer, onSelectBlock])

  useEffect(() => {
    render()
  }, [render])

  // Keyboard: Delete
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedLayerId && selectedBlockId) {
        e.preventDefault()
        onDeleteLayer(selectedBlockId, selectedLayerId)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedLayerId, selectedBlockId, onDeleteLayer])

  // Handle drop from palette
  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-net-layer')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const layerType = e.dataTransfer.getData('application/x-net-layer')
    if (!layerType) return

    // Hit-test: find which block the drop landed on
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const dropY = e.clientY - rect.top + container.scrollTop

    let targetBlockId: string | null = null
    for (const pos of blockPositionsRef.current) {
      if (dropY >= pos.y && dropY <= pos.y + pos.height) {
        targetBlockId = pos.blockId
        break
      }
    }

    // Fallback to first block if no hit
    if (!targetBlockId && doc.blocks.length > 0) {
      targetBlockId = doc.blocks[0].id
    }

    if (targetBlockId) {
      onDropLayer(targetBlockId, layerType)
    }
  }

  return (
    <div
      className="network-canvas-container"
      ref={containerRef}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <svg ref={svgRef} />
    </div>
  )
}
