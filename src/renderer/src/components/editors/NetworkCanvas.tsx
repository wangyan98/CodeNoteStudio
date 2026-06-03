import { useRef, useEffect, useCallback, useState } from 'react'
import * as d3 from 'd3'
import dagre from 'dagre'
import type { NetworkDocument, GraphNode, GraphEdge } from '../../../../main/schemas/note-types'
import type { LayerDef } from '../../../../main/schemas/layer-catalog'
import './NetworkCanvas.css'

interface NetworkCanvasProps {
  doc: NetworkDocument
  catalog: Record<string, LayerDef>
  selectedNodeId: string | null
  selectedEdgeId: string | null
  onSelectNode: (nodeId: string | null) => void
  onSelectEdge: (edgeId: string | null) => void
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

function runLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  nodeSizes?: Map<string, { width: number; height: number }>
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 40, edgesep: 20, ranksep: 60, marginx: 40, marginy: 30 })
  g.setDefaultEdgeLabel(() => ({}))

  for (const n of nodes) {
    const override = nodeSizes?.get(n.id)
    const w = override?.width
      ?? (n.kind === 'input' || n.kind === 'output' ? INPUT_W
        : n.kind === 'block' ? BLOCK_MIN_W : NODE_W)
    const h = override?.height
      ?? (n.kind === 'input' || n.kind === 'output' ? INPUT_H
        : n.kind === 'block' ? NODE_H + BLOCK_HEADER_H : NODE_H)
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
  doc, catalog, selectedNodeId, selectedEdgeId,
  onSelectNode, onSelectEdge, onDropLayer, onDeleteNode, onAddEdge
}: NetworkCanvasProps) {

  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragConnectRef = useRef<{
    active: boolean
    sourceNodeId: string | null
    line: d3.Selection<SVGLineElement, unknown, null, undefined> | null
    cleanup: (() => void) | null
  }>({ active: false, sourceNodeId: null, line: null, cleanup: null })

  // Cleanup drag listeners on unmount
  useEffect(() => {
    return () => {
      const state = dragConnectRef.current
      if (state.active && state.cleanup) {
        state.cleanup()
        state.line?.remove()
      }
    }
  }, [])

  const [dims, setDims] = useState({ w: 0, h: 0 })

  // Keep SVG dimensions in sync with container, re-render when size changes
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const update = () => setDims({ w: container.clientWidth, h: container.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const render = useCallback(() => {
    const svg = d3.select(svgRef.current)
    const container = containerRef.current
    if (!container) return

    const W = dims.w || container.clientWidth || 800
    const H = dims.h || container.clientHeight || 500
    svg.attr('width', W).attr('height', H)
    svg.selectAll('*').remove()

    // Separate top-level nodes/edges from block children/internal edges
    const topNodes = doc.nodes ?? []
    const topEdges = doc.edges ?? []

    // For each block with children, run sub-layout and compute block dimensions
    type BlockLayout = {
      positions: Map<string, { x: number; y: number }>
      width: number
      height: number
      childOffsetX: number
      childOffsetY: number
    }
    const blockLayouts = new Map<string, BlockLayout>()
    const BLOCK_PAD = 20
    const BLOCK_BOTTOM_PAD = 14

    for (const node of topNodes) {
      if (node.kind === 'block' && node.children && node.children.length > 0) {
        const children = node.children
        const internalEdges = node.internalEdges ?? []
        const childPositions = runLayout(children, internalEdges)

        // Compute bounding box of children (positions are node centers)
        let cMinX = Infinity, cMaxX = -Infinity, cMinY = Infinity, cMaxY = -Infinity
        for (const cp of childPositions.values()) {
          cMinX = Math.min(cMinX, cp.x - NODE_W / 2)
          cMaxX = Math.max(cMaxX, cp.x + NODE_W / 2)
          cMinY = Math.min(cMinY, cp.y - NODE_H / 2)
          cMaxY = Math.max(cMaxY, cp.y + NODE_H / 2)
        }
        if (!isFinite(cMinX)) {
          cMinX = -NODE_W / 2; cMaxX = NODE_W / 2
          cMinY = -NODE_H / 2; cMaxY = NODE_H / 2
        }

        const contentW = cMaxX - cMinX
        const contentH = cMaxY - cMinY
        const bw = Math.max(BLOCK_MIN_W, contentW + BLOCK_PAD * 2)
        const bh = BLOCK_HEADER_H + contentH + BLOCK_PAD + BLOCK_BOTTOM_PAD

        blockLayouts.set(node.id, {
          positions: childPositions,
          width: bw,
          height: bh,
          childOffsetX: BLOCK_PAD - cMinX,
          childOffsetY: BLOCK_HEADER_H + BLOCK_PAD - cMinY,
        })
      }
    }

    // Build node size overrides from block layouts for the top-level layout
    const nodeSizes = new Map<string, { width: number; height: number }>()
    for (const [id, bl] of blockLayouts) {
      nodeSizes.set(id, { width: bl.width, height: bl.height })
    }

    // Run main layout with actual block sizes
    const positions = runLayout(topNodes, topEdges, nodeSizes)

    // Compute bounding box for centering
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    const DEFAULT_BLOCK_H = NODE_H + BLOCK_HEADER_H
    for (const [id, p] of positions) {
      const node = topNodes.find(n => n.id === id)
      let nw = node?.kind === 'input' || node?.kind === 'output' ? INPUT_W : NODE_W
      let nh = node?.kind === 'input' || node?.kind === 'output' ? INPUT_H : NODE_H
      if (node?.kind === 'block') {
        const bl = blockLayouts.get(id)
        nw = bl?.width ?? BLOCK_MIN_W
        nh = bl?.height ?? DEFAULT_BLOCK_H
      }
      minX = Math.min(minX, p.x - nw / 2)
      maxX = Math.max(maxX, p.x + nw / 2)
      minY = Math.min(minY, p.y - nh / 2)
      maxY = Math.max(maxY, p.y + nh / 2)
    }
    const pad = 40
    const contentW = maxX - minX + pad * 2
    const contentH = maxY - minY + pad * 2
    const offsetX = pad - minX
    const offsetY = pad - minY

    const g = svg.append('g').attr('class', 'canvas-content')

    // Auto-fit: scale content to fit available space
    const fitScale = Math.min(1, W / contentW, H / contentH)

    // Zoom (don't start on port dots — those are for drag-connect)
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .filter((event) => {
        const target = event.target as Element
        return !target.classList.contains('net-port-out') && !target.classList.contains('net-port-in')
      })
      .on('zoom', (event) => { g.attr('transform', event.transform.toString()) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    svg.call(zoom as any)

    // Apply initial fit transform (centered in viewport)
    const initTx = (W - contentW * fitScale) / 2
    const initTy = (H - contentH * fitScale) / 2
    svg.call(zoom.transform as any, d3.zoomIdentity.translate(initTx, initTy).scale(fitScale))

    // Helper to render a single edge (used for both top-level and internal edges)
    const renderEdge = (
      edge: GraphEdge,
      srcPos: { x: number; y: number },
      tgtPos: { x: number; y: number },
      srcW: number,
      srcH: number,
      tgtW: number,
      tgtH: number,
      parentG: d3.Selection<SVGGElement, unknown, null, undefined>
    ) => {
      const x1 = srcPos.x
      const y1 = srcPos.y + srcH / 2
      const x2 = tgtPos.x
      const y2 = tgtPos.y - tgtH / 2
      const isSelected = edge.id === selectedEdgeId
      const strokeColor = isSelected ? '#4a90d9' : '#888'
      const skipColor = isSelected ? '#4a90d9' : '#34a853'
      const strokeW = isSelected ? 2.5 : 1.5

      const edgeG = parentG.append('g')
        .attr('class', 'net-edge')
        .attr('data-edge-id', edge.id)
        .style('cursor', 'pointer')

      if (edge.style === 'skip') {
        const my = (y1 + y2) / 2
        const dx = Math.abs(x2 - x1) * 0.5
        const path = d3.path()
        path.moveTo(x1, y1)
        path.bezierCurveTo(x1 - dx, my, x2 - dx, my, x2, y2)
        edgeG.append('path')
          .attr('d', path.toString())
          .attr('fill', 'none').attr('stroke', skipColor).attr('stroke-width', strokeW)
          .attr('stroke-dasharray', '4,3')
        edgeG.append('polygon')
          .attr('points', `${x2-4},${y2-6} ${x2},${y2} ${x2+4},${y2-6}`)
          .attr('fill', 'none').attr('stroke', skipColor).attr('stroke-width', strokeW)
      } else {
        // Wider invisible hit area for easier clicking
        edgeG.append('line')
          .attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2)
          .attr('stroke', 'transparent').attr('stroke-width', 12)
          .style('cursor', 'pointer')
        edgeG.append('line')
          .attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2 - 4)
          .attr('stroke', strokeColor).attr('stroke-width', strokeW)
        edgeG.append('polygon')
          .attr('points', `${x2-4},${y2-4} ${x2},${y2} ${x2+4},${y2-4}`)
          .attr('fill', strokeColor)
      }

      if (edge.label) {
        edgeG.append('text')
          .attr('x', (x1 + x2) / 2).attr('y', y1 - 6)
          .attr('text-anchor', 'middle').attr('fill', skipColor).attr('font-size', '8px')
          .text(edge.label)
      }

      edgeG.on('click', (event: MouseEvent) => {
        event.stopPropagation()
        onSelectEdge(edge.id)
      })
    }

    // Helper to get actual rendered dimensions of a node (accounting for block expansion)
    const getNodeSize = (node: GraphNode | undefined): { w: number; h: number } => {
      if (!node) return { w: NODE_W, h: NODE_H }
      if (node.kind === 'input' || node.kind === 'output') return { w: INPUT_W, h: INPUT_H }
      if (node.kind === 'block') {
        const bl = blockLayouts.get(node.id)
        return bl ? { w: bl.width, h: bl.height } : { w: BLOCK_MIN_W, h: NODE_H + BLOCK_HEADER_H }
      }
      return { w: NODE_W, h: NODE_H }
    }

    // --- Render top-level edges (behind nodes) ---
    for (const edge of topEdges) {
      const srcPos = positions.get(edge.source)
      const tgtPos = positions.get(edge.target)
      if (!srcPos || !tgtPos) continue

      const srcNode = topNodes.find(n => n.id === edge.source)
      const tgtNode = topNodes.find(n => n.id === edge.target)
      const { w: srcW, h: srcH } = getNodeSize(srcNode)
      const { w: tgtW, h: tgtH } = getNodeSize(tgtNode)

      renderEdge(edge,
        { x: offsetX + srcPos.x, y: offsetY + srcPos.y },
        { x: offsetX + tgtPos.x, y: offsetY + tgtPos.y },
        srcW, srcH, tgtW, tgtH, g)
    }

    // --- Render nodes ---
    for (const node of topNodes) {
      const pos = positions.get(node.id)
      if (!pos) continue

      const isSelected = node.id === selectedNodeId
      let nw = NODE_W, nh = NODE_H, color = '#888', fill = '#2a2a2a'
      let blockLayout: BlockLayout | undefined

      if (node.kind === 'input' || node.kind === 'output') {
        nw = INPUT_W; nh = INPUT_H; color = '#666'; fill = '#f5f5f5'
      } else if (node.kind === 'layer' && node.layerType) {
        const def = catalog[node.layerType]
        color = def?.color ?? '#888'
        fill = (def?.color ?? '#888') + '22'
      } else if (node.kind === 'block') {
        blockLayout = blockLayouts.get(node.id)
        if (blockLayout) {
          nw = blockLayout.width
          nh = blockLayout.height
        } else {
          nw = BLOCK_MIN_W
          nh = NODE_H + BLOCK_HEADER_H
        }
        color = '#ff9800'; fill = 'none'
      }

      const nx = offsetX + pos.x - nw / 2
      const ny = offsetY + pos.y - nh / 2

      const nodeG = g.append('g')
        .attr('class', 'net-node')
        .attr('data-node-id', node.id)
        .style('cursor', 'pointer')

      if (node.kind === 'block') {
        // Block container — dashed border
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

        // Render children inside block
        if (blockLayout && node.children) {
          const childOffsetX = nx + blockLayout.childOffsetX
          const childOffsetY = ny + blockLayout.childOffsetY

          // Internal edges first
          for (const ie of (node.internalEdges ?? [])) {
            const cpSrc = blockLayout.positions.get(ie.source)
            const cpTgt = blockLayout.positions.get(ie.target)
            if (!cpSrc || !cpTgt) continue
            const cSrcNode = node.children.find(c => c.id === ie.source)
            const cTgtNode = node.children.find(c => c.id === ie.target)
            const cSrcW = cSrcNode?.kind === 'input' || cSrcNode?.kind === 'output' ? INPUT_W : NODE_W
            const cSrcH = cSrcNode?.kind === 'input' || cSrcNode?.kind === 'output' ? INPUT_H : NODE_H
            const cTgtW = cTgtNode?.kind === 'input' || cTgtNode?.kind === 'output' ? INPUT_W : NODE_W
            const cTgtH = cTgtNode?.kind === 'input' || cTgtNode?.kind === 'output' ? INPUT_H : NODE_H
            renderEdge(ie,
              { x: childOffsetX + cpSrc.x, y: childOffsetY + cpSrc.y },
              { x: childOffsetX + cpTgt.x, y: childOffsetY + cpTgt.y },
              cSrcW, cSrcH, cTgtW, cTgtH, nodeG)
          }

          // Children
          for (const child of node.children) {
            const cp = blockLayout.positions.get(child.id)
            if (!cp) continue
            const cx = childOffsetX + cp.x - NODE_W / 2
            const cy = childOffsetY + cp.y - NODE_H / 2
            const childIsSelected = child.id === selectedNodeId
            let cc = '#888', cf = '#2a2a2a'
            if (child.layerType) {
              const def = catalog[child.layerType]
              cc = def?.color ?? '#888'
              cf = (def?.color ?? '#888') + '22'
            }

            const childG = nodeG.append('g')
              .attr('class', 'net-node')
              .attr('data-node-id', child.id)
              .style('cursor', 'pointer')

            childG.append('rect')
              .attr('x', cx).attr('y', cy).attr('width', NODE_W).attr('height', NODE_H)
              .attr('rx', 6).attr('fill', cf)
              .attr('stroke', childIsSelected ? '#4a90d9' : cc)
              .attr('stroke-width', childIsSelected ? 2.5 : 1.5)
            childG.append('text')
              .attr('x', cx + NODE_W / 2).attr('y', cy + NODE_H / 2 + 4)
              .attr('text-anchor', 'middle').attr('fill', '#d4d4d4')
              .attr('font-size', '10px').attr('font-weight', 'bold')
              .text(child.label)
            if (child.codeMapping) {
              childG.append('circle')
                .attr('cx', cx + NODE_W - 8).attr('cy', cy + 8).attr('r', 3)
                .attr('fill', '#4a90d9')
            }

            childG.on('click', (event: MouseEvent) => {
              event.stopPropagation()
              onSelectNode(child.id)
            })

            // Child output port (unless block — block uses its own outer ports)
            if (child.kind !== 'output') {
              childG.append('circle')
                .attr('class', 'net-port-out')
                .attr('cx', cx + NODE_W / 2)
                .attr('cy', cy + NODE_H)
                .attr('r', 5)
                .attr('fill', cc)
                .attr('stroke', '#333')
                .attr('stroke-width', 0.5)
                .attr('opacity', 0.5)
                .style('cursor', 'crosshair')
                .on('mouseenter', function () { d3.select(this).attr('opacity', 1).attr('r', 7) })
                .on('mouseleave', function () { d3.select(this).attr('opacity', 0.5).attr('r', 5) })
            }
            if (child.kind !== 'input') {
              childG.append('circle')
                .attr('class', 'net-port-in')
                .attr('cx', cx + NODE_W / 2)
                .attr('cy', cy)
                .attr('r', 5)
                .attr('fill', cc)
                .attr('stroke', '#333')
                .attr('stroke-width', 0.5)
                .attr('opacity', 0.5)
                .style('cursor', 'crosshair')
                .on('mouseenter', function () { d3.select(this).attr('opacity', 1).attr('r', 7) })
                .on('mouseleave', function () { d3.select(this).attr('opacity', 0.5).attr('r', 5) })
            }
          }
        }
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

      // Output port — bottom center of block (only for non-output nodes)
      if (node.kind !== 'output') {
        nodeG.append('circle')
          .attr('class', 'net-port-out')
          .attr('cx', nx + nw / 2)
          .attr('cy', ny + nh)
          .attr('r', 6)
          .attr('fill', color)
          .attr('stroke', '#333')
          .attr('stroke-width', 0.5)
          .attr('opacity', 0.5)
          .style('cursor', 'crosshair')
          .on('mouseenter', function () { d3.select(this).attr('opacity', 1).attr('r', 8) })
          .on('mouseleave', function () { d3.select(this).attr('opacity', 0.5).attr('r', 6) })
      }

      // Input port — top center of block (only for non-input nodes)
      if (node.kind !== 'input') {
        nodeG.append('circle')
          .attr('class', 'net-port-in')
          .attr('cx', nx + nw / 2)
          .attr('cy', ny)
          .attr('r', 6)
          .attr('fill', color)
          .attr('stroke', '#333')
          .attr('stroke-width', 0.5)
          .attr('opacity', 0.5)
          .style('cursor', 'crosshair')
          .on('mouseenter', function () { d3.select(this).attr('opacity', 1).attr('r', 8) })
          .on('mouseleave', function () { d3.select(this).attr('opacity', 0.5).attr('r', 6) })
      }
    }

    // Background click to deselect
    svg.on('click', () => { onSelectNode(null) })

  }, [doc, catalog, selectedNodeId, selectedEdgeId, onSelectNode, onSelectEdge, dims])

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

    dragConnectRef.current = { active: true, sourceNodeId, line, cleanup: null }

    const handleMouseMove = (e: MouseEvent) => {
      const t = d3.zoomTransform(svgEl)
      const mx = (e.clientX - rect.left - t.x) / t.k
      const my = (e.clientY - rect.top - t.y) / t.k
      line.attr('x2', mx).attr('y2', my)
    }

    const handleMouseUp = (e: MouseEvent) => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      line.remove()
      dragConnectRef.current = { active: false, sourceNodeId: null, line: null, cleanup: null }

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

    const cleanup = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
    dragConnectRef.current.cleanup = cleanup

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
