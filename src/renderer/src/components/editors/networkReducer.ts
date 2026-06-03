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
      // If parentId is set, add as child of that block, chaining to last child
      if (action.parentId) {
        return {
          ...cloned,
          nodes: (cloned.nodes ?? []).map(n => {
            if (n.id !== action.parentId) return n
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
          }),
        }
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
