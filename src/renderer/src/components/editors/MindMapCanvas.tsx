import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import * as d3 from 'd3'
import type { MindMapDocument, MindMapNode } from '../../../../main/schemas/note-types'
import type { MindMapAction } from './mindMapReducer'
import { findNode } from './mindMapReducer'

interface MindMapCanvasProps {
  doc: MindMapDocument
  notePath: string
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
  function MindMapCanvas({ doc, notePath, selectedNodeId, collapsedIds, dispatch, onContextMenu, onHoverNode }, ref) {
    const svgRef = useRef<SVGSVGElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const gElRef = useRef<SVGGElement | null>(null)
    const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
    const focusNodeIdRef = useRef<string | null>(null)
    const selectedNodeIdRef = useRef<string | null>(null)

    // Keep ref in sync so render() can read it without depending on the prop
    selectedNodeIdRef.current = selectedNodeId

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

    // Separate effect: update selection highlight via direct DOM manipulation
    // This avoids triggering a full D3 re-render when only selection changes
    useEffect(() => {
      if (!svgRef.current) return
      const currentSelected = selectedNodeIdRef.current
      // Remove highlight from previously selected node
      svgRef.current.querySelectorAll('[data-node-id] rect').forEach((rect) => {
        const g = rect.parentElement
        const nodeId = g?.getAttribute('data-node-id')
        if (nodeId === currentSelected) {
          rect.setAttribute('fill', '#094771')
          rect.setAttribute('stroke', '#ff0')
          rect.setAttribute('stroke-width', '2')
        } else {
          const depth = g?.getAttribute('data-depth')
          const isRoot = depth === '0'
          rect.setAttribute('fill', isRoot ? '#007acc' : '#3c3c3c')
          rect.setAttribute('stroke', isRoot ? '#007acc' : '#555')
          rect.setAttribute('stroke-width', '1')
        }
      })
    }, [selectedNodeId])

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
      const treeLayout = d3.tree<MindMapNode>().nodeSize([60, 240])
      treeLayout(root)

      // Branch connectors (org-chart style): one fork per parent with visible children
      const nodesWithChildren = root.descendants().filter(d => d.children && d.children.length > 0)

      // Build a map of original positions for drag offset calculations
      const originalPositions = new Map<string, { x: number; y: number }>()
      root.descendants().forEach(d => {
        originalPositions.set(d.data.id, { x: d.x!, y: d.y! })
      })

      nodesWithChildren.forEach(parent => {
        const children = parent.children!
        const parentId = parent.data.id
        const firstChild = children[0]
        const lastChild = children[children.length - 1]

        const parentRightX = parent.y! + 70
        const childLeftX = firstChild.y! - 70
        // Place elbow close to children (75% of the gap from parent) so the
        // vertical distribution line sits in clear space, not overlapping nodes
        const elbowX = parentRightX + (childLeftX - parentRightX) * 0.75

        // Horizontal line from parent right edge to elbow
        g.append('line')
          .attr('x1', parentRightX)
          .attr('y1', parent.x!)
          .attr('x2', elbowX)
          .attr('y2', parent.x!)
          .attr('stroke', '#555')
          .attr('stroke-width', 1.5)
          .attr('class', 'mind-link')
          .attr('data-owner-id', parentId)
          .attr('data-orig-x1', parentRightX)
          .attr('data-orig-y1', parent.x!)
          .attr('data-orig-x2', elbowX)
          .attr('data-orig-y2', parent.x!)

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
            .attr('data-owner-id', parentId)
            .attr('data-line-type', 'vertical')
            .attr('data-orig-x1', elbowX)
            .attr('data-orig-y1', firstChild.x!)
            .attr('data-orig-x2', elbowX)
            .attr('data-orig-y2', lastChild.x!)
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
            .attr('data-owner-id', parentId)
            .attr('data-child-id', child.data.id)
            .attr('data-orig-x1', elbowX)
            .attr('data-orig-y1', child.x!)
            .attr('data-orig-x2', childLeftX)
            .attr('data-orig-y2', child.x!)
        })
      })

      // Node groups
      const nodeGroup = g.selectAll('g.node')
        .data(root.descendants())
        .join('g')
        .attr('class', 'mind-node')
        .attr('transform', (d) => `translate(${d.y!},${d.x!})`)
        .attr('data-node-id', (d) => d.data.id)
        .attr('data-depth', (d) => String(d.depth))
        .attr('data-parent-id', (d) => d.parent?.data.id || '')
        .style('cursor', 'pointer')

      // Read selection from ref (not prop) to avoid including selectedNodeId in render deps
      const selId = selectedNodeIdRef.current

      // Node rects
      nodeGroup.append('rect')
        .attr('x', -70)
        .attr('y', -14)
        .attr('width', 140)
        .attr('height', 28)
        .attr('rx', 4)
        .attr('fill', (d) => d.data.id === selId ? '#094771' : (d.depth === 0 ? '#007acc' : '#3c3c3c'))
        .attr('stroke', (d) => d.data.id === selId ? '#ff0' : (d.depth === 0 ? '#007acc' : '#555'))
        .attr('stroke-width', (d) => d.data.id === selId ? 2 : 1)

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
        .style('cursor', 'pointer')
        .on('click', function (event: MouseEvent, d: d3.HierarchyNode<MindMapNode>) {
          event.stopPropagation()
          dispatch({ type: 'TOGGLE_COLLAPSE', nodeId: d.data.id })
        })

      nodeGroup.filter(hasOrHadChildren)
        .append('text')
        .attr('x', -70)
        .attr('y', 3)
        .attr('text-anchor', 'middle')
        .attr('fill', '#aaa')
        .attr('font-size', '9px')
        .style('pointer-events', 'none')
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

      // Drag — move node, descendants, and link lines in sync
      let dragOffset: { x: number; y: number } | null = null
      let dragged = false

      // Collect descendant IDs for a node
      function getDescendantIds(nodeId: string): Set<string> {
        const ids = new Set<string>()
        const nodeData = findNode(doc, nodeId)
        if (nodeData) {
          const stack = [nodeData]
          while (stack.length > 0) {
            const n = stack.pop()!
            for (const child of n.children) {
              ids.add(child.id)
              stack.push(child)
            }
          }
        }
        return ids
      }

      const dragHandler = d3.drag<SVGGElement, d3.HierarchyNode<MindMapNode>>()
        .on('start', function (event: d3.D3DragEvent<SVGGElement, unknown, unknown>, d: d3.HierarchyNode<MindMapNode>) {
          d3.select(this).raise()
          d3.select(this).select('rect').attr('stroke', '#ff0').attr('stroke-width', 2)
          const pt = d3.pointer(event, svgRef.current!)
          dragOffset = { x: pt[0] - d.y!, y: pt[1] - d.x! }
        })
        .on('drag', function (event: d3.D3DragEvent<SVGGElement, unknown, unknown>, d: d3.HierarchyNode<MindMapNode>) {
          if (!dragOffset) return
          dragged = true
          const pt = d3.pointer(event, svgRef.current!)
          const dx = pt[0] - dragOffset.x - d.y!
          const dy = pt[1] - dragOffset.y - d.x!

          const svgEl = svgRef.current
          if (!svgEl) return

          // Move the dragged node
          d3.select(this).attr('transform', `translate(${pt[0] - dragOffset.x},${pt[1] - dragOffset.y})`)

          // Move all descendant node groups
          const descendantIds = getDescendantIds(d.data.id)
          descendantIds.forEach(id => {
            const el = svgEl.querySelector<SVGGElement>(`[data-node-id="${id}"]`)
            const orig = originalPositions.get(id)
            if (el && orig) {
              el.setAttribute('transform', `translate(${orig.y + dx},${orig.x + dy})`)
            }
          })

          // Move all link lines owned by the dragged node
          // Use data-orig-* as the fixed base to avoid cumulative offset drift
          const ownedLines = svgEl.querySelectorAll<SVGLineElement>(
            `[data-owner-id="${d.data.id}"]`
          )
          ownedLines.forEach(line => {
            line.setAttribute('x1', String(parseFloat(line.getAttribute('data-orig-x1') || '0') + dx))
            line.setAttribute('y1', String(parseFloat(line.getAttribute('data-orig-y1') || '0') + dy))
            line.setAttribute('x2', String(parseFloat(line.getAttribute('data-orig-x2') || '0') + dx))
            line.setAttribute('y2', String(parseFloat(line.getAttribute('data-orig-y2') || '0') + dy))
          })

          // Move link lines owned by descendants
          descendantIds.forEach(descId => {
            const descLines = svgEl.querySelectorAll<SVGLineElement>(
              `[data-owner-id="${descId}"]`
            )
            descLines.forEach(line => {
              line.setAttribute('x1', String(parseFloat(line.getAttribute('data-orig-x1') || '0') + dx))
              line.setAttribute('y1', String(parseFloat(line.getAttribute('data-orig-y1') || '0') + dy))
              line.setAttribute('x2', String(parseFloat(line.getAttribute('data-orig-x2') || '0') + dx))
              line.setAttribute('y2', String(parseFloat(line.getAttribute('data-orig-y2') || '0') + dy))
            })
          })

          // Update the parent's connector line that points TO this node.
          // This is a horizontal line from elbow to child's left edge — keep it
          // horizontal by moving both y1 and y2 with the child.
          const incomingLines = svgEl.querySelectorAll<SVGLineElement>(
            `[data-child-id="${d.data.id}"]`
          )
          incomingLines.forEach(line => {
            // x1 stays at elbowX — elbow doesn't move horizontally
            // y1 and y2 both move by dy to keep the line horizontal
            line.setAttribute('y1', String(parseFloat(line.getAttribute('data-orig-y1') || '0') + dy))
            line.setAttribute('x2', String(parseFloat(line.getAttribute('data-orig-x2') || '0') + dx))
            line.setAttribute('y2', String(parseFloat(line.getAttribute('data-orig-y2') || '0') + dy))
          })

          // Recalculate parent's vertical line span from all siblings'
          // current positions — not just the dragged child's endpoint.
          // When the first child moves below the second child, the vertical
          // line must still span from the (new) topmost to bottommost sibling.
          const parentId = d.parent?.data.id
          if (parentId) {
            const vertLine = svgEl.querySelector<SVGLineElement>(
              `[data-owner-id="${parentId}"][data-line-type="vertical"]`
            )
            if (vertLine) {
              const siblingEls = svgEl.querySelectorAll<SVGGElement>(
                `[data-parent-id="${parentId}"]`
              )
              let minY = Infinity
              let maxY = -Infinity
              siblingEls.forEach(el => {
                const sibId = el.getAttribute('data-node-id')
                if (!sibId) return
                const orig = originalPositions.get(sibId)
                if (!orig) return
                // Dragged node or descendant moves by dy; other siblings stay at original
                const isMoved = sibId === d.data.id || descendantIds.has(sibId)
                const curY = orig.x + (isMoved ? dy : 0)
                if (curY < minY) minY = curY
                if (curY > maxY) maxY = curY
              })
              if (minY < Infinity) {
                vertLine.setAttribute('y1', String(minY))
                vertLine.setAttribute('y2', String(maxY))
              }
            }
          }
        })
        .on('end', function (_event: d3.D3DragEvent<SVGGElement, unknown, unknown>, _d: d3.HierarchyNode<MindMapNode>) {
          dragOffset = null
          if (dragged) {
            dragged = false
            // Full re-render to snap all nodes and lines back to original positions
            render()
          } else {
            // Pure click (no drag movement) — restore the highlight stroke that
            // 'start' set, so the selection useEffect can apply the correct style
            const isSelected = _d.data.id === selectedNodeIdRef.current
            d3.select(this).select('rect')
              .attr('stroke', isSelected ? '#ff0' : (_d.depth === 0 ? '#007acc' : '#555'))
              .attr('stroke-width', isSelected ? 2 : 1)
          }
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
        ;(svg as any).call(zoomRef.current.transform, d3.zoomIdentity.translate(80, height / 2))
      }

      // Re-apply current zoom transform to the new g after tree rebuild
      const svgNode = svg.node()
      if (svgNode) {
        const transform = d3.zoomTransform(svgNode)
        if (transform.x !== 0 || transform.y !== 0 || transform.k !== 1) {
          g.attr('transform', `translate(${transform.x},${transform.y}) scale(${transform.k})`)
        }
      }

      // Inline title editing overlay
      if (focusNodeIdRef.current) {
        const activeTag = (document.activeElement as HTMLElement)?.tagName
        if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
          const editNodeId = focusNodeIdRef.current
          focusNodeIdRef.current = null

          const editNodeElement = svgNode?.querySelector(`[data-node-id="${editNodeId}"]`)
          if (editNodeElement) {
            const editNode = findNode(doc, editNodeId)
            if (editNode) {
              requestAnimationFrame(() => {
                const nodeRect = (editNodeElement as SVGGElement).getBoundingClientRect()
                const input = document.createElement('input')
                input.value = editNode.title
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
                  if (newTitle && newTitle !== editNode.title) {
                    dispatch({ type: 'UPDATE_TITLE', nodeId: editNodeId, title: newTitle })
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
              })
            }
          }
        } else {
          focusNodeIdRef.current = null
        }
      }

    }, [doc, collapsedIds, dispatch, onContextMenu, onHoverNode])
    // NOTE: selectedNodeId intentionally NOT in deps — selection highlight is
    // applied via the separate useEffect below, avoiding full D3 rebuild on click

    useEffect(() => { render() }, [render])

    useEffect(() => {
      const container = containerRef.current
      if (!container) return
      const observer = new ResizeObserver(() => { render() })
      observer.observe(container)
      return () => observer.disconnect()
    }, [render])

    // Cleanup zoomRef when the component is fully unmounted
    useEffect(() => {
      return () => {
        zoomRef.current = null
      }
    }, [])

    return (
      <div
        className="mindmap-container"
        ref={containerRef}
        tabIndex={0}
        onKeyDown={(e) => {
          if (!selectedNodeId || selectedNodeId === '') return
          const tag = (e.target as HTMLElement).tagName
          if (tag === 'INPUT' || tag === 'TEXTAREA') return
          if ((e.nativeEvent as KeyboardEvent).isComposing) return
          if (e.key === 'Tab') {
            e.preventDefault()
            dispatch({ type: 'ADD_CHILD', parentId: selectedNodeId })
          } else if (e.key === 'Enter') {
            e.preventDefault()
            dispatch({ type: 'ADD_SIBLING', nodeId: selectedNodeId })
          } else if (e.key === ' ') {
            e.preventDefault()
            dispatch({ type: 'TOGGLE_COLLAPSE', nodeId: selectedNodeId })
          } else if (e.key === 'F2') {
            e.preventDefault()
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
