# Network Graph Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `.net.json` from linear block/layer hierarchy to full DAG with GraphNode/GraphEdge, dagre auto-layout, port drag-connect, and edit-panel connection management.

**Architecture:** Replace `NetworkBlock`/`NetworkLayer`/`NetworkConnection` with unified `GraphNode` (kind: input|output|layer|block) + `GraphEdge` (style: forward|skip). Canvas uses dagre for DAG layout then D3 for SVG rendering. Connections created via SVG port-drag or panel dropdown. v1 files get a fallback message.

**Tech Stack:** React 18, TypeScript 5, D3.js, dagre, Electron 33

---

### Task 1: Install dagre dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install dagre and its types**

```bash
cd /Users/wangyan/Desktop/note && npm install dagre && npm install -D @types/dagre
```

- [ ] **Step 2: Verify install**

```bash
node -e "const dagre = require('dagre'); console.log('dagre loaded:', typeof dagre.layout);"
```
Expected: `dagre loaded: function`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add dagre and @types/dagre for DAG layout"
```

---

### Task 2: Define GraphNode, GraphEdge, v2 NetworkDocument types

**Files:**
- Modify: `src/main/schemas/note-types.ts`

- [ ] **Step 1: Add new types after the existing NetworkBlock interface**

Add to `src/main/schemas/note-types.ts` after line 138 (after `connections` field in NetworkDocument):

```typescript
// --- Network Graph Model (v2) ---

export type NodeKind = 'input' | 'output' | 'layer' | 'block'

export interface GraphNode {
  id: string
  kind: NodeKind
  label: string
  layerType?: string
  params?: LayerParams
  inputShape?: string
  outputShape?: string
  repeat?: number
  children?: GraphNode[]
  internalEdges?: GraphEdge[]
  codeMapping?: CodeMapping
}

export type EdgeStyle = 'forward' | 'skip'

export interface GraphEdge {
  id: string
  source: string
  target: string
  label?: string
  style: EdgeStyle
}
```

- [ ] **Step 2: Update NetworkDocument to v2**

Replace the existing `NetworkDocument` interface (lines 131-138) with:

```typescript
export interface NetworkDocument {
  type: 'net'
  version: 1 | 2
  name: string
  // v1 fields (kept for type compatibility, unused in v2)
  inputShape?: string
  blocks?: NetworkBlock[]
  connections?: NetworkConnection[]
  // v2 fields
  nodes?: GraphNode[]
  edges?: GraphEdge[]
}
```

- [ ] **Step 3: Update createNetworkDocument to produce v2 by default**

Replace the existing `createNetworkDocument` function:

```typescript
export function createNetworkDocument(name = 'New Network'): NetworkDocument {
  return {
    type: 'net',
    version: 2,
    name,
    nodes: [
      { id: uuidv4(), kind: 'input', label: 'Input' },
      { id: uuidv4(), kind: 'output', label: 'Output' },
    ],
    edges: [],
    inputShape: '',
    blocks: [],
    connections: [],
  }
}
```

- [ ] **Step 4: Update isValidNetworkDocument**

Replace the existing `isValidNetworkDocument` function:

```typescript
export function isValidNetworkDocument(obj: unknown): obj is NetworkDocument {
  if (!obj || typeof obj !== 'object') return false
  const doc = obj as Record<string, unknown>
  if (doc.type !== 'net') return false
  if (doc.version === 1) return typeof doc.name === 'string' && Array.isArray(doc.blocks)
  if (doc.version === 2) return typeof doc.name === 'string' && Array.isArray(doc.nodes)
  return false
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /Users/wangyan/Desktop/note && npx tsc --noEmit -p tsconfig.web.json 2>&1 | head -30
```
Expected: only existing errors (if any), no new errors from note-types.ts

- [ ] **Step 6: Commit**

```bash
git add src/main/schemas/note-types.ts
git commit -m "feat: add GraphNode/GraphEdge types and v2 NetworkDocument"
```

---

### Task 3: Rewrite networkReducer for graph actions

**Files:**
- Modify: `src/renderer/src/components/editors/networkReducer.ts`

- [ ] **Step 1: Rewrite the entire file**

Replace all content of `src/renderer/src/components/editors/networkReducer.ts` with:

```typescript
import type { NetworkDocument, GraphNode, GraphEdge } from '../../../../main/schemas/note-types'
import { v4 as uuidv4 } from 'uuid'

export interface NetworkAction {
  type: string
  document?: NetworkDocument
  name?: string
  nodeId?: string
  node?: GraphNode
  kind?: GraphNode['kind']
  layerType?: string
  field?: string
  paramKey?: string
  value?: unknown
  source?: string
  target?: string
  edge?: GraphEdge
}

function cloneDoc(doc: NetworkDocument): NetworkDocument {
  return structuredClone(doc)
}

export function networkReducer(doc: NetworkDocument, action: NetworkAction): NetworkDocument {
  switch (action.type) {

    case 'SET_DOCUMENT':
      return cloneDoc(action.document!)

    case 'UPDATE_NETWORK_NAME':
      return { ...doc, name: action.name! }

    case 'ADD_NODE': {
      const cloned = cloneDoc(doc)
      const newNode: GraphNode = {
        id: uuidv4(),
        kind: action.kind ?? 'layer',
        label: action.name ?? action.layerType ?? 'New Node',
        layerType: action.layerType,
        params: {},
      }
      return { ...cloned, nodes: [...(cloned.nodes ?? []), newNode] }
    }

    case 'DELETE_NODE': {
      const cloned = cloneDoc(doc)
      const nodeId = action.nodeId!
      return {
        ...cloned,
        nodes: (cloned.nodes ?? []).filter(n => n.id !== nodeId),
        edges: (cloned.edges ?? []).filter(e => e.source !== nodeId && e.target !== nodeId),
      }
    }

    case 'UPDATE_NODE': {
      const cloned = cloneDoc(doc)
      return {
        ...cloned,
        nodes: (cloned.nodes ?? []).map(n => {
          if (n.id !== action.nodeId!) return n
          if (action.field === 'params' && action.paramKey) {
            return { ...n, params: { ...n.params, [action.paramKey]: action.value } }
          }
          return { ...n, [action.field!]: action.value }
        }),
      }
    }

    case 'ADD_EDGE': {
      const cloned = cloneDoc(doc)
      const newEdge: GraphEdge = {
        id: uuidv4(),
        source: action.source!,
        target: action.target!,
        style: 'forward',
      }
      // Avoid duplicate edges
      const exists = (cloned.edges ?? []).some(
        e => e.source === newEdge.source && e.target === newEdge.target
      )
      if (exists) return cloned
      return { ...cloned, edges: [...(cloned.edges ?? []), newEdge] }
    }

    case 'DELETE_EDGE': {
      const cloned = cloneDoc(doc)
      return {
        ...cloned,
        edges: (cloned.edges ?? []).filter(e => e.id !== action.edge?.id),
      }
    }

    case 'UPDATE_EDGE_STYLE': {
      const cloned = cloneDoc(doc)
      return {
        ...cloned,
        edges: (cloned.edges ?? []).map(e =>
          e.id === action.edge?.id ? { ...e, style: action.value as GraphEdge['style'] } : e
        ),
      }
    }

    default:
      return doc
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/wangyan/Desktop/note && npx tsc --noEmit -p tsconfig.web.json 2>&1 | grep networkReducer | head -10
```
Expected: no errors from networkReducer.ts

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/editors/networkReducer.ts
git commit -m "feat: rewrite networkReducer for graph node/edge actions"
```

---

### Task 4: v1 compatibility fallback in NetworkEditor

**Files:**
- Modify: `src/renderer/src/components/editors/NetworkEditor.tsx`

- [ ] **Step 1: Add v1 fallback at top of NetworkEditor component**

In `src/renderer/src/components/editors/NetworkEditor.tsx`, at the beginning of the component body (after hooks but before the main return), add a v1 check:

```tsx
  // v1 compatibility: show message for old-format documents
  if (initialDoc.version === 1 || !initialDoc.nodes) {
    return (
      <div className="network-editor">
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100%', color: '#888', fontSize: 13, flexDirection: 'column', gap: 8
        }}>
          <p>This file uses an older format (v1).</p>
          <p>Create a new .net.json file for the graph editor.</p>
        </div>
      </div>
    )
  }
```

This must be placed AFTER the hooks (`useReducer`, `useState`, `useEffect`, `useCallback`, `useMemo`) but BEFORE the main `return` JSX that renders the toolbar/palette/canvas/panel.

- [ ] **Step 2: Update useReducer to use initialDoc for v2**

Change the `useReducer` line (currently around line 23) from:
```tsx
const [doc, dispatch] = useReducer(networkReducer, initialDoc)
```
to:
```tsx
const [doc, dispatch] = useReducer(networkReducer, initialDoc.version === 2 ? initialDoc : createNetworkDocument())
```

Make sure `createNetworkDocument` is imported (it already should be if it was re-exported, or add to the import from `note-types`).

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/wangyan/Desktop/note && npx tsc --noEmit -p tsconfig.web.json 2>&1 | grep NetworkEditor | head -10
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/editors/NetworkEditor.tsx
git commit -m "feat: add v1 compatibility fallback message in NetworkEditor"
```

---

### Task 5: Canvas — dagre layout + node rendering

**Files:**
- Modify: `src/renderer/src/components/editors/NetworkCanvas.tsx`

- [ ] **Step 1: Add dagre import and layout helper**

Replace the current imports and constants at the top of `NetworkCanvas.tsx`:

```tsx
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
```

- [ ] **Step 2: Rewrite the render function for dagre-based layout and node rendering**

Replace the entire `render` callback and related logic. Key changes:
- Use `runLayout()` to get positions
- Render nodes by `kind` with different styles
- Render edges after nodes (so edges are below nodes in z-order)

The existing `render` function (~lines 46-239) should be replaced. Here's the new render:

```tsx
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
    const contentH = maxY - minY + 80
    const offsetX = (W - contentW) / 2 - minX + 40
    const offsetY = 30 - minY

    const g = svg.append('g').attr('class', 'canvas-content')

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => { g.attr('transform', event.transform.toString()) })
    svg.call(zoom)

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
        // Open arrowhead
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
          .attr('text-anchor', 'middle').attr('fill', kind === 'output' ? '#333' : '#333')
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
    }

    // Background click to deselect
    svg.on('click', () => { onSelectNode(null) })

  }, [doc, catalog, selectedNodeId, onSelectNode])
```

- [ ] **Step 3: Update component props interface and destructuring**

The existing `NetworkCanvasProps` should be replaced with the new interface from Step 1. Update the function signature to destructure the new props:

```tsx
export function NetworkCanvas({
  doc, catalog, selectedNodeId,
  onSelectNode, onDropLayer, onDeleteNode, onAddEdge
}: NetworkCanvasProps) {
```

- [ ] **Step 4: Remove old drop handler and keyboard handler for now**

Remove the existing `handleDragOver`, `handleDrop`, and keyboard `Delete` useEffect (these will be re-added properly in later tasks). For now, keep an empty placeholder:

```tsx
  // Drag-over for palette items
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
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /Users/wangyan/Desktop/note && npx tsc --noEmit -p tsconfig.web.json 2>&1 | grep -E "NetworkCanvas|error" | head -20
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/editors/NetworkCanvas.tsx
git commit -m "feat: dagre layout + graph node/edge rendering in NetworkCanvas"
```

---

### Task 6: Canvas — port dots + drag-connect interaction

**Files:**
- Modify: `src/renderer/src/components/editors/NetworkCanvas.tsx`

- [ ] **Step 1: Add port dot rendering to the node rendering code**

After the node `on('click')` in the render function, add port dot circles inside `nodeG`:

```tsx
      // Port dots
      const portRadius = 3
      // Output port (right side) — not for output nodes
      if (node.kind !== 'output') {
        nodeG.append('circle')
          .attr('class', 'net-port-out')
          .attr('cx', nx + nw).attr('cy', ny + nh / 2)
          .attr('r', portRadius).attr('fill', color)
          .attr('stroke', '#333').attr('stroke-width', 0.5)
          .style('opacity', 0.5)
          .style('cursor', 'crosshair')
          .on('mouseenter', function() { d3.select(this).style('opacity', 1).attr('r', 5) })
          .on('mouseleave', function() { d3.select(this).style('opacity', 0.5).attr('r', portRadius) })
      }
      // Input port (left side) — not for input nodes
      if (node.kind !== 'input') {
        nodeG.append('circle')
          .attr('class', 'net-port-in')
          .attr('cx', nx).attr('cy', ny + nh / 2)
          .attr('r', portRadius).attr('fill', color)
          .attr('stroke', '#333').attr('stroke-width', 0.5)
          .style('opacity', 0.5)
          .style('cursor', 'crosshair')
          .on('mouseenter', function() { d3.select(this).style('opacity', 1).attr('r', 5) })
          .on('mouseleave', function() { d3.select(this).style('opacity', 0.5).attr('r', portRadius) })
      }
```

- [ ] **Step 2: Add drag-connect interaction state and logic**

Add a ref to track the drag-connect state at the top of the component (next to other refs):

```tsx
  const dragConnectRef = useRef<{
    active: boolean
    sourceNodeId: string | null
    line: d3.Selection<SVGLineElement, unknown, null, undefined> | null
  }>({ active: false, sourceNodeId: null, line: null })
```

Now add the drag-connect event handlers. These go AFTER the render function but BEFORE the return statement:

```tsx
  // Drag-connect from output ports
  const handlePortMouseDown = useCallback((event: React.MouseEvent) => {
    const target = event.target as SVGElement
    if (!target.classList.contains('net-port-out')) return
    const nodeG = target.closest('.net-node') as SVGElement | null
    if (!nodeG) return
    const nodeId = nodeG.getAttribute('data-node-id')
    if (!nodeId) return

    event.preventDefault()
    event.stopPropagation()

    const svg = svgRef.current
    const container = containerRef.current
    if (!svg || !container) return

    const transform = d3.zoomTransform(svg)
    const rect = container.getBoundingClientRect()
    const startX = (event.clientX - rect.left - transform.x) / transform.k
    const startY = (event.clientY - rect.top - transform.y) / transform.k

    dragConnectRef.current.active = true
    dragConnectRef.current.sourceNodeId = nodeId

    const g = d3.select(svg).select('.canvas-content')
    const line = g.append('line')
      .attr('x1', startX).attr('y1', startY)
      .attr('x2', startX).attr('y2', startY)
      .attr('stroke', '#4a90d9').attr('stroke-width', 2)
      .attr('stroke-dasharray', '4,2')
    dragConnectRef.current.line = line

    const onMove = (ev: MouseEvent) => {
      if (!dragConnectRef.current.active) return
      const mx = (ev.clientX - rect.left - transform.x) / transform.k
      const my = (ev.clientY - rect.top - transform.y) / transform.k
      line.attr('x2', mx).attr('y2', my)
    }

    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      dragConnectRef.current.active = false
      line.remove()
      dragConnectRef.current.line = null

      // Hit-test: find input port under cursor
      const mx = (ev.clientX - rect.left - transform.x) / transform.k
      const my = (ev.clientY - rect.top - transform.y) / transform.k
      const elements = document.elementsFromPoint(ev.clientX, ev.clientY)
      for (const el of elements) {
        if (el.classList.contains('net-port-in')) {
          const targetNodeG = el.closest('.net-node') as SVGElement | null
          const targetId = targetNodeG?.getAttribute('data-node-id')
          if (targetId && dragConnectRef.current.sourceNodeId) {
            onAddEdge(dragConnectRef.current.sourceNodeId, targetId)
          }
          break
        }
      }
      dragConnectRef.current.sourceNodeId = null
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [onAddEdge])
```

- [ ] **Step 3: Attach mousedown handler to SVG container**

In the return JSX, add `onMouseDown={handlePortMouseDown}` to the container div:

```tsx
    <div
      className="network-canvas-container"
      ref={containerRef}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onMouseDown={handlePortMouseDown}
    >
      <svg ref={svgRef} />
    </div>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/wangyan/Desktop/note && npx tsc --noEmit -p tsconfig.web.json 2>&1 | grep -E "NetworkCanvas|error TS" | head -20
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/editors/NetworkCanvas.tsx
git commit -m "feat: port dots + drag-connect interaction on canvas"
```

---

### Task 7: Update NetworkEditor — wire up new props + toolbar buttons

**Files:**
- Modify: `src/renderer/src/components/editors/NetworkEditor.tsx`

- [ ] **Step 1: Replace state management for graph model**

Replace `selectedBlockId`/`selectedLayerId` with `selectedNodeId`, and update the handlers. Find the existing state declarations and replace:

```tsx
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
```

Remove: `selectedBlockId`, `selectedLayerId` state lines.

- [ ] **Step 2: Update handlers to use graph model**

Replace the existing handler functions with graph-model versions:

```tsx
  const handleSelectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId)
  }, [])

  const handleDropLayer = useCallback((layerType: string) => {
    dispatch({ type: 'ADD_NODE', kind: 'layer', layerType, name: layerType })
  }, [])

  const handleDeleteNode = useCallback((nodeId: string) => {
    dispatch({ type: 'DELETE_NODE', nodeId })
    setSelectedNodeId(null)
  }, [])

  const handleAddEdge = useCallback((source: string, target: string) => {
    dispatch({ type: 'ADD_EDGE', source, target })
  }, [])
```

- [ ] **Step 3: Update the selected node / selected layer def lookups**

Replace the old `selectedLayer`/`selectedBlock`/`selectedLayerDef` memoized values:

```tsx
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null
    return (doc.nodes ?? []).find(n => n.id === selectedNodeId) || null
  }, [doc.nodes, selectedNodeId])

  const selectedNodeDef = useMemo(() => {
    if (!selectedNode || selectedNode.kind !== 'layer' || !selectedNode.layerType) return undefined
    return getLayerDef(selectedNode.layerType, catalogOverrides)
  }, [selectedNode, catalogOverrides])
```

- [ ] **Step 4: Add "+Input" and "+Output" toolbar buttons**

In the toolbar JSX, add the new buttons after the "Add Block" button:

```tsx
        <button className="network-editor-btn" onClick={() => dispatch({ type: 'ADD_NODE', kind: 'input', name: 'Input' })}>
          + Input
        </button>
        <button className="network-editor-btn" onClick={() => dispatch({ type: 'ADD_NODE', kind: 'output', name: 'Output' })}>
          + Output
        </button>
```

- [ ] **Step 5: Update the NetworkCanvas JSX props**

Replace the old `NetworkCanvas` usage with:

```tsx
        <NetworkCanvas
          doc={doc}
          catalog={catalog}
          selectedNodeId={selectedNodeId}
          onSelectNode={handleSelectNode}
          onDropLayer={handleDropLayer}
          onDeleteNode={handleDeleteNode}
          onAddEdge={handleAddEdge}
        />
```

- [ ] **Step 6: Update the NetworkPanel JSX props (pass node instead of block/layer)**

For now, pass `selectedNode` to the panel. The panel will be updated in the next task:

```tsx
        <NetworkPanel
          node={selectedNode}
          nodeDef={selectedNodeDef}
          onUpdateNode={(nodeId, field, value, paramKey?) => dispatch({ type: 'UPDATE_NODE', nodeId, field, paramKey, value })}
          onAddEdge={handleAddEdge}
          onResolveRef={handleResolveRef}
          resolvedMapping={resolvedMapping}
        />
```

- [ ] **Step 7: Remove unused old props**

Remove references to `handleSelectLayer`, `handleSelectBlock`, `handleUpdateBlock`, `handleUpdateParam`, `handleUpdateInputShape`, `handleUpdateOutputShape`, `handleUpdateCodeMapping`, `handleUpdateLayerName`, `handleDeleteLayer`, `handlePanelResize`, `panelHeight`, `setPanelHeight` — these will be consolidated or handled differently.

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd /Users/wangyan/Desktop/note && npx tsc --noEmit -p tsconfig.web.json 2>&1 | grep -E "NetworkEditor|error TS" | head -20
```

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/components/editors/NetworkEditor.tsx
git commit -m "feat: wire up graph model in NetworkEditor with +Input/+Output buttons"
```

---

### Task 8: Update NetworkPanel for graph node editing + connection management

**Files:**
- Modify: `src/renderer/src/components/editors/NetworkPanel.tsx`

- [ ] **Step 1: Update props interface**

Replace the existing `NetworkPanelProps` interface:

```tsx
interface NetworkPanelProps {
  node: GraphNode | null
  nodeDef: LayerDef | undefined
  onUpdateNode: (nodeId: string, field: string, value: unknown, paramKey?: string) => void
  onAddEdge: (source: string, target: string) => void
  onResolveRef: (raw: string) => void
  resolvedMapping: CodeMapping | null
}
```

Make sure `GraphNode`, `LayerDef`, `CodeMapping` are imported.

- [ ] **Step 2: Rewrite the component body**

Replace the existing function body with graph-model aware rendering that handles all node kinds:

```tsx
export function NetworkPanel({
  node, nodeDef, onUpdateNode, onAddEdge, onResolveRef, resolvedMapping
}: NetworkPanelProps) {

  if (!node) {
    return (
      <div className="network-panel">
        <div className="network-panel-empty">Select a node to edit</div>
      </div>
    )
  }

  const params = nodeDef?.params ?? []

  return (
    <div className="network-panel">
      <div className="network-panel-main">
        <div className="network-panel-header">
          <span className="network-panel-layer-type" style={{ color: node.kind === 'block' ? '#ff9800' : (nodeDef?.color ?? '#888') }}>
            {node.kind === 'input' ? 'Input' : node.kind === 'output' ? 'Output' : node.kind === 'block' ? 'Block' : node.layerType ?? 'Node'}
          </span>
          <input
            className="network-panel-name-input"
            value={node.label}
            onChange={(e) => onUpdateNode(node.id, 'label', e.target.value)}
            placeholder="Node label"
          />
        </div>

        {/* Layer params (kind='layer' only) */}
        {node.kind === 'layer' && params.length > 0 && (
          <div className="network-panel-params">
            <div className="network-panel-section-title">Parameters</div>
            <div className="network-panel-params-grid">
              {params.map(p => renderField(node, p, (key, val) => onUpdateNode(node.id, 'params', val, key)))}
            </div>
          </div>
        )}

        {node.kind === 'layer' && params.length === 0 && (
          <div className="network-panel-params">
            <div className="network-panel-section-title">Parameters</div>
            <span className="network-panel-no-params">This layer has no parameters</span>
          </div>
        )}

        {/* Block settings */}
        {node.kind === 'block' && (
          <div className="network-panel-params">
            <div className="network-panel-section-title">Block Settings</div>
            <div className="network-panel-params-grid">
              <div className="network-panel-field" style={{ gridColumn: 'span 3' }}>
                <label className="network-panel-field-label">Name</label>
                <input
                  className="network-panel-input"
                  type="text"
                  value={node.label}
                  onChange={(e) => onUpdateNode(node.id, 'label', e.target.value)}
                />
              </div>
              <div className="network-panel-field">
                <label className="network-panel-field-label">Repeat</label>
                <input
                  className="network-panel-input"
                  type="number"
                  value={node.repeat ?? 1}
                  min={1}
                  onChange={(e) => onUpdateNode(node.id, 'repeat', Math.max(1, Number(e.target.value)))}
                />
              </div>
            </div>
          </div>
        )}

        {/* Input/Output node settings */}
        {(node.kind === 'input' || node.kind === 'output') && (
          <div className="network-panel-params">
            <div className="network-panel-section-title">Settings</div>
            <div className="network-panel-params-grid">
              <div className="network-panel-field" style={{ gridColumn: 'span 2' }}>
                <label className="network-panel-field-label">Label</label>
                <input
                  className="network-panel-input"
                  type="text"
                  value={node.label}
                  onChange={(e) => onUpdateNode(node.id, 'label', e.target.value)}
                />
              </div>
              <div className="network-panel-field" style={{ gridColumn: 'span 2' }}>
                <label className="network-panel-field-label">Shape</label>
                <input
                  className="network-panel-input"
                  type="text"
                  value={node.inputShape ?? ''}
                  onChange={(e) => onUpdateNode(node.id, 'inputShape', e.target.value)}
                  placeholder="e.g., 3×224×224"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Side: Code mapping + Tensor shapes (layer only) */}
      {node.kind === 'layer' && (
        <div className="network-panel-side">
          <div className="network-panel-section-title">Code Mapping</div>
          <input
            className="network-panel-input"
            value={node.codeMapping?.raw ?? ''}
            onChange={(e) => {
              const raw = e.target.value
              if (raw) { onResolveRef(raw) }
              else { onUpdateNode(node.id, 'codeMapping', null) }
            }}
            placeholder="@ref(path:name:line)"
          />
          {resolvedMapping && (
            <div className="network-panel-resolved-ref">
              → {resolvedMapping.filePath}:{resolvedMapping.startLine}
            </div>
          )}
          <div className="network-panel-section-title" style={{ marginTop: 12 }}>Tensor Shapes</div>
          <div className="network-panel-shapes">
            <input
              className="network-panel-input"
              value={node.inputShape || ''}
              onChange={(e) => onUpdateNode(node.id, 'inputShape', e.target.value)}
              placeholder="input (e.g., 64×56×56)"
            />
            <span className="network-panel-shape-arrow">→</span>
            <input
              className="network-panel-input"
              value={node.outputShape || ''}
              onChange={(e) => onUpdateNode(node.id, 'outputShape', e.target.value)}
              placeholder="output"
            />
          </div>
        </div>
      )}
    </div>
  )
}
```

The `renderField` function stays the same (already defined in the file).

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/wangyan/Desktop/note && npx tsc --noEmit -p tsconfig.web.json 2>&1 | grep -E "NetworkPanel|error TS" | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/editors/NetworkPanel.tsx
git commit -m "feat: update NetworkPanel for graph node editing (all node kinds)"
```

---

### Task 9: Update NetworkEmbedViewer for v2 support

**Files:**
- Modify: `src/renderer/src/components/editors/NetworkEmbedViewer.tsx`

- [ ] **Step 1: Add v2 rendering path**

In `NetworkEmbedViewer`, after the existing imports and before the component return, add a v2 check. If `document.version === 2`, render nodes in a simplified static DAG layout (no interaction):

```tsx
export function NetworkEmbedViewer({ document, onNavigateToCode }: NetworkEmbedViewerProps) {
  const catalog = useMemo(() => resolveLayerCatalog(null), [])

  // v2: render nodes simply in a vertical flow
  if (document.version === 2 && document.nodes) {
    return (
      <div style={{
        padding: 12, fontFamily: 'monospace', fontSize: 10, lineHeight: 1.4,
        overflow: 'auto', background: '#1e1e1e', color: '#d4d4d4', borderRadius: 6
      }}>
        <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 8, color: '#ff9800' }}>
          {document.name}
        </div>
        {document.nodes.map((node, i) => (
          <div key={node.id} style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
            {i > 0 && <div style={{ textAlign: 'center', color: '#888', fontSize: 12, width: '100%' }}>↓</div>}
            <span style={{
              display: 'inline-block', padding: '4px 12px', borderRadius: 6,
              border: `2px solid ${node.kind === 'input' || node.kind === 'output' ? '#666' :
                node.kind === 'block' ? '#ff9800' :
                node.layerType ? (catalog[node.layerType]?.color ?? '#888') : '#888'
              }`,
              background: node.kind === 'input' || node.kind === 'output' ? '#f5f5f5' :
                node.layerType ? (catalog[node.layerType]?.color ?? '#888') + '22' : 'none',
              color: node.kind === 'input' || node.kind === 'output' ? '#333' : '#d4d4d4',
              fontWeight: 'bold', fontSize: 9, minWidth: 60, textAlign: 'center',
              cursor: node.codeMapping && onNavigateToCode ? 'pointer' : 'default'
            }}
              title={node.codeMapping ? `${node.codeMapping.filePath}:${node.codeMapping.startLine}` : node.label}
              onClick={() => {
                if (node.codeMapping && onNavigateToCode) {
                  onNavigateToCode(node.codeMapping.filePath, node.codeMapping.startLine)
                }
              }}
            >
              <span>{node.label}</span>
            </span>
          </div>
        ))}
      </div>
    )
  }

  // v1: keep existing rendering code (unchanged)
  return ( ... existing v1 code ... )
```

The existing v1 code after this v2 block stays as-is.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/wangyan/Desktop/note && npx tsc --noEmit -p tsconfig.web.json 2>&1 | grep NetworkEmbedViewer | head -10
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/editors/NetworkEmbedViewer.tsx
git commit -m "feat: add v2 static embed rendering to NetworkEmbedViewer"
```

---

### Task 10: Keyboard Delete handler + cleanup

**Files:**
- Modify: `src/renderer/src/components/editors/NetworkEditor.tsx`

- [ ] **Step 1: Add keyboard Delete handler for selected node**

In `NetworkEditor.tsx`, add a `useEffect` for keyboard handling:

```tsx
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        e.preventDefault()
        dispatch({ type: 'DELETE_NODE', nodeId: selectedNodeId })
        setSelectedNodeId(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedNodeId])
```

- [ ] **Step 2: Verify the app boots without errors**

```bash
cd /Users/wangyan/Desktop/note && npx tsc --noEmit -p tsconfig.web.json 2>&1 | grep -E "error TS" | head -20
```

Expected: no new TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/editors/NetworkEditor.tsx
git commit -m "feat: keyboard Delete handler for graph nodes"
```

---

### Task 11: End-to-end smoke test

- [ ] **Step 1: Start the dev server and verify no crash**

```bash
cd /Users/wangyan/Desktop/note && npm run dev 2>&1 &
```

- [ ] **Step 2: Manual verification checklist**

In the running app:
1. Create a new `.net.json` note → should open with Input + Output nodes and dagre layout
2. Drag a layer pill from palette → layer node appears, auto-connected if a node was selected
3. Click "+ Input" / "+ Output" / "+ Add Block" → new nodes appear
4. Click port dot, drag to another node's port → edge appears
5. Select a layer node → edit panel shows parameters
6. Select a block node → edit panel shows name + repeat
7. Select then press Delete → node and its edges removed
8. Open an old v1 `.net.json` → shows fallback message, no crash

- [ ] **Step 3: Commit if needed**

```bash
# Any final fixes from smoke testing
git status
```
