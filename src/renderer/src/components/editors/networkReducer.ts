import type { NetworkDocument, GraphNode, GraphEdge } from '../../../../main/schemas/note-types'
import { v4 as uuidv4 } from 'uuid'

export interface NetworkAction {
  type: string
  document?: NetworkDocument
  name?: string
  nodeId?: string
  parentId?: string
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

/** Recursively find a block node by id anywhere in the tree. */
function findBlockInTree(nodes: GraphNode[], id: string): GraphNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children) {
      const found = findBlockInTree(n.children, id)
      if (found) return found
    }
  }
  return null
}

/** Recursively remove a node by id from the tree. Returns new nodes array and whether a removal happened. */
function removeNodeFromTree(
  nodes: GraphNode[],
  id: string
): { nodes: GraphNode[]; removed: boolean } {
  let removed = false
  const filtered = nodes.filter(n => {
    if (n.id === id) {
      removed = true
      return false
    }
    return true
  })
  if (removed) return { nodes: filtered, removed: true }

  // Recurse into children
  let childRemoved = false
  const updated = filtered.map(n => {
    if (!n.children) return n
    const result = removeNodeFromTree(n.children, id)
    if (!result.removed) return n
    childRemoved = true
    // Clean internalEdges referencing the removed node
    const cleanEdges = (n.internalEdges ?? []).filter(
      e => e.source !== id && e.target !== id
    )
    return { ...n, children: result.nodes, internalEdges: cleanEdges }
  })
  return { nodes: updated, removed: childRemoved }
}

/** Recursively map nodes, applying updater when nodeId matches. */
function updateNodeInTree(
  nodes: GraphNode[],
  nodeId: string,
  updater: (n: GraphNode) => GraphNode
): GraphNode[] {
  return nodes.map(n => {
    if (n.id === nodeId) return updater(n)
    if (n.children) {
      const childIdx = n.children.findIndex(c => c.id === nodeId)
      if (childIdx !== -1) {
        // Direct child match — update inline
        const newChildren = [...n.children]
        newChildren[childIdx] = updater(n.children[childIdx])
        return { ...n, children: newChildren }
      }
      // Recurse deeper
      return { ...n, children: updateNodeInTree(n.children, nodeId, updater) }
    }
    return n
  })
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
        id: action.nodeId ?? uuidv4(),
        kind: action.kind ?? 'layer',
        label: action.name ?? action.layerType ?? 'New Node',
        layerType: action.layerType,
        params: {},
      }
      // New block nodes get children/edges arrays
      if (action.kind === 'block') {
        newNode.children = []
      }
      // If parentId is set, add as child of that block (recursive lookup)
      if (action.parentId) {
        const addChild = (nodes: GraphNode[]): GraphNode[] =>
          nodes.map(n => {
            if (n.id === action.parentId) {
              const prevChildren = n.children ?? []
              const newInternalEdge: GraphEdge | null = prevChildren.length > 0
                ? { id: uuidv4(), source: prevChildren[prevChildren.length - 1].id, target: newNode.id, style: 'forward' }
                : null
              return {
                ...n,
                children: [...prevChildren, newNode],
                internalEdges: newInternalEdge
                  ? [...(n.internalEdges ?? []), newInternalEdge]
                  : (n.internalEdges ?? []),
              }
            }
            if (n.children) return { ...n, children: addChild(n.children) }
            return n
          })
        return { ...cloned, nodes: addChild(cloned.nodes ?? []) }
      }
      return { ...cloned, nodes: [...(cloned.nodes ?? []), newNode] }
    }

    case 'DELETE_NODE': {
      const cloned = cloneDoc(doc)
      const nodeId = action.nodeId!
      // Recursively remove from nodes tree
      const { nodes: newNodes } = removeNodeFromTree(cloned.nodes ?? [], nodeId)
      return {
        ...cloned,
        nodes: newNodes,
        edges: (cloned.edges ?? []).filter(e => e.source !== nodeId && e.target !== nodeId),
      }
    }

    case 'UPDATE_NODE': {
      const cloned = cloneDoc(doc)
      return {
        ...cloned,
        nodes: updateNodeInTree(cloned.nodes ?? [], action.nodeId!, (n) => {
          if (action.field === 'params' && action.paramKey) {
            return { ...n, params: { ...n.params, [action.paramKey]: action.value } } as GraphNode
          }
          return { ...n, [action.field!]: action.value } as GraphNode
        }),
      }
    }

    case 'ADD_EDGE': {
      const cloned = cloneDoc(doc)
      const newEdge: GraphEdge = {
        id: action.edge?.id ?? uuidv4(),
        source: action.source!,
        target: action.target!,
        style: action.value as GraphEdge['style'] ?? 'forward',
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
