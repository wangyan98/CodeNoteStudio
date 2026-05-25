import { useRef, useEffect, useCallback } from 'react'
import * as d3 from 'd3'
import type { MindMapDocument, MindMapNode } from '../../../../main/schemas/note-types'
import './MindMapRenderer.css'

interface MindMapRendererProps {
  document: MindMapDocument
  onSave: (doc: MindMapDocument) => Promise<void>
}

export function MindMapRenderer({ document, onSave }: MindMapRendererProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const render = useCallback(() => {
    const svg = d3.select(svgRef.current)
    const container = containerRef.current
    if (!container) return

    svg.selectAll('*').remove()

    const width = container.clientWidth || 800
    const height = container.clientHeight || 600

    svg.attr('width', width).attr('height', height)

    const root = d3.hierarchy<MindMapNode>(document.root, (d) => d.children)
    const treeLayout = d3.tree<MindMapNode>().nodeSize([60, 120])
    treeLayout(root)

    const rootY = height / 2
    const g = svg.append('g').attr('transform', `translate(60, ${rootY})`)

    // Links
    g.selectAll('path.link')
      .data(root.links())
      .join('path')
      .attr('class', 'mind-link')
      .attr('d', (d) => {
        return `M${d.source.y!},${d.source.x!} C${d.source.y! + 60},${d.source.x!} ${d.target.y! - 60},${d.target.x!} ${d.target.y!},${d.target.x!}`
      })
      .attr('fill', 'none')
      .attr('stroke', '#555')
      .attr('stroke-width', 1.5)

    // Nodes
    const nodeGroup = g.selectAll('g.node')
      .data(root.descendants())
      .join('g')
      .attr('class', 'mind-node')
      .attr('transform', (d) => `translate(${d.y!},${d.x!})`)
      .style('cursor', (d) => (d.children && d.children.length > 0 ? 'pointer' : 'default'))

    nodeGroup.append('rect')
      .attr('x', -60)
      .attr('y', -14)
      .attr('width', 120)
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
  }, [document])

  useEffect(() => {
    render()
  }, [render])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => { render() })
    observer.observe(container)
    return () => observer.disconnect()
  }, [render])

  return (
    <div className="mindmap-container" ref={containerRef}>
      <svg ref={svgRef} />
    </div>
  )
}
