import { useRef, useEffect, useCallback, useState } from 'react'
import * as d3 from 'd3'
import dagre from 'dagre'
import type { NetworkDocument, GraphNode, GraphEdge, BlockDirection } from '../../../../main/schemas/note-types'
import type { LayerDef } from '../../../../main/schemas/layer-catalog'
import { LocateButton } from './LocateButton'
import './NetworkCanvas.css'

interface NetworkCanvasProps {
  doc: NetworkDocument
  catalog: Record<string, LayerDef>
  selectedNodeId?: string | null
  selectedEdgeId?: string | null
  onSelectNode?: (nodeId: string | null) => void
  onSelectEdge?: (edgeId: string | null) => void
  onDropLayer?: (layerType: string) => void
  onDeleteNode?: (nodeId: string) => void
  onAddEdge?: (source: string, target: string) => void
  onNavigateToCode?: (filePath: string, line: number) => void
  readOnly?: boolean
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
  nodeSizes?: Map<string, { width: number; height: number }>,
  direction: BlockDirection = 'vertical'
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph()
  g.setGraph({
    rankdir: direction === 'horizontal' ? 'LR' : 'TB',
    nodesep: 40, edgesep: 20, ranksep: 60, marginx: 40, marginy: 30
  })
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

function autoDetectDirection(
  internalEdges?: GraphEdge[]
): BlockDirection {
  const outDegree = new Map<string, number>()
  for (const e of (internalEdges ?? [])) {
    outDegree.set(e.source, (outDegree.get(e.source) ?? 0) + 1)
  }
  for (const [, count] of outDegree) {
    if (count >= 2) return 'horizontal'
  }
  return 'vertical'
}

export function NetworkCanvas({
  doc, catalog, selectedNodeId, selectedEdgeId,
  onSelectNode, onSelectEdge, onDropLayer, onDeleteNode, onAddEdge,
  onNavigateToCode, readOnly
}: NetworkCanvasProps) {

  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const clickTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const dragConnectRef = useRef<{
    active: boolean
    sourceNodeId: string | null
    line: d3.Selection<SVGLineElement, unknown, null, undefined> | null
    cleanup: (() => void) | null
  }>({ active: false, sourceNodeId: null, line: null, cleanup: null })

  const fitTransformRef = useRef<{ x: number; y: number; k: number }>({ x: 0, y: 0, k: 1 })
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)

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

    // Preserve user zoom/pan across re-renders triggered by node selection etc.
    const prevTransform = svgRef.current ? d3.zoomTransform(svgRef.current) : d3.zoomIdentity
    const hasUserView = prevTransform.k !== 1 || prevTransform.x !== 0 || prevTransform.y !== 0

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
      direction: BlockDirection
    }
    const blockLayouts = new Map<string, BlockLayout>()
    const BLOCK_PAD = 20
    const BLOCK_BOTTOM_PAD = 14

    for (const node of topNodes) {
      if (node.kind === 'block' && node.children && node.children.length > 0) {
        const children = node.children
        const internalEdges = node.internalEdges ?? []
        const blockDirection = node.direction ?? autoDetectDirection(internalEdges)
        const childPositions = runLayout(children, internalEdges, undefined, blockDirection)

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
        const padX = blockDirection === 'horizontal' ? BLOCK_PAD * 2 : BLOCK_PAD
        const padY = blockDirection === 'vertical' ? BLOCK_PAD * 2 : BLOCK_PAD
        const bw = Math.max(BLOCK_MIN_W, contentW + padX * 2)
        const bh = BLOCK_HEADER_H + contentH + padY + BLOCK_BOTTOM_PAD

        blockLayouts.set(node.id, {
          positions: childPositions,
          width: bw,
          height: bh,
          childOffsetX: padX - cMinX,
          childOffsetY: BLOCK_HEADER_H + padY - cMinY,
          direction: blockDirection,
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

    // Pre-build set of valid drag-connect target IDs (exclude input/output)
    const validDragTargetIds = new Set<string>()
    for (const node of topNodes) {
      if (node.kind !== 'input' && node.kind !== 'output') {
        validDragTargetIds.add(node.id)
      }
      if (node.children) {
        for (const child of node.children) {
          if (child.kind !== 'input' && child.kind !== 'output') {
            validDragTargetIds.add(child.id)
          }
        }
      }
    }

    // Auto-fit: scale content to fit available space
    const fitScale = Math.min(1, W / contentW, H / contentH)

    // Zoom (don't start on port dots — those are for drag-connect)
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .filter((event) => {
        const target = event.target as Element
        if (target.classList.contains('net-port-out') || target.classList.contains('net-port-in')) return false
        // Don't start zoom from layer/block nodes (those are draggable)
        if (!readOnly && target.closest('.net-node')) return false
        return true
      })
      .on('zoom', (event) => { g.attr('transform', event.transform.toString()) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    svg.call(zoom as any)
    zoomRef.current = zoom

    // Preserve user zoom/pan across re-renders, otherwise use fit-to-content
    const initTx = (W - contentW * fitScale) / 2
    const initTy = (H - contentH * fitScale) / 2
    fitTransformRef.current = { x: initTx, y: initTy, k: fitScale }
    if (hasUserView && prevTransform.k >= 0.3 && prevTransform.k <= 3) {
      svg.call(zoom.transform as any, prevTransform)
    } else {
      svg.call(zoom.transform as any, d3.zoomIdentity.translate(initTx, initTy).scale(fitScale))
    }

    // Compute port XY on a node boundary for a given direction
    const getPortXY = (
      cx: number, cy: number,
      w: number, h: number,
      idx: number, total: number,
      edge: 'in' | 'out',
      direction: BlockDirection
    ): { x: number; y: number } => {
      if (direction === 'horizontal') {
        // Ports on left (in) or right (out), spread vertically
        const py = total > 1
          ? cy - h / 2 + 12 + (h - 24) * (idx + 0.5) / total
          : cy
        const px = edge === 'in' ? cx - w / 2 : cx + w / 2
        return { x: px, y: py }
      }
      // Vertical: ports on top (in) or bottom (out), spread horizontally
      const px = total > 1
        ? cx - w / 2 + 12 + (w - 24) * (idx + 0.5) / total
        : cx
      const py = edge === 'in' ? cy - h / 2 : cy + h / 2
      return { x: px, y: py }
    }

    // Helper to render a single edge (used for both top-level and internal edges)
    const renderEdge = (
      edge: GraphEdge,
      srcPos: { x: number; y: number },
      tgtPos: { x: number; y: number },
      srcW: number,
      srcH: number,
      tgtW: number,
      tgtH: number,
      parentG: d3.Selection<SVGGElement, unknown, null, undefined>,
      srcPortIdx = 0,
      srcPortTotal = 1,
      tgtPortIdx = 0,
      tgtPortTotal = 1,
      srcDirection?: BlockDirection,
      tgtDirection?: BlockDirection
    ) => {
      const srcDir = srcDirection ?? 'vertical'
      const tgtDir = tgtDirection ?? 'vertical'
      const srcPort = getPortXY(srcPos.x, srcPos.y, srcW, srcH, srcPortIdx, srcPortTotal, 'out', srcDir)
      const tgtPort = getPortXY(tgtPos.x, tgtPos.y, tgtW, tgtH, tgtPortIdx, tgtPortTotal, 'in', tgtDir)
      const { x: x1, y: y1 } = srcPort
      const { x: x2, y: y2 } = tgtPort
      const isSelected = edge.id === selectedEdgeId
      const strokeColor = isSelected ? '#4a90d9' : '#888'
      const skipColor = isSelected ? '#4a90d9' : '#34a853'
      const strokeW = isSelected ? 2.5 : 1.5

      const edgeG = parentG.append('g')
        .attr('class', 'net-edge')
        .attr('data-edge-id', edge.id)
        .style('cursor', 'pointer')

      if (edge.style === 'skip') {
        const ortho = makeOrthogonalPath(x1, y1, x2, y2, srcDir ?? 'vertical')

        // Invisible polyline for wider hit area
        edgeG.append('polyline')
          .attr('points', ortho.points)
          .attr('stroke', 'transparent').attr('stroke-width', 12).attr('fill', 'none')
          .style('cursor', 'pointer')

        // Visible dashed polyline
        edgeG.append('polyline')
          .attr('points', ortho.points)
          .attr('stroke', skipColor).attr('stroke-width', strokeW)
          .attr('stroke-dasharray', '4,3').attr('fill', 'none')

        // Arrow at end — direction-aware
        const arrowPoints = (tgtDir ?? 'vertical') === 'horizontal'
          ? `${x2-4},${y2-4} ${x2},${y2} ${x2-4},${y2+4}`
          : `${x2-4},${y2-4} ${x2},${y2} ${x2+4},${y2-4}`
        edgeG.append('polygon')
          .attr('points', arrowPoints)
          .attr('fill', skipColor)
      } else {
        // Wider invisible hit area for easier clicking
        edgeG.append('line')
          .attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2)
          .attr('stroke', 'transparent').attr('stroke-width', 12)
          .style('cursor', 'pointer')
        edgeG.append('line')
          .attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2 - 4)
          .attr('stroke', strokeColor).attr('stroke-width', strokeW)
        const arrowPoints = (tgtDir ?? 'vertical') === 'horizontal'
          ? `${x2-4},${y2-4} ${x2},${y2} ${x2-4},${y2+4}`
          : `${x2-4},${y2-4} ${x2},${y2} ${x2+4},${y2-4}`
        edgeG.append('polygon')
          .attr('points', arrowPoints)
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
        onSelectEdge?.(edge.id)
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

    // Generate orthogonal path points for inter-block skip edges
    const makeOrthogonalPath = (
      x1: number, y1: number,
      x2: number, y2: number,
      srcDir: BlockDirection
    ): { points: string } => {
      const midY = (y1 + y2) / 2
      const points: Array<[number, number]> = [[x1, y1]]

      if (srcDir === 'horizontal') {
        // Source in horizontal block: go right → down → across → into target
        const bendX = x1 + 30
        points.push([bendX, y1])
        points.push([bendX, midY])
        points.push([x2, midY])
      } else {
        // Source in vertical block: go down → across → down into target
        const bendY = y1 + 30
        points.push([x1, bendY])
        points.push([x1 + (x2 - x1) / 2, bendY])
        points.push([x1 + (x2 - x1) / 2, y2])
      }
      points.push([x2, y2])
      return { points: points.map(p => p.join(',')).join(' ') }
    }

    // --- Render top-level edges (behind nodes) ---
    // Compute which nodes get a merge bar (3+ incoming edges)
    const mergeBarNodes = new Map<string, { count: number }>()
    for (const edge of topEdges) {
      let entry = mergeBarNodes.get(edge.target)
      if (!entry) {
        entry = { count: 0 }
        mergeBarNodes.set(edge.target, entry)
      }
      entry.count++
    }

    // Count outgoing/incoming ports per node for multi-edge distribution
    const outDegree = new Map<string, number>()
    const inDegree = new Map<string, number>()
    for (const edge of topEdges) {
      outDegree.set(edge.source, (outDegree.get(edge.source) ?? 0) + 1)
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
    }
    const outIdx = new Map<string, number>()
    const inIdx = new Map<string, number>()

    for (const edge of topEdges) {
      const srcPos = positions.get(edge.source)
      const tgtPos = positions.get(edge.target)
      if (!srcPos || !tgtPos) continue

      const srcNode = topNodes.find(n => n.id === edge.source)
      const tgtNode = topNodes.find(n => n.id === edge.target)
      const { w: srcW, h: srcH } = getNodeSize(srcNode)
      const { w: tgtW, h: tgtH } = getNodeSize(tgtNode)

      const si = outIdx.get(edge.source) ?? 0
      outIdx.set(edge.source, si + 1)
      const ti = inIdx.get(edge.target) ?? 0
      inIdx.set(edge.target, ti + 1)

      // Determine direction for top-level source/target nodes
      const srcDir = srcNode?.kind === 'block'
        ? (srcNode.direction ?? blockLayouts.get(edge.source)?.direction ?? 'vertical')
        : 'vertical'
      const tgtDir = tgtNode?.kind === 'block'
        ? (tgtNode.direction ?? blockLayouts.get(edge.target)?.direction ?? 'vertical')
        : 'vertical'

      // If target node has a merge bar, edge hits the bar, not the node
      let targetPosY = offsetY + tgtPos.y
      const mergeInfo = mergeBarNodes.get(edge.target)
      if (mergeInfo && mergeInfo.count >= 3) {
        const barGap = 20
        const barH = 10
        targetPosY = offsetY + tgtPos.y - barGap - barH / 2
      }

      renderEdge(edge,
        { x: offsetX + srcPos.x, y: offsetY + srcPos.y },
        { x: offsetX + tgtPos.x, y: targetPosY },
        srcW, srcH, tgtW, tgtH, g,
        si, outDegree.get(edge.source) ?? 1,
        ti, inDegree.get(edge.target) ?? 1,
        srcDir, tgtDir)
    }

    // --- Render nodes ---
    for (const node of topNodes) {
      const pos = positions.get(node.id)
      if (!pos) continue

      // Render merge bar if this node has 3+ incoming edges
      const mergeInfo = mergeBarNodes.get(node.id)
      if (mergeInfo && mergeInfo.count >= 3) {
        const nodeSize = getNodeSize(node)
        const barW = nodeSize.w
        const barH = 10
        const barGap = 20
        const nTop = offsetY + pos.y - nodeSize.h / 2
        const barX = offsetX + pos.x - barW / 2
        const barY = nTop - barGap - barH

        const barG = g.append('g').attr('class', 'net-merge-bar')

        // Bar rectangle
        barG.append('rect')
          .attr('x', barX).attr('y', barY).attr('width', barW).attr('height', barH)
          .attr('rx', 5).attr('fill', '#ffeb3b').attr('opacity', 0.3)
          .attr('stroke', '#ffeb3b').attr('stroke-width', 0.5)

        // Port dots on bar (one per incoming edge, evenly spaced)
        const portCount = mergeInfo.count
        for (let i = 0; i < portCount; i++) {
          const px = portCount > 1
            ? barX + 6 + (barW - 12) * (i + 0.5) / portCount
            : barX + barW / 2
          barG.append('circle')
            .attr('cx', px).attr('cy', barY + barH / 2)
            .attr('r', 3).attr('fill', '#4a90d9').attr('stroke', '#333').attr('stroke-width', 0.5)
        }

        // Single thick edge from bar center down to node top
        barG.append('line')
          .attr('x1', barX + barW / 2).attr('y1', barY + barH)
          .attr('x2', offsetX + pos.x).attr('y2', nTop)
          .attr('stroke', '#673ab7').attr('stroke-width', 2)
        barG.append('polygon')
          .attr('points', `${offsetX + pos.x - 4},${nTop - 4} ${offsetX + pos.x},${nTop} ${offsetX + pos.x + 4},${nTop - 4}`)
          .attr('fill', '#673ab7')
      }

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
        .attr('data-node-kind', node.kind)
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

          // Internal edges first — count ports for multi-edge distribution
          const intEdges = node.internalEdges ?? []
          const intOutDeg = new Map<string, number>()
          const intInDeg = new Map<string, number>()
          for (const ie of intEdges) {
            intOutDeg.set(ie.source, (intOutDeg.get(ie.source) ?? 0) + 1)
            intInDeg.set(ie.target, (intInDeg.get(ie.target) ?? 0) + 1)
          }
          const intOutIdx = new Map<string, number>()
          const intInIdx = new Map<string, number>()

          for (const ie of intEdges) {
            const cpSrc = blockLayout.positions.get(ie.source)
            const cpTgt = blockLayout.positions.get(ie.target)
            if (!cpSrc || !cpTgt) continue
            const cSrcNode = node.children.find(c => c.id === ie.source)
            const cTgtNode = node.children.find(c => c.id === ie.target)
            const cSrcW = cSrcNode?.kind === 'input' || cSrcNode?.kind === 'output' ? INPUT_W : NODE_W
            const cSrcH = cSrcNode?.kind === 'input' || cSrcNode?.kind === 'output' ? INPUT_H : NODE_H
            const cTgtW = cTgtNode?.kind === 'input' || cTgtNode?.kind === 'output' ? INPUT_W : NODE_W
            const cTgtH = cTgtNode?.kind === 'input' || cTgtNode?.kind === 'output' ? INPUT_H : NODE_H

            const si = intOutIdx.get(ie.source) ?? 0
            intOutIdx.set(ie.source, si + 1)
            const ti = intInIdx.get(ie.target) ?? 0
            intInIdx.set(ie.target, ti + 1)

            renderEdge(ie,
              { x: childOffsetX + cpSrc.x, y: childOffsetY + cpSrc.y },
              { x: childOffsetX + cpTgt.x, y: childOffsetY + cpTgt.y },
              cSrcW, cSrcH, cTgtW, cTgtH, nodeG,
              si, intOutDeg.get(ie.source) ?? 1,
              ti, intInDeg.get(ie.target) ?? 1,
              blockLayout.direction, blockLayout.direction)
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
              .attr('data-node-kind', child.kind)
              .style('cursor', 'pointer')

            if (child.inputShape) {
              childG.append('text')
                .attr('x', cx + NODE_W / 2).attr('y', cy - 4)
                .attr('text-anchor', 'middle').attr('fill', '#888')
                .attr('font-size', '9px')
                .text(child.inputShape)
            }
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
            if (child.outputShape) {
              childG.append('text')
                .attr('x', cx + NODE_W / 2).attr('y', cy + NODE_H + 12)
                .attr('text-anchor', 'middle').attr('fill', '#bbb')
                .attr('font-size', '9px')
                .text(child.outputShape)
            }
            if (child.codeMapping && onNavigateToCode && child.codeMapping.filePath) {
              childG.append('text')
                .attr('x', cx + NODE_W - 14).attr('y', cy + NODE_H / 2 + 4)
                .attr('fill', '#4a90d9').attr('font-size', '14px')
                .attr('font-weight', 'bold')
                .style('cursor', 'pointer')
                .text('→')
                .on('click', (event: MouseEvent) => {
                  event.stopPropagation()
                  onNavigateToCode(child.codeMapping!.filePath, child.codeMapping!.startLine)
                })
            }

            if (!readOnly) {
              childG.on('click', (event: MouseEvent) => {
                event.stopPropagation()
                if (clickTimersRef.current.has(child.id)) return
                const timer = setTimeout(() => {
                  onSelectNode?.(child.id)
                  clickTimersRef.current.delete(child.id)
                }, 250)
                clickTimersRef.current.set(child.id, timer)
              })
            }

            childG.on('dblclick', (event: MouseEvent) => {
              event.stopPropagation()
              if (!readOnly) {
                const timer = clickTimersRef.current.get(child.id)
                if (timer) { clearTimeout(timer); clickTimersRef.current.delete(child.id) }
              }
              if (child.codeMapping && onNavigateToCode && child.codeMapping.filePath) {
                onNavigateToCode(child.codeMapping.filePath, child.codeMapping.startLine)
              } else if (!readOnly) {
                onSelectNode?.(child.id)
              }
            })

            // Drag-to-connect for child nodes inside blocks
            if (!readOnly && child.kind !== 'input' && child.kind !== 'output') {
              const childDrag = d3.drag<SVGGElement, unknown>()
                .on('start', function (event: d3.D3DragEvent<SVGGElement, unknown, unknown>) {
                  d3.select(this).raise()
                  d3.select(this).select('rect').attr('stroke', '#ff0').attr('stroke-width', 2.5)
                  const transform = d3.zoomTransform(svgEl!)
                  const r = container.getBoundingClientRect()
                  const sx = (event.sourceEvent.clientX - r.left - transform.x) / transform.k
                  const sy = (event.sourceEvent.clientY - r.top - transform.y) / transform.k
                  g.append('line')
                    .attr('class', 'net-drag-line')
                    .attr('x1', sx).attr('y1', sy)
                    .attr('x2', sx).attr('y2', sy)
                    .attr('stroke', '#4a90d9').attr('stroke-width', 2)
                    .attr('stroke-dasharray', '4,2')
                })
                .on('drag', function (event: d3.D3DragEvent<SVGGElement, unknown, unknown>) {
                  const transform = d3.zoomTransform(svgEl!)
                  const r = container.getBoundingClientRect()
                  const mx = (event.sourceEvent.clientX - r.left - transform.x) / transform.k
                  const my = (event.sourceEvent.clientY - r.top - transform.y) / transform.k
                  svgEl!.querySelector('.net-drag-line')?.setAttribute('x2', String(mx))
                  svgEl!.querySelector('.net-drag-line')?.setAttribute('y2', String(my))
                  // Detect target
                  const els = document.elementsFromPoint(event.sourceEvent.clientX, event.sourceEvent.clientY)
                  svgEl!.querySelectorAll('.net-drag-target').forEach(el => {
                    el.classList.remove('net-drag-target')
                    const r2 = (el as SVGGElement).querySelector('rect')
                    if (r2) {
                      const os = r2.getAttribute('data-orig-stroke')
                      const ow = r2.getAttribute('data-orig-stroke-width')
                      if (os) r2.setAttribute('stroke', os)
                      if (ow) r2.setAttribute('stroke-width', ow)
                    }
                  })
                  for (const el of els) {
                    const nodeEl = (el as Element).closest?.('.net-node') as HTMLElement | null
                    if (!nodeEl) continue
                    const tid = nodeEl.getAttribute('data-node-id')
                    if (!tid || tid === child.id || !validDragTargetIds.has(tid)) continue
                    nodeEl.classList.add('net-drag-target')
                    const tr = nodeEl.querySelector('rect')
                    if (tr) {
                      tr.setAttribute('data-orig-stroke', tr.getAttribute('stroke') || '#888')
                      tr.setAttribute('data-orig-stroke-width', tr.getAttribute('stroke-width') || '1.5')
                      tr.setAttribute('stroke', '#ff0')
                      tr.setAttribute('stroke-width', '2.5')
                    }
                    break
                  }
                })
                .on('end', function (event: d3.D3DragEvent<SVGGElement, unknown, unknown>) {
                  svgEl!.querySelector('.net-drag-line')?.remove()
                  const isSel = child.id === selectedNodeId
                  d3.select(this).select('rect')
                    .attr('stroke', isSel ? '#4a90d9' : cc)
                    .attr('stroke-width', isSel ? 2.5 : 1.5)
                  svgEl!.querySelectorAll('.net-drag-target').forEach(el => {
                    el.classList.remove('net-drag-target')
                    const r2 = (el as SVGGElement).querySelector('rect')
                    if (r2) {
                      const os = r2.getAttribute('data-orig-stroke')
                      const ow = r2.getAttribute('data-orig-stroke-width')
                      if (os) r2.setAttribute('stroke', os)
                      if (ow) r2.setAttribute('stroke-width', ow)
                    }
                  })
                  const els = document.elementsFromPoint(event.sourceEvent.clientX, event.sourceEvent.clientY)
                  for (const el of els) {
                    const nodeEl = (el as Element).closest?.('.net-node') as HTMLElement | null
                    if (!nodeEl) continue
                    const tid = nodeEl.getAttribute('data-node-id')
                    if (!tid || tid === child.id || !validDragTargetIds.has(tid)) continue
                    onAddEdge?.(child.id, tid)
                    break
                  }
                })
              childG.call(childDrag as any)
            }

            // Child ports — direction-aware positioning
            const isH = blockLayout.direction === 'horizontal'
            // Child output port (unless block — block uses its own outer ports)
            if (!readOnly && child.kind !== 'output') {
              childG.append('circle')
                .attr('class', 'net-port-out')
                .attr('cx', isH ? cx + NODE_W : cx + NODE_W / 2)
                .attr('cy', isH ? cy + NODE_H / 2 : cy + NODE_H)
                .attr('r', 5)
                .attr('fill', cc)
                .attr('stroke', '#333')
                .attr('stroke-width', 0.5)
                .attr('opacity', 0.5)
                .style('cursor', 'crosshair')
                .on('mouseenter', function () { d3.select(this).attr('opacity', 1).attr('r', 7) })
                .on('mouseleave', function () { d3.select(this).attr('opacity', 0.5).attr('r', 5) })
            }
            if (!readOnly && child.kind !== 'input') {
              childG.append('circle')
                .attr('class', 'net-port-in')
                .attr('cx', isH ? cx : cx + NODE_W / 2)
                .attr('cy', isH ? cy + NODE_H / 2 : cy)
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
        // layer — render input/output shapes outside the node box
        if (node.inputShape) {
          nodeG.append('text')
            .attr('x', nx + nw / 2).attr('y', ny - 4)
            .attr('text-anchor', 'middle').attr('fill', '#888')
            .attr('font-size', '9px')
            .text(node.inputShape)
        }
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
        if (node.outputShape) {
          nodeG.append('text')
            .attr('x', nx + nw / 2).attr('y', ny + nh + 12)
            .attr('text-anchor', 'middle').attr('fill', '#bbb')
            .attr('font-size', '9px')
            .text(node.outputShape)
        }
        if (node.codeMapping && onNavigateToCode && node.codeMapping.filePath) {
          nodeG.append('text')
            .attr('x', nx + nw - 14).attr('y', ny + nh / 2 + 4)
            .attr('fill', '#4a90d9').attr('font-size', '14px')
            .attr('font-weight', 'bold')
            .style('cursor', 'pointer')
            .text('→')
            .on('click', (event: MouseEvent) => {
              event.stopPropagation()
              onNavigateToCode(node.codeMapping!.filePath, node.codeMapping!.startLine)
            })
        }
      }

      if (!readOnly) {
        nodeG.on('click', (event: MouseEvent) => {
          event.stopPropagation()
          if (clickTimersRef.current.has(node.id)) return
          const timer = setTimeout(() => {
            onSelectNode?.(node.id)
            clickTimersRef.current.delete(node.id)
          }, 250)
          clickTimersRef.current.set(node.id, timer)
        })
      }

      nodeG.on('dblclick', (event: MouseEvent) => {
        event.stopPropagation()
        if (!readOnly) {
          const timer = clickTimersRef.current.get(node.id)
          if (timer) { clearTimeout(timer); clickTimersRef.current.delete(node.id) }
        }
        if (node.codeMapping && onNavigateToCode && node.codeMapping.filePath) {
          onNavigateToCode(node.codeMapping.filePath, node.codeMapping.startLine)
        } else if (!readOnly) {
          onSelectNode?.(node.id)
        }
      })

      // Drag-to-connect: drag layer/block node onto another node to create edge
      if (!readOnly && node.kind !== 'input' && node.kind !== 'output') {
        const layerDrag = d3.drag<SVGGElement, unknown>()
          .on('start', function (event: d3.D3DragEvent<SVGGElement, unknown, unknown>) {
            d3.select(this).raise()
            d3.select(this).select('rect').attr('stroke', '#ff0').attr('stroke-width', 2.5)
            // Draw dashed line from node center to cursor
            const transform = d3.zoomTransform(svgEl!)
            const rect = container.getBoundingClientRect()
            const svgX = (event.sourceEvent.clientX - rect.left - transform.x) / transform.k
            const svgY = (event.sourceEvent.clientY - rect.top - transform.y) / transform.k
            g.append('line')
              .attr('class', 'net-drag-line')
              .attr('x1', svgX).attr('y1', svgY)
              .attr('x2', svgX).attr('y2', svgY)
              .attr('stroke', '#4a90d9').attr('stroke-width', 2)
              .attr('stroke-dasharray', '4,2')
          })
          .on('drag', function (event: d3.D3DragEvent<SVGGElement, unknown, unknown>) {
            const transform = d3.zoomTransform(svgEl!)
            const r = container.getBoundingClientRect()
            const mx = (event.sourceEvent.clientX - r.left - transform.x) / transform.k
            const my = (event.sourceEvent.clientY - r.top - transform.y) / transform.k
            svgEl!.querySelector('.net-drag-line')?.setAttribute('x2', String(mx))
            svgEl!.querySelector('.net-drag-line')?.setAttribute('y2', String(my))

            // Detect target node under cursor
            const els = document.elementsFromPoint(event.sourceEvent.clientX, event.sourceEvent.clientY)
            // Clear previous highlights
            svgEl!.querySelectorAll('.net-drag-target').forEach(el => {
              el.classList.remove('net-drag-target')
              const r2 = (el as SVGGElement).querySelector('rect')
              if (r2) {
                const origStroke = r2.getAttribute('data-orig-stroke')
                const origWidth = r2.getAttribute('data-orig-stroke-width')
                if (origStroke) r2.setAttribute('stroke', origStroke)
                if (origWidth) r2.setAttribute('stroke-width', origWidth)
              }
            })
            for (const el of els) {
              const nodeEl = (el as Element).closest?.('.net-node') as HTMLElement | null
              if (!nodeEl) continue
              const targetId = nodeEl.getAttribute('data-node-id')
              if (!targetId || targetId === node.id || !validDragTargetIds.has(targetId)) continue
              nodeEl.classList.add('net-drag-target')
              const targetRect = nodeEl.querySelector('rect')
              if (targetRect) {
                targetRect.setAttribute('data-orig-stroke', targetRect.getAttribute('stroke') || '#888')
                targetRect.setAttribute('data-orig-stroke-width', targetRect.getAttribute('stroke-width') || '1.5')
                targetRect.setAttribute('stroke', '#ff0')
                targetRect.setAttribute('stroke-width', '2.5')
              }
              break
            }
          })
          .on('end', function (event: d3.D3DragEvent<SVGGElement, unknown, unknown>) {
            // Remove dashed line
            svgEl!.querySelector('.net-drag-line')?.remove()
            // Restore dragged node border
            const isSelected = node.id === selectedNodeId
            d3.select(this).select('rect')
              .attr('stroke', isSelected ? '#4a90d9' : color)
              .attr('stroke-width', isSelected ? 2.5 : 1.5)
            // Clear target highlights
            svgEl!.querySelectorAll('.net-drag-target').forEach(el => {
              el.classList.remove('net-drag-target')
              const r2 = (el as SVGGElement).querySelector('rect')
              if (r2) {
                const origStroke = r2.getAttribute('data-orig-stroke')
                const origWidth = r2.getAttribute('data-orig-stroke-width')
                if (origStroke) r2.setAttribute('stroke', origStroke)
                if (origWidth) r2.setAttribute('stroke-width', origWidth)
              }
            })
            // Find target and create edge
            const els = document.elementsFromPoint(event.sourceEvent.clientX, event.sourceEvent.clientY)
            for (const el of els) {
              const nodeEl = (el as Element).closest?.('.net-node') as HTMLElement | null
              if (!nodeEl) continue
              const targetId = nodeEl.getAttribute('data-node-id')
              if (!targetId || targetId === node.id || !validDragTargetIds.has(targetId)) continue
              onAddEdge?.(node.id, targetId)
              break
            }
          })
        nodeG.call(layerDrag as any)
      }

      // Output port — bottom center of block (only for non-output nodes)
      if (!readOnly && node.kind !== 'output') {
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
      if (!readOnly && node.kind !== 'input') {
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
    svg.on('click', () => { onSelectNode?.(null) })

  }, [doc, catalog, selectedNodeId, selectedEdgeId, onSelectNode, onSelectEdge, onNavigateToCode, onAddEdge, readOnly, dims])

  useEffect(() => {
    render()
  }, [render])

  const handlePortMouseDown = useCallback((event: React.MouseEvent) => {
    if (readOnly) return
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
            onAddEdge?.(sourceNodeId, targetId)
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
    if (readOnly) return
    if (e.dataTransfer.types.includes('application/x-net-layer')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    if (readOnly) return
    e.preventDefault()
    const layerType = e.dataTransfer.getData('application/x-net-layer')
    if (layerType) onDropLayer?.(layerType)
  }

  const handleLocate = useCallback(() => {
    const svg = d3.select(svgRef.current)
    const zoom = zoomRef.current
    if (!zoom) return
    const { x, y, k } = fitTransformRef.current
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(svg as any).transition().duration(400).call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(k))
  }, [])

  return (
    <div
      className="network-canvas-container"
      ref={containerRef}
      onMouseDown={handlePortMouseDown}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <svg ref={svgRef} />
      <LocateButton onLocate={handleLocate} />
    </div>
  )
}
