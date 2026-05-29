import type { DerivationDocument, DerivationNode } from '../../../../main/schemas/note-types'
import { createDerivationNode } from '../../../../main/schemas/note-types'

export interface DerivationAction {
  type: string
  field?: 'title' | 'content'
  value?: string
  nodeId?: string
  parentId?: string | null
  afterStepNumber?: number
  fromIndex?: number
  toIndex?: number
  document?: DerivationDocument
}

function cloneDoc(doc: DerivationDocument): DerivationDocument {
  return {
    ...doc,
    nodes: doc.nodes.map((n) => ({ ...n, embedRefs: [...n.embedRefs], codeMappings: [...n.codeMappings], derivesTo: [...n.derivesTo] }))
  }
}

function getDescendantIds(nodes: DerivationNode[], nodeId: string): Set<string> {
  const childrenOf = new Map<string, DerivationNode[]>()
  for (const n of nodes) {
    const key = n.derivesFrom ?? '__root__'
    if (!childrenOf.has(key)) childrenOf.set(key, [])
    childrenOf.get(key)!.push(n)
  }
  const desc = new Set<string>()
  const stack = [nodeId]
  while (stack.length > 0) {
    const cur = stack.pop()!
    for (const child of childrenOf.get(cur) ?? []) {
      if (!desc.has(child.id)) {
        desc.add(child.id)
        stack.push(child.id)
      }
    }
  }
  return desc
}

function recalcStepNumbers(nodes: DerivationNode[]): DerivationNode[] {
  return nodes.map((n, i) => ({ ...n, stepNumber: i + 1 }))
}

function syncDerivesTo(nodes: DerivationNode[]): DerivationNode[] {
  return nodes.map((n) => ({
    ...n,
    derivesTo: nodes.filter((other) => other.derivesFrom === n.id).map((other) => other.id)
  }))
}

export function derivationReducer(doc: DerivationDocument, action: DerivationAction): DerivationDocument {
  switch (action.type) {

    case 'SET_DOCUMENT':
      return cloneDoc(action.document!)

    case 'UPDATE_NODE': {
      const cloned = cloneDoc(doc)
      cloned.nodes = cloned.nodes.map((n) =>
        n.id === action.nodeId! ? { ...n, [action.field!]: action.value! } : n
      )
      return cloned
    }

    case 'SET_DERIVES_FROM': {
      if (action.nodeId === action.parentId) return doc

      // Prevent cycles: reject if new parent is a descendant of this node
      if (action.parentId) {
        const descendants = getDescendantIds(doc.nodes, action.nodeId!)
        if (descendants.has(action.parentId)) return doc
      }

      const cloned = cloneDoc(doc)
      cloned.nodes = cloned.nodes.map((n) =>
        n.id === action.nodeId! ? { ...n, derivesFrom: action.parentId ?? null } : n
      )
      return { ...cloned, nodes: syncDerivesTo(cloned.nodes) }
    }

    case 'ADD_NODE': {
      const afterStep = action.afterStepNumber ?? 0
      const newNode = createDerivationNode('New Step')
      const cloned = cloneDoc(doc)
      cloned.nodes.splice(afterStep, 0, newNode)
      return { ...cloned, nodes: syncDerivesTo(recalcStepNumbers(cloned.nodes)) }
    }

    case 'DELETE_NODE': {
      const cloned = cloneDoc(doc)
      const nodeToDelete = cloned.nodes.find((n) => n.id === action.nodeId!)
      if (!nodeToDelete) return doc

      cloned.nodes = cloned.nodes.filter((n) => n.id !== action.nodeId!)
      // Clear derivesFrom for children
      cloned.nodes = cloned.nodes.map((n) =>
        n.derivesFrom === action.nodeId! ? { ...n, derivesFrom: null } : n
      )
      return { ...cloned, nodes: syncDerivesTo(recalcStepNumbers(cloned.nodes)) }
    }

    case 'REORDER_NODES': {
      if (action.fromIndex === undefined || action.toIndex === undefined) return doc
      if (action.fromIndex === action.toIndex) return doc
      if (action.fromIndex < 0 || action.toIndex < 0) return doc
      if (action.fromIndex >= doc.nodes.length || action.toIndex >= doc.nodes.length) return doc

      const cloned = cloneDoc(doc)
      const [moved] = cloned.nodes.splice(action.fromIndex, 1)
      cloned.nodes.splice(action.toIndex, 0, moved)
      return { ...cloned, nodes: syncDerivesTo(recalcStepNumbers(cloned.nodes)) }
    }

    default:
      return doc
  }
}
