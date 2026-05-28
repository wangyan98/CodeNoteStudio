import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import * as d3 from 'd3'
import type { MindMapDocument, MindMapNode } from '../../../../main/schemas/note-types'
import type { MindMapAction } from './mindMapReducer'
import { findNode } from './mindMapReducer'

interface MindMapCanvasProps {
  doc: MindMapDocument
  selectedNodeId: string | null
  collapsedIds: Set<string>
  dispatch: React.Dispatch<MindMapAction>
  onContextMenu: (nodeId: string, x: number, y: number) => void
  onHoverNode?: (nodeId: string | null) => void
}

export interface MindMapCanvasHandle {
  zoomToFit: () => void
}

export const MindMapCanvas = forwardRef<MindMapCanvasHandle, MindMapCanvasProps>(
  function MindMapCanvas({ doc, selectedNodeId, collapsedIds, dispatch, onContextMenu, onHoverNode }, ref) {
    const svgRef = useRef<SVGSVGElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const gElRef = useRef<SVGGElement | null>(null)
    const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
    const focusNodeIdRef = useRef<string | null>(null)

    useImperativeHandle(ref, () => ({
      zoomToFit() {
        const svg = d3.select(svgRef.current)
        const g = svg.select<SVGGElement>('g')
        if (g.empty()) return
        const bbox = (g.node() as SVGGElement).getBBox()
        const container = containerRef.current
        if (!container) return
        const w = container.clientWidth
        const h = container.clientHeight
        const scale = Math.min(w / (bbox.width + 120), h / (bbox.height + 80), 1.5)
        const tx = (w - bbox.width * scale) / 2 - bbox.x * scale
        const ty = (h - bbox.height * scale) / 2 - bbox.y * scale
        const transform = d3.zoomIdentity.translate(tx, ty).scale(scale)
        if (zoomRef.current) {
          ;(svg.transition().duration(300) as any).call(zoomRef.current.transform, transform)
        } else {
          g.attr('transform', `translate(${tx},${ty}) scale(${scale})`)
        }
      }
    }))

    const render = useCallback(() => {
      const svg = d3.select(svgRef.current)
      const container = containerRef.current
      if (!container) return

      const width = container.clientWidth || 800
      const height = container.clientHeight || 600
      svg.attr('width', width).attr('height', height)

      svg.selectAll('g').remove()

      const g = svg.append('g')
      gElRef.current = g.node()

      // Filter out collapsed subtrees
      function getVisibleRoot(node: MindMapNode): MindMapNode {
        function filterCollapsed(n: MindMapNode): MindMapNode | null {
          if (collapsedIds.has(n.id)) {
            return { ...n, children: [] }
          }
          return {
            ...n,
            children: n.children.map(filterCollapsed).filter(Boolean) as MindMapNode[]
          }
        }
        return filterCollapsed(node)!
      }

      const visibleRoot = getVisibleRoot(doc.root)
      const root = d3.hierarchy<MindMapNode>(visibleRoot, (d) => d.children)
      const treeLayout = d3.tree<MindMapNode>().nodeSize([60, 180])
      treeLayout(root)

      // Links
      g.selectAll('path.link')
        .data(root.links())
        .join('path')
        .attr('class', 'mind-link')
        .attr('d', (d) => {
          return `M${d.source.y!},${d.source.x!} C${d.source.y! + 90},${d.source.x!} ${d.target.y! - 90},${d.target.x!} ${d.target.y!},${d.target.x!}`
        })
        .attr('fill', 'none')
        .attr('stroke', '#555')
        .attr('stroke-width', 1.5)

      // Node groups
      const nodeGroup = g.selectAll('g.node')
        .data(root.descendants())
        .join('g')
        .attr('class', 'mind-node')
        .attr('transform', (d) => `translate(${d.y!},${d.x!})`)
        .attr('data-node-id', (d) => d.data.id)
        .style('cursor', 'pointer')

      // Node rects
      nodeGroup.append('rect')
        .attr('x', -70)
        .attr('y', -14)
        .attr('width', 140)
        .attr('height', 28)
        .attr('rx', 4)
        .attr('fill', (d) => d.data.id === selectedNodeId ? '#094771' : (d.depth === 0 ? '#007acc' : '#3c3c3c'))
        .attr('stroke', (d) => d.data.id === selectedNodeId ? '#ff0' : (d.depth === 0 ? '#007acc' : '#555'))
        .attr('stroke-width', (d) => d.data.id === selectedNodeId ? 2 : 1)

      // Collapse indicator
      const hasOrHadChildren = (d: d3.HierarchyNode<MindMapNode>) =>
        (d.children && d.children.length > 0) || collapsedIds.has(d.data.id)

      nodeGroup.filter(hasOrHadChildren)
        .append('circle')
        .attr('cx', -70)
        .attr('cy', 0)
        .attr('r', 7)
        .attr('fill', '#3c3c3c')
        .attr('stroke', '#666')
        .attr('stroke-width', 1)

      nodeGroup.filter(hasOrHadChildren)
        .append('text')
        .attr('x', -70)
        .attr('y', 3)
        .attr('text-anchor', 'middle')
        .attr('fill', '#aaa')
        .attr('font-size', '9px')
        .text((d) => collapsedIds.has(d.data.id) ? '▶' : '▼')

      // Title text
      nodeGroup.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', 4)
        .attr('fill', '#d4d4d4')
        .attr('font-size', '11px')
        .style('pointer-events', 'none')
        .text((d) => d.data.title.length > 22 ? d.data.title.slice(0, 20) + '..' : d.data.title)

      // --- Events ---

      nodeGroup.on('click', (event: MouseEvent, d: d3.HierarchyNode<MindMapNode>) => {
        event.stopPropagation()
        dispatch({ type: 'SELECT_NODE', nodeId: d.data.id })
      })

      nodeGroup.on('dblclick', (event: MouseEvent, d: d3.HierarchyNode<MindMapNode>) => {
        event.stopPropagation()
        dispatch({ type: 'SELECT_NODE', nodeId: d.data.id })
        focusNodeIdRef.current = d.data.id
        render()
      })

      nodeGroup.on('contextmenu', (event: MouseEvent, d: d3.HierarchyNode<MindMapNode>) => {
        event.preventDefault()
        event.stopPropagation()
        dispatch({ type: 'SELECT_NODE', nodeId: d.data.id })
        onContextMenu(d.data.id, event.clientX, event.clientY)
      })

      nodeGroup.on('mouseenter', (_event: MouseEvent, d: d3.HierarchyNode<MindMapNode>) => {
        onHoverNode?.(d.data.id)
      })
      nodeGroup.on('mouseleave', () => {
        onHoverNode?.(null)
      })

      // Drag (visual only in v1) — note: do NOT call render() in end handler,
      // it would remove DOM elements before the click event fires
      const dragHandler = d3.drag<SVGGElement, d3.HierarchyNode<MindMapNode>>()
        .on('start', function () {
          d3.select(this).raise()
          d3.select(this).select('rect').attr('stroke', '#ff0').attr('stroke-width', 2)
        })
        .on('drag', function (event: d3.D3DragEvent<SVGGElement, unknown, unknown>, d: d3.HierarchyNode<MindMapNode>) {
          d3.select(this).attr('transform', `translate(${d.y! + event.x},${d.x! + event.y})`)
        })
        .on('end', function (_event: d3.D3DragEvent<SVGGElement, unknown, unknown>, d: d3.HierarchyNode<MindMapNode>) {
          // Snap back to original position, restore stroke
          d3.select(this).attr('transform', `translate(${d.y!},${d.x!})`)
          const isSelected = d.data.id === selectedNodeId
          d3.select(this).select('rect')
            .attr('stroke', isSelected ? '#ff0' : (d.depth === 0 ? '#007acc' : '#555'))
            .attr('stroke-width', isSelected ? 2 : 1)
        })

      nodeGroup.call(dragHandler as any)

      // SVG background click: deselect
      svg.on('click', () => {
        dispatch({ type: 'SELECT_NODE', nodeId: '' })
      })

      // Zoom — create once, reuse across renders to avoid listener stacking
      if (!zoomRef.current) {
        zoomRef.current = d3.zoom<SVGSVGElement, unknown>()
          .scaleExtent([0.3, 2.5])
          .on('zoom', (event) => {
            if (gElRef.current) {
              d3.select(gElRef.current).attr('transform', `translate(${event.transform.x},${event.transform.y}) scale(${event.transform.k})`)
            }
          })
        ;(svg as any).call(zoomRef.current)
        // Center the root node initially (80px from left, vertically centered)
        ;(svg as any).call(zoomRef.current.transform, d3.zoomIdentity.translate(80, height / 2))
      }

      // Re-apply current zoom transform to the new g after tree rebuild
      const svgNode = svg.node()
      if (svgNode && zoomRef.current) {
        const transform = d3.zoomTransform(svgNode)
        if (transform.x !== 0 || transform.y !== 0 || transform.k !== 1) {
          g.attr('transform', `translate(${transform.x},${transform.y}) scale(${transform.k})`)
        }
      }

    }, [doc, selectedNodeId, collapsedIds, dispatch, onContextMenu, onHoverNode])

    useEffect(() => { render() }, [render])

    useEffect(() => {
      const container = containerRef.current
      if (!container) return
      const observer = new ResizeObserver(() => { render() })
      observer.observe(container)
      return () => observer.disconnect()
    }, [render])

    // Inline title editing overlay
    useEffect(() => {
      if (!focusNodeIdRef.current) return
      const nodeId = focusNodeIdRef.current
      focusNodeIdRef.current = null

      const svgNode = svgRef.current
      if (!svgNode) return

      const nodeElement = svgNode.querySelector(`[data-node-id="${nodeId}"]`)
      if (!nodeElement) return

      const node = findNode(doc, nodeId)
      if (!node) return

      const nodeRect = (nodeElement as SVGGElement).getBoundingClientRect()
      const input = document.createElement('input')
      input.value = node.title
      input.style.position = 'fixed'
      input.style.left = `${nodeRect.left}px`
      input.style.top = `${nodeRect.top}px`
      input.style.width = `${130}px`
      input.style.height = `${24}px`
      input.style.fontSize = '11px'
      input.style.padding = '2px 6px'
      input.style.background = '#1e1e1e'
      input.style.color = '#d4d4d4'
      input.style.border = '2px solid #007acc'
      input.style.borderRadius = '4px'
      input.style.zIndex = '9999'
      input.style.outline = 'none'
      input.className = 'mind-inline-title-input'

      document.body.appendChild(input)
      input.focus()
      input.select()

      const commit = () => {
        const newTitle = input.value.trim()
        if (document.body.contains(input)) {
          document.body.removeChild(input)
        }
        if (newTitle && newTitle !== node.title) {
          dispatch({ type: 'UPDATE_TITLE', nodeId, title: newTitle })
        }
      }

      input.addEventListener('blur', commit)
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') {
          if (document.body.contains(input)) {
            document.body.removeChild(input)
          }
        }
        e.stopPropagation()
      })
    }, [doc, selectedNodeId, dispatch])

    return (
      <div
        className="mindmap-container"
        ref={containerRef}
        tabIndex={0}
        onKeyDown={(e) => {
          if (!selectedNodeId || selectedNodeId === '') return
          e.preventDefault()
          if (e.key === 'Tab') {
            dispatch({ type: 'ADD_CHILD', parentId: selectedNodeId })
          } else if (e.key === 'Enter') {
            dispatch({ type: 'ADD_SIBLING', nodeId: selectedNodeId })
          } else if (e.key === ' ') {
            dispatch({ type: 'TOGGLE_COLLAPSE', nodeId: selectedNodeId })
          } else if (e.key === 'F2') {
            focusNodeIdRef.current = selectedNodeId
            render()
          }
        }}
      >
        <svg ref={svgRef} />
      </div>
    )
  }
)
