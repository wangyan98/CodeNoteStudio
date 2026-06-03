import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef, useState, useLayoutEffect, useMemo } from 'react'
import * as d3 from 'd3'
import type { MindMapDocument, MindMapNode, DerivationDocument, NetworkDocument } from '../../../../main/schemas/note-types'
import type { MindMapAction } from './mindMapReducer'
import { findNode, findParentAndIndex } from './mindMapReducer'
import { inferEmbedType, renderMarkdownForEmbed } from '../../services/markdown-renderer'
import { MindMapRenderer } from './MindMapRenderer'
import { DerivationDagViewer } from './DerivationDagViewer'
import { SequenceDiagramViewer } from './SequenceDiagramViewer'
import { NetworkEmbedViewer } from './NetworkEmbedViewer'

interface MindMapCanvasProps {
  doc: MindMapDocument
  notePath: string
  selectedNodeId: string | null
  collapsedIds: Set<string>
  dispatch: React.Dispatch<MindMapAction>
  onContextMenu: (nodeId: string, x: number, y: number) => void
  onHoverNode?: (nodeId: string | null) => void
  onNavigateToCode?: (filePath: string, line: number) => void
}

export interface MindMapCanvasHandle {
  zoomToFit: () => void
}

type NoteContent = string | MindMapDocument | DerivationDocument | NetworkDocument

interface EmbedRef {
  rawMatch: string
  relativePath: string
}

type EmbedStatus = 'loading' | 'loaded' | 'error'

interface ResolvedEmbed {
  status: EmbedStatus
  notePath: string
  noteType: string | null
  content?: NoteContent
  errorMessage?: string
}

function parseEmbeds(content: string): EmbedRef[] {
  const refs: EmbedRef[] = []
  const matches = content.matchAll(/\[\[([^\]]+)\]\]/g)
  for (const match of matches) {
    refs.push({
      rawMatch: match[0],
      relativePath: match[1].trim()
    })
  }
  return refs
}

function resolveEmbedPath(
  sourceNotePath: string,
  embedRelativePath: string
): string {
  const slashIdx = sourceNotePath.lastIndexOf('/')
  const sourceDir = slashIdx >= 0 ? sourceNotePath.slice(0, slashIdx) : ''
  const combined = sourceDir ? `${sourceDir}/${embedRelativePath}` : embedRelativePath
  const segments = combined.split('/')
  const resolved: string[] = []
  for (const seg of segments) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      resolved.pop()
    } else {
      resolved.push(seg)
    }
  }
  return resolved.join('/')
}

// NOTE: Currently only detects direct self-embedding (A embeds A).
// Cross-note circular chains (A→B→A) are prevented by the first-level-only policy
// (embedded content's [[path]] refs are stripped and not togglable).
function isCircularReference(sourceNotePath: string, targetResolvedPath: string): boolean {
  return sourceNotePath === targetResolvedPath
}

// Separate component (not nested) so React preserves instances across parent re-renders
function EmbedCard({ cacheKey, cached }: {
  cacheKey: string
  cached: ResolvedEmbed
}) {
  const sepIdx = cacheKey.indexOf('::')
  const nodeId = cacheKey.slice(0, sepIdx)
  const embedPath = cacheKey.slice(sepIdx + 2)

  if (cached.status === 'loading') {
    return (
      <div className="embed-card" data-node-id={nodeId} data-embed-path={embedPath} data-embed-status="loading">
        <div className="embed-card-header">
          <span className="embed-card-badge">{cached.noteType || 'err'}</span>
          <span>{embedPath}</span>
        </div>
        <div className="embed-card-body">
          <div className="embed-card-loading">Loading...</div>
        </div>
      </div>
    )
  }

  if (cached.status === 'error') {
    return (
      <div className="embed-card" data-node-id={nodeId} data-embed-path={embedPath} data-embed-status="error">
        <div className="embed-card-header">
          <span className="embed-card-badge">{cached.noteType || 'err'}</span>
          <span>{embedPath}</span>
        </div>
        <div className="embed-card-body">
          <div className="embed-card-error">⚠ {cached.errorMessage || 'Unknown error'}</div>
        </div>
      </div>
    )
  }

  if (cached.status === 'loaded' && cached.content !== undefined) {
    return (
      <div className="embed-card" data-node-id={nodeId} data-embed-path={embedPath} data-embed-status="loaded">
        <div className="embed-card-header">
          <span className="embed-card-badge">{cached.noteType || 'err'}</span>
          <span>{embedPath}</span>
        </div>
        <div className="embed-card-body">
          {cached.noteType === 'md' && (
            <div dangerouslySetInnerHTML={{ __html: renderMarkdownForEmbed(cached.content as string) }} />
          )}
          {cached.noteType === 'mind' && (
            <MindMapRenderer document={cached.content as MindMapDocument} onSave={async () => {}} />
          )}
          {cached.noteType === 'derive' && (
            <DerivationDagViewer document={cached.content as DerivationDocument} />
          )}
          {cached.noteType === 'seq' && (
            <SequenceDiagramViewer content={cached.content as string} notePath={cached.notePath} />
          )}
          {cached.noteType === 'net' && (
            <NetworkEmbedViewer document={cached.content as NetworkDocument} />
          )}
          {cached.noteType && !['md', 'mind', 'derive', 'seq', 'net'].includes(cached.noteType) && (
            <div className="embed-card-error">⚠ Unknown embed type: {cached.noteType}</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="embed-card" data-node-id={nodeId} data-embed-path={embedPath} data-embed-status="loaded">
      <div className="embed-card-header">
        <span className="embed-card-badge">{cached.noteType || 'err'}</span>
        <span>{embedPath}</span>
      </div>
      <div className="embed-card-body">
        <div className="embed-card-error">⚠ Empty content</div>
      </div>
    </div>
  )
}

export const MindMapCanvas = forwardRef<MindMapCanvasHandle, MindMapCanvasProps>(
  function MindMapCanvas({ doc, notePath, selectedNodeId, collapsedIds, dispatch, onContextMenu, onHoverNode, onNavigateToCode }, ref) {
    const svgRef = useRef<SVGSVGElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const gElRef = useRef<SVGGElement | null>(null)
    const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
    const focusNodeIdRef = useRef<string | null>(null)
    const selectedNodeIdRef = useRef<string | null>(null)
    const embedOverlayRef = useRef<HTMLDivElement>(null)

    const [expandedEmbeds, setExpandedEmbeds] = useState<Set<string>>(new Set())
    const embedCacheRef = useRef<Map<string, ResolvedEmbed>>(new Map())
    const [embedCacheVersion, setEmbedCacheVersion] = useState(0)

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

    const resolveEmbed = useCallback(async (nodeId: string, embedRef: EmbedRef): Promise<ResolvedEmbed> => {
      const resolvedPath = resolveEmbedPath(notePath, embedRef.relativePath)
      const cacheKey = `${nodeId}::${resolvedPath}`

      if (embedCacheRef.current.has(cacheKey)) {
        return embedCacheRef.current.get(cacheKey)!
      }

      if (isCircularReference(notePath, resolvedPath)) {
        const err: ResolvedEmbed = {
          status: 'error',
          notePath: resolvedPath,
          noteType: null,
          errorMessage: `Circular reference: ${embedRef.relativePath}`
        }
        embedCacheRef.current.set(cacheKey, err)
        setEmbedCacheVersion(v => v + 1)
        return err
      }

      const noteType = inferEmbedType(resolvedPath)
      if (!noteType) {
        const err: ResolvedEmbed = {
          status: 'error',
          notePath: resolvedPath,
          noteType: null,
          errorMessage: `Unsupported type: ${embedRef.relativePath}`
        }
        embedCacheRef.current.set(cacheKey, err)
        setEmbedCacheVersion(v => v + 1)
        return err
      }

      const loading: ResolvedEmbed = { status: 'loading', notePath: resolvedPath, noteType }
      embedCacheRef.current.set(cacheKey, loading)
      setEmbedCacheVersion(v => v + 1)

      try {
        const content = await window.electronAPI.readNote(resolvedPath) as NoteContent
        const resolved: ResolvedEmbed = {
          status: 'loaded',
          notePath: resolvedPath,
          noteType,
          content
        }
        embedCacheRef.current.set(cacheKey, resolved)
        setEmbedCacheVersion(v => v + 1)
        return resolved
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        let errorMessage: string
        if (msg.includes('ENOENT') || msg.includes('not found') || msg.includes('does not exist')) {
          errorMessage = `File not found: ${embedRef.relativePath}`
        } else if (msg.includes('EACCES') || msg.includes('permission')) {
          errorMessage = `Cannot read: ${embedRef.relativePath}`
        } else {
          errorMessage = `Load error: ${embedRef.relativePath}`
        }
        const err: ResolvedEmbed = {
          status: 'error',
          notePath: resolvedPath,
          noteType,
          errorMessage
        }
        embedCacheRef.current.set(cacheKey, err)
        setEmbedCacheVersion(v => v + 1)
        return err
      }
    }, [notePath])

    const handleToggleEmbed = useCallback(async (nodeId: string, embedRef: EmbedRef) => {
      const resolvedPath = resolveEmbedPath(notePath, embedRef.relativePath)
      const cacheKey = `${nodeId}::${resolvedPath}`

      setExpandedEmbeds(prev => {
        const next = new Set(prev)
        if (next.has(cacheKey)) {
          next.delete(cacheKey)
          return next
        }
        next.add(cacheKey)
        return next
      })

      // Trigger resolution outside the setState callback
      if (!embedCacheRef.current.has(cacheKey)) {
        resolveEmbed(nodeId, embedRef)
      }
    }, [notePath, resolveEmbed])

    const syncEmbedPositions = useCallback(() => {
      const overlay = embedOverlayRef.current
      const container = containerRef.current
      const svg = svgRef.current
      if (!overlay || !container || !svg) return

      // Group cards by nodeId to stack them vertically
      const nodeCards = new Map<string, HTMLElement[]>()
      overlay.querySelectorAll<HTMLElement>('.embed-card').forEach(card => {
        const nodeId = card.getAttribute('data-node-id')
        if (!nodeId) return
        if (!nodeCards.has(nodeId)) nodeCards.set(nodeId, [])
        nodeCards.get(nodeId)!.push(card)
      })

      const viewportH = window.innerHeight

      nodeCards.forEach((cards, nodeId) => {
        const nodeEl = svg.querySelector<SVGGElement>(`[data-node-id="${nodeId}"]`)
        if (!nodeEl) return

        const nodeRect = nodeEl.getBoundingClientRect()
        let topOffset = nodeRect.bottom + 4

        cards.forEach((card) => {
          // Use position:fixed (viewport-relative) so the card isn't clipped
          // by the container's overflow:hidden
          card.style.position = 'fixed'
          card.style.zIndex = '100'
          card.style.top = `${topOffset}px`
          card.style.left = `${nodeRect.left}px`
          card.style.maxWidth = `${Math.min(480, window.innerWidth - nodeRect.left - 16)}px`

          // Constrain body so the card doesn't extend past the viewport bottom
          const body = card.querySelector('.embed-card-body') as HTMLElement
          const headerH = card.querySelector('.embed-card-header')?.getBoundingClientRect().height ?? 28
          const availForBody = viewportH - topOffset - headerH - 28
          if (body && availForBody > 60) {
            body.style.maxHeight = `${availForBody}px`
          }

          topOffset += card.getBoundingClientRect().height + 8
        })
      })
    }, [])

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

      // Adjust vertical spacing for nodes with embed toggles / expanded embed cards,
      // so the embed content doesn't overlap the next sibling node below.
      const embedHeights = new Map<string, number>()
      root.descendants().forEach(d => {
        const embeds = parseEmbeds(d.data.content || '')
        if (embeds.length === 0) {
          embedHeights.set(d.data.id, 0)
          return
        }
        let h = 0
        for (const embedRef of embeds) {
          const resolvedPath = resolveEmbedPath(notePath, embedRef.relativePath)
          const cacheKey = `${d.data.id}::${resolvedPath}`
          if (expandedEmbeds.has(cacheKey)) {
            h += 220 // reserved height per expanded embed card
          } else {
            h += 18  // height per collapsed embed toggle row
          }
        }
        embedHeights.set(d.data.id, h + 4) // 4px padding below the last embed element
      })

      const byDepth = new Map<number, d3.HierarchyNode<MindMapNode>[]>()
      root.descendants().forEach(d => {
        const arr = byDepth.get(d.depth) || []
        arr.push(d)
        byDepth.set(d.depth, arr)
      })

      const pushDown = new Map<string, number>()
      root.descendants().forEach(d => pushDown.set(d.data.id, 0))

      byDepth.forEach(nodes => {
        nodes.sort((a, b) => a.x! - b.x!)
        let cumulativeShift = 0
        for (let i = 0; i < nodes.length; i++) {
          if (cumulativeShift > 0) {
            pushDown.set(nodes[i].data.id, cumulativeShift)
          }
          if (i < nodes.length - 1) {
            const node = nodes[i]
            const nextNode = nodes[i + 1]
            const myEmbedHeight = embedHeights.get(node.data.id) || 0
            const currentGap = (nextNode.x! - node.x!) - 28 // 28 = node rect height
            if (myEmbedHeight > currentGap) {
              cumulativeShift += (myEmbedHeight - currentGap)
            }
          }
        }
      })

      function propagateShift(node: d3.HierarchyNode<MindMapNode>, inheritedShift: number) {
        const myPush = pushDown.get(node.data.id) || 0
        const totalShift = inheritedShift + myPush
        if (totalShift > 0) {
          node.x! += totalShift
        }
        if (node.children) {
          node.children.forEach(child => propagateShift(child, totalShift))
        }
      }
      propagateShift(root, 0)

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

        // Collapse button on branch line, near the fork (elbow)
        const btnX = elbowX - 20
        const btnY = parent.x!
        g.append('circle')
          .attr('cx', btnX)
          .attr('cy', btnY)
          .attr('r', 7)
          .attr('fill', '#3c3c3c')
          .attr('stroke', '#666')
          .attr('stroke-width', 1)
          .attr('class', 'mind-collapse-btn')
          .attr('data-collapse-owner-id', parentId)
          .attr('data-orig-cx', btnX)
          .attr('data-orig-cy', btnY)
          .style('cursor', 'pointer')
          .on('click', (event: MouseEvent) => {
            event.stopPropagation()
            dispatch({ type: 'TOGGLE_COLLAPSE', nodeId: parentId })
          })

        g.append('text')
          .attr('x', btnX)
          .attr('y', btnY + 3)
          .attr('text-anchor', 'middle')
          .attr('fill', '#aaa')
          .attr('font-size', '9px')
          .attr('class', 'mind-collapse-btn-text')
          .attr('data-collapse-owner-id', parentId)
          .attr('data-orig-x', btnX)
          .attr('data-orig-y', btnY + 3)
          .style('pointer-events', 'none')
          .text('▼')

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

      // Collapse indicator for collapsed nodes only (no visible children, so no branch line)
      nodeGroup.filter((d) => collapsedIds.has(d.data.id))
        .append('circle')
        .attr('cx', 82)
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

      nodeGroup.filter((d) => collapsedIds.has(d.data.id))
        .append('text')
        .attr('x', 82)
        .attr('y', 3)
        .attr('text-anchor', 'middle')
        .attr('fill', '#aaa')
        .attr('font-size', '9px')
        .style('pointer-events', 'none')
        .text('▶')

      // Title text
      nodeGroup.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', 4)
        .attr('fill', '#d4d4d4')
        .attr('font-size', '11px')
        .style('pointer-events', 'none')
        .text((d) => d.data.title.length > 22 ? d.data.title.slice(0, 20) + '..' : d.data.title)

      // Embed toggle indicators
      nodeGroup.each(function (d: d3.HierarchyNode<MindMapNode>) {
        if (!d.data.content) return
        const embeds = parseEmbeds(d.data.content)
        if (embeds.length === 0) return

        const g = d3.select(this)
        embeds.forEach((embedRef, i) => {
          const resolvedPath = resolveEmbedPath(notePath, embedRef.relativePath)
          const cacheKey = `${d.data.id}::${resolvedPath}`
          const isExpanded = expandedEmbeds.has(cacheKey)
          const cached = embedCacheRef.current.get(cacheKey)

          const indicatorY = 22 + i * 18  // Below the node rect (y=-14 to 14 is the rect, so 22 is 8px below)

          // Background rect for toggle row
          g.append('rect')
            .attr('x', -70)
            .attr('y', indicatorY)
            .attr('width', 140)
            .attr('height', 16)
            .attr('rx', 3)
            .attr('fill', cached?.status === 'error' ? '#3d2020' : '#2a2a2a')
            .attr('stroke', cached?.status === 'error' ? '#f44747' : '#444')
            .attr('stroke-width', 0.5)

          // Toggle arrow
          g.append('text')
            .attr('x', -62)
            .attr('y', indicatorY + 11)
            .attr('fill', cached?.status === 'error' ? '#f44747' : '#888')
            .attr('font-size', '9px')
            .style('pointer-events', 'none')
            .text(isExpanded ? '▼' : '▶')

          // Label text
          const label = cached?.errorMessage
            ? `⚠ ${cached.errorMessage}`
            : `📄 ${embedRef.relativePath}`
          g.append('text')
            .attr('x', -48)
            .attr('y', indicatorY + 12)
            .attr('fill', cached?.status === 'error' ? '#f44747' : '#aaa')
            .attr('font-size', '9px')
            .text(label.length > 28 ? label.slice(0, 26) + '..' : label)

          // Invisible click rect
          g.append('rect')
            .attr('x', -70)
            .attr('y', indicatorY)
            .attr('width', 140)
            .attr('height', 16)
            .attr('fill', 'transparent')
            .style('cursor', 'pointer')
            .on('click', (event: MouseEvent) => {
              event.stopPropagation()
              handleToggleEmbed(d.data.id, embedRef)
            })
        })
      })

      // Jump icon for code mapping
      nodeGroup.each(function (d: d3.HierarchyNode<MindMapNode>) {
        if (!d.data.codeMapping || !onNavigateToCode) return
        if (!d.data.codeMapping.filePath) return
        const g = d3.select(this)
        g.append('text')
          .attr('x', 55)
          .attr('y', -6)
          .attr('fill', '#4a90d9')
          .attr('font-size', '11px')
          .attr('font-weight', 'bold')
          .style('cursor', 'pointer')
          .text('→')
          .on('click', (event: MouseEvent) => {
            event.stopPropagation()
            onNavigateToCode(d.data.codeMapping!.filePath, d.data.codeMapping!.startLine)
          })
      })

      // --- Events ---

      nodeGroup.on('click', (event: MouseEvent, d: d3.HierarchyNode<MindMapNode>) => {
        event.stopPropagation()
        dispatch({ type: 'SELECT_NODE', nodeId: d.data.id })
      })

      nodeGroup.on('dblclick', (event: MouseEvent, d: d3.HierarchyNode<MindMapNode>) => {
        event.stopPropagation()
        if (d.data.codeMapping && onNavigateToCode && d.data.codeMapping.filePath) {
          onNavigateToCode(d.data.codeMapping.filePath, d.data.codeMapping.startLine)
        } else {
          dispatch({ type: 'SELECT_NODE', nodeId: d.data.id })
          focusNodeIdRef.current = d.data.id
          render()
        }
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
      let significantDrag = false

      // Drag target tracking
      let dragTargetNodeId: string | null = null
      let dragTargetAction: 'reparent' | 'reorder' | null = null
      let dragInsertIndex: number | null = null

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

      function clearDragHighlight() {
        const svgEl = svgRef.current
        if (!svgEl) return
        // Remove yellow border from all nodes
        svgEl.querySelectorAll('[data-node-id] rect').forEach((rect) => {
          const g = rect.parentElement
          const nodeId = g?.getAttribute('data-node-id')
          const isSelected = nodeId === selectedNodeIdRef.current
          const depth = g?.getAttribute('data-depth')
          const isRoot = depth === '0'
          rect.setAttribute('fill', isSelected ? '#094771' : (isRoot ? '#007acc' : '#3c3c3c'))
          rect.setAttribute('stroke', isSelected ? '#ff0' : (isRoot ? '#007acc' : '#555'))
          rect.setAttribute('stroke-width', isSelected ? '2' : '1')
        })
        // Restore sibling positions (remove any shift-down transform overrides)
        svgEl.querySelectorAll('[data-node-id]').forEach((el) => {
          const nodeId = (el as SVGGElement).getAttribute('data-node-id')
          const orig = originalPositions.get(nodeId || '')
          if (orig) {
            el.setAttribute('transform', `translate(${orig.y},${orig.x})`)
          }
        })
        dragTargetNodeId = null
        dragTargetAction = null
        dragInsertIndex = null
      }

      function highlightReparentTarget(targetId: string) {
        const svgEl = svgRef.current
        if (!svgEl) return
        const targetG = svgEl.querySelector(`[data-node-id="${targetId}"]`)
        if (!targetG) return
        const rect = targetG.querySelector('rect')
        if (rect) {
          rect.setAttribute('stroke', '#ff0')
          rect.setAttribute('stroke-width', '2')
        }
      }

      function shiftSiblingsForInsert(parentId: string, insertIndex: number, draggedNodeId: string) {
        const svgEl = svgRef.current
        if (!svgEl) return
        const siblings = svgEl.querySelectorAll(`[data-parent-id="${parentId}"]`)
        siblings.forEach((el) => {
          const sid = el.getAttribute('data-node-id')
          if (!sid || sid === draggedNodeId) return
          const orig = originalPositions.get(sid)
          if (!orig) return
          const parentInfo = findParentAndIndex(doc, sid)
          if (parentInfo && parentInfo.index >= insertIndex) {
            el.setAttribute('transform', `translate(${orig.y},${orig.x + 32})`)
          }
        })
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

          // Only treat as a real drag if the node has moved more than 5px
          if (dx * dx + dy * dy > 25) {
            significantDrag = true
          }

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

          // Move collapse buttons owned by the dragged node
          svgEl.querySelectorAll<SVGCircleElement>(
            `.mind-collapse-btn[data-collapse-owner-id="${d.data.id}"]`
          ).forEach(circle => {
            circle.setAttribute('cx', String(parseFloat(circle.getAttribute('data-orig-cx') || '0') + dx))
            circle.setAttribute('cy', String(parseFloat(circle.getAttribute('data-orig-cy') || '0') + dy))
          })
          svgEl.querySelectorAll<SVGTextElement>(
            `.mind-collapse-btn-text[data-collapse-owner-id="${d.data.id}"]`
          ).forEach(text => {
            text.setAttribute('x', String(parseFloat(text.getAttribute('data-orig-x') || '0') + dx))
            text.setAttribute('y', String(parseFloat(text.getAttribute('data-orig-y') || '0') + dy))
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

            // Move collapse buttons owned by descendants
            svgEl.querySelectorAll<SVGCircleElement>(
              `.mind-collapse-btn[data-collapse-owner-id="${descId}"]`
            ).forEach(circle => {
              circle.setAttribute('cx', String(parseFloat(circle.getAttribute('data-orig-cx') || '0') + dx))
              circle.setAttribute('cy', String(parseFloat(circle.getAttribute('data-orig-cy') || '0') + dy))
            })
            svgEl.querySelectorAll<SVGTextElement>(
              `.mind-collapse-btn-text[data-collapse-owner-id="${descId}"]`
            ).forEach(text => {
              text.setAttribute('x', String(parseFloat(text.getAttribute('data-orig-x') || '0') + dx))
              text.setAttribute('y', String(parseFloat(text.getAttribute('data-orig-y') || '0') + dy))
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

          // --- Hit detection for drop target ---
          const clientX = event.sourceEvent.clientX
          const clientY = event.sourceEvent.clientY
          const elementsUnderCursor = document.elementsFromPoint(clientX, clientY)

          // Clear previous drag highlight
          if (dragTargetNodeId) {
            clearDragHighlight()
            // Re-apply drag movement to dragged node and descendants (clearDragHighlight resets them)
            d3.select(this).attr('transform', `translate(${pt[0] - dragOffset.x},${pt[1] - dragOffset.y})`)
            descendantIds.forEach(id => {
              const el = svgEl.querySelector<SVGGElement>(`[data-node-id="${id}"]`)
              const orig = originalPositions.get(id)
              if (el && orig) {
                el.setAttribute('transform', `translate(${orig.y + dx},${orig.x + dy})`)
              }
            })
          }

          // Check for direct node overlap (reparent)
          // Use getBoundingClientRect so zoom transform is accounted for, and to
          // avoid false positives when the dragged node covers siblings from above.
          let foundTarget = false
          const allMindNodes = svgEl.querySelectorAll<SVGGElement>('.mind-node')
          for (const nodeEl of allMindNodes) {
            const targetId = nodeEl.getAttribute('data-node-id')
            if (!targetId || targetId === d.data.id || descendantIds.has(targetId)) continue
            const targetRect = nodeEl.getBoundingClientRect()
            if (clientX >= targetRect.left && clientX <= targetRect.right &&
                clientY >= targetRect.top && clientY <= targetRect.bottom) {
              // Prevent dragging onto own ancestor (would create cycle)
              const ancestors = new Set<string>()
              let current = d.parent
              while (current) {
                ancestors.add(current.data.id)
                current = current.parent
              }
              if (ancestors.has(targetId)) continue

              dragTargetNodeId = targetId
              dragTargetAction = 'reparent'
              highlightReparentTarget(targetId)
              foundTarget = true
              break
            }
          }

          // If no direct node hit, check for between-siblings reorder
          if (!foundTarget && d.parent) {
            const parentNodeId = d.parent.data.id
            const siblings = d.parent.children || []
            if (siblings.length > 0) {
              // Only allow reorder within the same parent (cross-parent reorder not supported)
              // Use zoom transform to correctly convert SVG positions to viewport
              const zoomTransform = d3.zoomTransform(svgEl)
              const svgRect = svgEl.getBoundingClientRect()
              let insertIdx = siblings.length
              for (let i = 0; i < siblings.length; i++) {
                if (siblings[i].data.id === d.data.id) continue
                const sibOrig = originalPositions.get(siblings[i].data.id)
                if (!sibOrig) continue
                // Convert sibling SVG position to viewport Y accounting for zoom
                const sibViewportY = svgRect.top + zoomTransform.applyY(sibOrig.x)
                if (clientY < sibViewportY) {
                  insertIdx = i
                  break
                }
              }
              // Adjust insertIdx to skip the dragged node's original position
              const draggedOrigIdx = siblings.findIndex(s => s.data.id === d.data.id)
              if (draggedOrigIdx >= 0 && insertIdx > draggedOrigIdx) {
                insertIdx--
              }
              if (insertIdx >= 0 && insertIdx !== draggedOrigIdx) {
                dragTargetAction = 'reorder'
                dragInsertIndex = insertIdx
                shiftSiblingsForInsert(parentNodeId, insertIdx, d.data.id)
              }
            }
          }
        })
        .on('end', function (_event: d3.D3DragEvent<SVGGElement, unknown, unknown>, d: d3.HierarchyNode<MindMapNode>) {
          dragOffset = null

          // Save before clearDragHighlight resets them
          const savedAction = dragTargetAction
          const savedTargetId = dragTargetNodeId
          const savedInsertIndex = dragInsertIndex

          clearDragHighlight()

          if (dragged) {
            dragged = false
            if (significantDrag) {
              significantDrag = false
              if (savedAction === 'reparent' && savedTargetId) {
                dispatch({ type: 'REPARENT', nodeId: d.data.id, newParentId: savedTargetId })
              } else if (savedAction === 'reorder' && savedInsertIndex !== null) {
                dispatch({ type: 'REORDER', nodeId: d.data.id, newIndex: savedInsertIndex })
              }
            }
            // Always re-render after drag (either action was dispatched or it snaps back)
            render()
          } else {
            // Pure click (no drag movement)
            const isSelected = d.data.id === selectedNodeIdRef.current
            d3.select(this).select('rect')
              .attr('stroke', isSelected ? '#ff0' : (d.depth === 0 ? '#007acc' : '#555'))
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
              d3.select(gElRef.current).attr('transform',
                `translate(${event.transform.x},${event.transform.y}) scale(${event.transform.k})`)
            }
            requestAnimationFrame(() => syncEmbedPositions())
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

    }, [doc, collapsedIds, dispatch, onContextMenu, onHoverNode, notePath, expandedEmbeds, handleToggleEmbed])
    // NOTE: selectedNodeId intentionally NOT in deps — selection highlight is
    // applied via the separate useEffect below, avoiding full D3 rebuild on click

    useEffect(() => { render(); requestAnimationFrame(() => syncEmbedPositions()) }, [render])

    // Build embed card props from current expanded + cache state
    const embedCards = useMemo(() => {
      const cards: Array<{ cacheKey: string; nodeId: string; embedPath: string; cached: ResolvedEmbed }> = []
      for (const cacheKey of expandedEmbeds) {
        const cached = embedCacheRef.current.get(cacheKey)
        if (!cached) continue
        const sepIdx = cacheKey.indexOf('::')
        cards.push({
          cacheKey,
          nodeId: cacheKey.slice(0, sepIdx),
          embedPath: cacheKey.slice(sepIdx + 2),
          cached
        })
      }
      return cards
    }, [expandedEmbeds, embedCacheVersion])

    // Position cards after React commits them to the DOM
    useLayoutEffect(() => {
      syncEmbedPositions()
    }, [embedCards, syncEmbedPositions])

    useEffect(() => {
      const container = containerRef.current
      if (!container) return
      const observer = new ResizeObserver(() => {
        render()
        requestAnimationFrame(() => syncEmbedPositions())
      })
      observer.observe(container)
      return () => observer.disconnect()
    }, [render, syncEmbedPositions])

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
        <div
          ref={embedOverlayRef}
          className="mindmap-embed-overlay"
        >
          {embedCards.map(({ cacheKey, cached }) => (
            <EmbedCard key={cacheKey} cacheKey={cacheKey} cached={cached} />
          ))}
        </div>
      </div>
    )
  }
)
