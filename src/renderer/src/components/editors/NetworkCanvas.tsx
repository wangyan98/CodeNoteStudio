import { useRef, useEffect, useCallback } from 'react'
import * as d3 from 'd3'
import dagre from 'dagre'
import type { NetworkDocument, GraphNode, GraphEdge } from '../../../../main/schemas/note-types'
import type { LayerDef } from '../../../../main/schemas/layer-catalog'
import './NetworkCanvas.css'

interface NetworkCanvasProps {
  doc: NetworkDocument
  catalog: Record<string, LayerDef>
  selectedNodeId: string | null
  onSelectNode: (nodeId: string | null) => void
  onDropLayer: (layerType: string) => void
  onDeleteNode: (nodeId: string) => void
  onAddEdge: (source: string, target: string) => void
}

const NODE_W = 120
const NODE_H = 42
const INPUT_W = 100
const INPUT_H = 28
const BLOCK_MIN_W = 200
const BLOCK_HEADER_H = 24

function runLayout(nodes: GraphNode[], edges: GraphEdge[]): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 40, edgesep: 20, ranksep: 60, marginx: 40, marginy: 30 })
  g.setDefaultEdgeLabel(() => ({}))

  for (const n of nodes) {
    const w = n.kind === 'input' || n.kind === 'output' ? INPUT_W
      : n.kind === 'block' ? BLOCK_MIN_W : NODE_W
    const h = n.kind === 'input' || n.kind === 'output' ? INPUT_H
      : n.kind === 'block' ? NODE_H + BLOCK_HEADER_H : NODE_H
    g.setNode(n.id, { width: w, height: h })
  }

  for (const e of edges) {
    g.setEdge(e.source, e.target)
  }

  dagre.layout(g)

  const positions = new Map<string, { x: number; y: number }>()
  for (const n of nodes) {
    const node = g.node(n.id)
    if (node) positions.set(n.id, { x: node.x, y: node.y })
  }
  return positions
}

export function NetworkCanvas({
  doc, catalog, selectedNodeId,
  onSelectNode, onDropLayer, onDeleteNode, onAddEdge
}: NetworkCanvasProps) {

  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragConnectRef = useRef<{
    active: boolean
    sourceNodeId: string | null
    line: d3.Selection<SVGLineElement, unknown, null, undefined> | null
  }>({ active: false, sourceNodeId: null, line: null })

  const render = useCallback(() => {
    const svg = d3.select(svgRef.current)
    const container = containerRef.current
    if (!container) return

    const W = container.clientWidth || 800
    const H = container.clientHeight || 500
    svg.attr('width', W).attr('height', H)
    svg.selectAll('*').remove()

    const nodes = doc.nodes ?? []
    const edges = doc.edges ?? []
    const positions = runLayout(nodes, edges)

    // Compute bounding box for centering
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const p of positions.values()) {
      minX = Math.min(minX, p.x - NODE_W)
      maxX = Math.max(maxX, p.x + NODE_W)
      minY = Math.min(minY, p.y - NODE_H)
      maxY = Math.max(maxY, p.y + NODE_H)
    }
    const contentW = maxX - minX + 80
    const offsetX = (W - contentW) / 2 - minX + 40
    const offsetY = 30 - minY

    const g = svg.append('g').attr('class', 'canvas-content')

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => { g.attr('transform', event.transform.toString()) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    svg.call(zoom as any)

    // --- Render edges first (behind nodes) ---
    for (const edge of edges) {
      const srcPos = positions.get(edge.source)
      const tgtPos = positions.get(edge.target)
      if (!srcPos || !tgtPos) continue

      const srcNode = nodes.find(n => n.id === edge.source)
      const tgtNode = nodes.find(n => n.id === edge.target)
      const srcW = srcNode?.kind === 'input' || srcNode?.kind === 'output' ? INPUT_W : NODE_W
      const tgtW = tgtNode?.kind === 'input' || tgtNode?.kind === 'output' ? INPUT_W : NODE_W

      const x1 = offsetX + srcPos.x + srcW / 2
      const y1 = offsetY + srcPos.y
      const x2 = offsetX + tgtPos.x - tgtW / 2
      const y2 = offsetY + tgtPos.y

      if (edge.style === 'skip') {
        const mx = (x1 + x2) / 2
        const dy = Math.abs(y2 - y1) * 0.5
        const path = d3.path()
        path.moveTo(x1, y1)
        path.bezierCurveTo(mx, y1 - dy, mx, y2 + dy, x2, y2)
        g.append('path')
          .attr('d', path.toString())
          .attr('fill', 'none').attr('stroke', '#34a853').attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '4,3')
        g.append('polygon')
          .attr('points', `${x2-6},${y2-4} ${x2},${y2} ${x2-6},${y2+4}`)
          .attr('fill', 'none').attr('stroke', '#34a853').attr('stroke-width', 1.5)
      } else {
        g.append('line')
          .attr('x1', x1).attr('y1', y1).attr('x2', x2 - 4).attr('y2', y2)
          .attr('stroke', '#888').attr('stroke-width', 1.5)
        g.append('polygon')
          .attr('points', `${x2-4},${y2-4} ${x2},${y2} ${x2-4},${y2+4}`)
          .attr('fill', '#888')
      }

      if (edge.label) {
        g.append('text')
          .attr('x', (x1 + x2) / 2).attr('y', y1 - 6)
          .attr('text-anchor', 'middle').attr('fill', '#34a853').attr('font-size', '8px')
          .text(edge.label)
      }
    }

    // --- Render nodes ---
    for (const node of nodes) {
      const pos = positions.get(node.id)
      if (!pos) continue

      const isSelected = node.id === selectedNodeId
      let nw = NODE_W, nh = NODE_H, color = '#888', fill = '#2a2a2a'

      if (node.kind === 'input' || node.kind === 'output') {
        nw = INPUT_W; nh = INPUT_H; color = '#666'; fill = '#f5f5f5'
      } else if (node.kind === 'layer' && node.layerType) {
        const def = catalog[node.layerType]
        color = def?.color ?? '#888'
        fill = (def?.color ?? '#888') + '22'
      } else if (node.kind === 'block') {
        nw = BLOCK_MIN_W; color = '#ff9800'; fill = 'none'
      }

      const nx = offsetX + pos.x - nw / 2
      const ny = offsetY + pos.y - nh / 2

      const nodeG = g.append('g')
        .attr('class', 'net-node')
        .attr('data-node-id', node.id)
        .style('cursor', 'pointer')

      if (node.kind === 'block') {
        nodeG.append('rect')
          .attr('x', nx).attr('y', ny).attr('width', nw).attr('height', nh)
          .attr('rx', 10).attr('fill', 'none')
          .attr('stroke', isSelected ? '#4a90d9' : '#ff9800')
          .attr('stroke-width', isSelected ? 2.5 : 1.5)
          .attr('stroke-dasharray', '6,3')
        let headerText = node.label
        if (node.repeat && node.repeat > 1) headerText += ` ×${node.repeat}`
        nodeG.append('text')
          .attr('x', nx + 10).attr('y', ny + 16)
          .attr('fill', '#ff9800').attr('font-size', '11px').attr('font-weight', 'bold')
          .text(headerText)
      } else if (node.kind === 'input' || node.kind === 'output') {
        nodeG.append('rect')
          .attr('x', nx).attr('y', ny).attr('width', nw).attr('height', nh)
          .attr('rx', 6).attr('fill', fill)
          .attr('stroke', isSelected ? '#4a90d9' : color)
          .attr('stroke-width', isSelected ? 2.5 : 1.5)
        nodeG.append('text')
          .attr('x', nx + nw / 2).attr('y', ny + nh / 2 + 4)
          .attr('text-anchor', 'middle').attr('fill', '#333')
          .attr('font-size', '11px').attr('font-weight', 'bold')
          .text(node.label + (node.inputShape ? ` ${node.inputShape}` : ''))
      } else {
        // layer
        nodeG.append('rect')
          .attr('x', nx).attr('y', ny).attr('width', nw).attr('height', nh)
          .attr('rx', 6).attr('fill', fill)
          .attr('stroke', isSelected ? '#4a90d9' : color)
          .attr('stroke-width', isSelected ? 2.5 : 1.5)
        nodeG.append('text')
          .attr('x', nx + nw / 2).attr('y', ny + nh / 2 + 4)
          .attr('text-anchor', 'middle').attr('fill', '#d4d4d4')
          .attr('font-size', '10px').attr('font-weight', 'bold')
          .text(node.label)
        if (node.codeMapping) {
          nodeG.append('circle')
            .attr('cx', nx + nw - 8).attr('cy', ny + 8).attr('r', 3)
            .attr('fill', '#4a90d9')
        }
      }

      nodeG.on('click', (event: MouseEvent) => {
        event.stopPropagation()
        onSelectNode(node.id)
      })

      // Output port — only for nodes that are not 'output'
      if (node.kind !== 'output') {
        nodeG.append('circle')
          .attr('class', 'net-port-out')
          .attr('cx', nx + nw)
          .attr('cy', ny + nh / 2)
          .attr('r', 3)
          .attr('fill', color)
          .attr('stroke', '#333')
          .attr('stroke-width', 0.5)
          .attr('opacity', 0.5)
          .style('cursor', 'crosshair')
          .on('mouseenter', function () { d3.select(this).attr('opacity', 1).attr('r', 5) })
          .on('mouseleave', function () { d3.select(this).attr('opacity', 0.5).attr('r', 3) })
      }

      // Input port — only for nodes that are not 'input'
      if (node.kind !== 'input') {
        nodeG.append('circle')
          .attr('class', 'net-port-in')
          .attr('cx', nx)
          .attr('cy', ny + nh / 2)
          .attr('r', 3)
          .attr('fill', color)
          .attr('stroke', '#333')
          .attr('stroke-width', 0.5)
          .attr('opacity', 0.5)
          .style('cursor', 'crosshair')
          .on('mouseenter', function () { d3.select(this).attr('opacity', 1).attr('r', 5) })
          .on('mouseleave', function () { d3.select(this).attr('opacity', 0.5).attr('r', 3) })
      }
    }

    // Background click to deselect
    svg.on('click', () => { onSelectNode(null) })

  }, [doc, catalog, selectedNodeId, onSelectNode])

  useEffect(() => {
    render()
  }, [render])

  const handlePortMouseDown = useCallback((event: React.MouseEvent) => {
    const target = event.target as Element
    if (!target.classList.contains('net-port-out')) return

    const nodeEl = target.closest('.net-node') as HTMLElement | null
    if (!nodeEl) return
    const sourceNodeId = nodeEl.getAttribute('data-node-id')
    if (!sourceNodeId) return

    const svgEl = svgRef.current
    const container = containerRef.current
    if (!svgEl || !container) return

    const transform = d3.zoomTransform(svgEl)
    const rect = container.getBoundingClientRect()
    const svgX = (event.clientX - rect.left - transform.x) / transform.k
    const svgY = (event.clientY - rect.top - transform.y) / transform.k

    const g = d3.select(svgEl).select<SVGGElement>('.canvas-content')
    const line = g.append('line')
      .attr('x1', svgX).attr('y1', svgY)
      .attr('x2', svgX).attr('y2', svgY)
      .attr('stroke', '#4a90d9').attr('stroke-width', 2)
      .attr('stroke-dasharray', '4,2')

    dragConnectRef.current = { active: true, sourceNodeId, line }

    const handleMouseMove = (e: MouseEvent) => {
      const mx = (e.clientX - rect.left - transform.x) / transform.k
      const my = (e.clientY - rect.top - transform.y) / transform.k
      line.attr('x2', mx).attr('y2', my)
    }

    const handleMouseUp = (e: MouseEvent) => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      line.remove()
      dragConnectRef.current = { active: false, sourceNodeId: null, line: null }

      const els = document.elementsFromPoint(e.clientX, e.clientY)
      for (const el of els) {
        if (el.classList.contains('net-port-in')) {
          const targetNode = (el as Element).closest('.net-node') as HTMLElement | null
          const targetId = targetNode?.getAttribute('data-node-id')
          if (targetId && targetId !== sourceNodeId) {
            onAddEdge(sourceNodeId, targetId)
          }
          break
        }
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [onAddEdge])

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-net-layer')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const layerType = e.dataTransfer.getData('application/x-net-layer')
    if (layerType) onDropLayer(layerType)
  }

  return (
    <div
      className="network-canvas-container"
      ref={containerRef}
      onMouseDown={handlePortMouseDown}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <svg ref={svgRef} />
    </div>
  )
}
