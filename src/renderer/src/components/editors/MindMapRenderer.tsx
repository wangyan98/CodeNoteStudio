import { useRef, useEffect, useCallback } from 'react'
import * as d3 from 'd3'
import type { MindMapDocument, MindMapNode } from '../../../../main/schemas/note-types'
import { LocateButton } from './LocateButton'
import './MindMapRenderer.css'

interface MindMapRendererProps {
  document: MindMapDocument
  onSave: (doc: MindMapDocument) => Promise<void>
}

export function MindMapRenderer({ document, onSave }: MindMapRendererProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const gElRef = useRef<SVGGElement | null>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const fitTransformRef = useRef<{ x: number; y: number; k: number }>({ x: 0, y: 0, k: 1 })

  const render = useCallback(() => {
    const svg = d3.select(svgRef.current)
    const container = containerRef.current
    if (!container) return

    const width = container.clientWidth || 800
    const height = container.clientHeight || 600

    svg.selectAll('*').remove()
    svg.attr('width', width).attr('height', height)

    const root = d3.hierarchy<MindMapNode>(document.root, (d) => d.children)
    const treeLayout = d3.tree<MindMapNode>().nodeSize([60, 200])
    treeLayout(root)

    const rootY = height / 2
    const g = svg.append('g').attr('transform', `translate(80, ${rootY})`)
    gElRef.current = g.node()

    // Branch connectors (org-chart style): one fork per parent with visible children
    const nodesWithChildren = root.descendants().filter(d => d.children && d.children.length > 0)

    nodesWithChildren.forEach(parent => {
      const children = parent.children!
      const firstChild = children[0]
      const lastChild = children[children.length - 1]

      const parentRightX = parent.y! + 70
      const childLeftX = firstChild.y! - 70
      const elbowX = parentRightX + (childLeftX - parentRightX) * 0.75

      // Horizontal from parent right edge to elbow
      g.append('line')
        .attr('x1', parentRightX)
        .attr('y1', parent.x!)
        .attr('x2', elbowX)
        .attr('y2', parent.x!)
        .attr('stroke', '#555')
        .attr('stroke-width', 1.5)
        .attr('class', 'mind-link')

      // Vertical line at elbow spanning from first to last child (only if >1 child)
      if (children.length > 1) {
        g.append('line')
          .attr('x1', elbowX)
          .attr('y1', firstChild.x!)
          .attr('x2', elbowX)
          .attr('y2', lastChild.x!)
          .attr('stroke', '#555')
          .attr('stroke-width', 1.5)
          .attr('class', 'mind-link')
      }

      // Individual lines from elbow to each child
      children.forEach(child => {
        g.append('line')
          .attr('x1', elbowX)
          .attr('y1', child.x!)
          .attr('x2', childLeftX)
          .attr('y2', child.x!)
          .attr('stroke', '#555')
          .attr('stroke-width', 1.5)
          .attr('class', 'mind-link')
      })
    })

    // Nodes
    const nodeGroup = g.selectAll('g.node')
      .data(root.descendants())
      .join('g')
      .attr('class', 'mind-node')
      .attr('transform', (d) => `translate(${d.y!},${d.x!})`)
      .style('cursor', (d) => (d.children && d.children.length > 0 ? 'pointer' : 'default'))

    nodeGroup.append('rect')
      .attr('x', -70)
      .attr('y', -14)
      .attr('width', 140)
      .attr('height', 28)
      .attr('rx', 4)
      .attr('fill', (d) => (d.depth === 0 ? 'var(--accent-color, #007acc)' : '#3c3c3c'))
      .attr('stroke', (d) => (d.depth === 0 ? '#007acc' : '#555'))
      .attr('stroke-width', 1)

    nodeGroup.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 4)
      .attr('fill', '#d4d4d4')
      .attr('font-size', '11px')
      .text((d) => d.data.title.length > 18 ? d.data.title.slice(0, 16) + '..' : d.data.title)

    // Zoom — create once, reuse across renders
    if (!zoomRef.current) {
      zoomRef.current = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 2.5])
        .on('zoom', (event) => {
          if (gElRef.current) {
            d3.select(gElRef.current).attr('transform', `translate(${event.transform.x},${event.transform.y}) scale(${event.transform.k})`)
          }
        })
      ;(svg as any).call(zoomRef.current)
    }

    // Zoom-to-fit: center the tree in the viewport
    const svgNode = svg.node()
    if (svgNode) {
      const bbox = (g.node() as SVGGElement).getBBox()
      const padding = 40
      const scale = Math.min(
        (width - padding * 2) / (bbox.width || 1),
        (height - padding * 2) / (bbox.height || 1),
        1.5
      )
      const tx = (width - bbox.width * scale) / 2 - bbox.x * scale
      const ty = (height - bbox.height * scale) / 2 - bbox.y * scale
      const transform = d3.zoomIdentity.translate(tx, ty).scale(scale)
      ;(svg as any).call(zoomRef.current!.transform, transform)
      fitTransformRef.current = { x: tx, y: ty, k: scale }
    }
  }, [document])

  useEffect(() => { render() }, [render])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => { render() })
    observer.observe(container)
    return () => observer.disconnect()
  }, [render])

  useEffect(() => {
    return () => {
      zoomRef.current = null
    }
  }, [])

  const handleLocate = useCallback(() => {
    const svg = d3.select(svgRef.current)
    const zoom = zoomRef.current
    if (!zoom) return
    const { x, y, k } = fitTransformRef.current
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(svg as any).transition().duration(400).call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(k))
  }, [])

  return (
    <div className="mindmap-container" ref={containerRef}>
      <svg ref={svgRef} />
      <LocateButton onLocate={handleLocate} />
    </div>
  )
}
