import type { MindMapDocument, MindMapNode } from '../../../../main/schemas/note-types'
import { createMindMapNode } from '../../../../main/schemas/note-types'

export interface MindMapAction {
  type: string
  nodeId?: string
  title?: string
  content?: string
  parentId?: string
  newParentId?: string
  newIndex?: number
  document?: MindMapDocument
  childId?: string
}

// --- Tree navigation helpers ---

export function findNode(doc: MindMapDocument, id: string): MindMapNode | null {
  return findNodeInTree(doc.root, id)
}

function findNodeInTree(node: MindMapNode, id: string): MindMapNode | null {
  if (node.id === id) return node
  for (const child of node.children) {
    const found = findNodeInTree(child, id)
    if (found) return found
  }
  return null
}

function findParentAndIndex(doc: MindMapDocument, nodeId: string): { parent: MindMapNode; index: number } | null {
  return findParentInTree(doc.root, nodeId, null, 0)
}

function findParentInTree(
  node: MindMapNode,
  targetId: string,
  parent: MindMapNode | null,
  siblingIndex: number
): { parent: MindMapNode; index: number } | null {
  if (node.id === targetId && parent) return { parent, index: siblingIndex }
  for (let i = 0; i < node.children.length; i++) {
    const found = findParentInTree(node.children[i], targetId, node, i)
    if (found) return found
  }
  return null
}

export function getAncestorIds(doc: MindMapDocument, nodeId: string): string[] {
  const ancestors: string[] = []
  findAncestors(doc.root, nodeId, ancestors)
  return ancestors
}

function findAncestors(node: MindMapNode, targetId: string, ancestors: string[]): boolean {
  if (node.id === targetId) return true
  ancestors.push(node.id)
  for (const child of node.children) {
    if (findAncestors(child, targetId, ancestors)) return true
  }
  ancestors.pop()
  return false
}

function cloneNode(node: MindMapNode): MindMapNode {
  return {
    ...node,
    children: node.children.map(cloneNode)
  }
}

function cloneDoc(doc: MindMapDocument): MindMapDocument {
  return { ...doc, root: cloneNode(doc.root) }
}

function isAncestor(doc: MindMapDocument, nodeId: string, potentialAncestorId: string): boolean {
  const ancestors = getAncestorIds(doc, nodeId)
  return ancestors.includes(potentialAncestorId) || nodeId === potentialAncestorId
}

function updateNodeInClone(node: MindMapNode, targetId: string, updater: (n: MindMapNode) => MindMapNode): MindMapNode {
  if (node.id === targetId) return updater(node)
  return {
    ...node,
    children: node.children.map((child) => updateNodeInClone(child, targetId, updater))
  }
}

function deleteNodeFromClone(node: MindMapNode, targetId: string): MindMapNode {
  return {
    ...node,
    children: node.children
      .filter((child) => child.id !== targetId)
      .map((child) => deleteNodeFromClone(child, targetId))
  }
}

function removeNodeFromParent(node: MindMapNode, targetId: string): { updatedRoot: MindMapNode; removed: MindMapNode } | null {
  const index = node.children.findIndex((c) => c.id === targetId)
  if (index >= 0) {
    return {
      updatedRoot: {
        ...node,
        children: [...node.children.slice(0, index), ...node.children.slice(index + 1)]
      },
      removed: node.children[index]
    }
  }
  for (const child of node.children) {
    const found = removeNodeFromParent(child, targetId)
    if (found) {
      return {
        updatedRoot: { ...node, children: node.children.map((c) => c.id === child.id ? found.updatedRoot : c) },
        removed: found.removed
      }
    }
  }
  return null
}

// --- Reducer ---

export function mindMapReducer(doc: MindMapDocument, action: MindMapAction): MindMapDocument {
  switch (action.type) {
    case 'SELECT_NODE':
    case 'TOGGLE_COLLAPSE':
      return doc

    case 'UPDATE_TITLE': {
      const cloned = cloneDoc(doc)
      cloned.root = updateNodeInClone(cloned.root, action.nodeId!, (n) => ({ ...n, title: action.title! }))
      return cloned
    }

    case 'UPDATE_CONTENT': {
      const cloned = cloneDoc(doc)
      cloned.root = updateNodeInClone(cloned.root, action.nodeId!, (n) => ({ ...n, content: action.content! }))
      return cloned
    }

    case 'ADD_CHILD': {
      const child = action.childId
        ? { ...createMindMapNode('New Node'), id: action.childId }
        : createMindMapNode('New Node')
      const cloned = cloneDoc(doc)
      cloned.root = updateNodeInClone(cloned.root, action.parentId!, (n) => ({
        ...n,
        children: [...n.children, child]
      }))
      return cloned
    }

    case 'ADD_SIBLING': {
      const parentInfo = findParentAndIndex(doc, action.nodeId!)
      if (!parentInfo) return doc
      const sibling = action.childId
        ? { ...createMindMapNode('New Node'), id: action.childId }
        : createMindMapNode('New Node')
      const cloned = cloneDoc(doc)
      cloned.root = updateNodeInClone(cloned.root, parentInfo.parent.id, (n) => {
        const updated = [...n.children]
        updated.splice(parentInfo.index + 1, 0, sibling)
        return { ...n, children: updated }
      })
      return cloned
    }

    case 'DELETE_NODE': {
      if (action.nodeId === doc.root.id) return doc
      const cloned = cloneDoc(doc)
      cloned.root = deleteNodeFromClone(cloned.root, action.nodeId!)
      return cloned
    }

    case 'REPARENT': {
      if (isAncestor(doc, action.newParentId!, action.nodeId!)) return doc
      const cloned = cloneDoc(doc)
      const result = removeNodeFromParent(cloned.root, action.nodeId!)
      if (!result) return doc
      cloned.root = result.updatedRoot
      cloned.root = updateNodeInClone(cloned.root, action.newParentId!, (n) => ({
        ...n,
        children: action.index !== undefined
          ? [...n.children.slice(0, action.index), result.removed, ...n.children.slice(action.index)]
          : [...n.children, result.removed]
      }))
      return cloned
    }

    case 'REORDER': {
      if (action.newIndex === undefined || action.newIndex < 0) return doc
      const parentInfo = findParentAndIndex(doc, action.nodeId!)
      if (!parentInfo) return doc
      const cloned = cloneDoc(doc)
      cloned.root = updateNodeInClone(cloned.root, parentInfo.parent.id, (n) => {
        const updated = [...n.children]
        const [moved] = updated.splice(parentInfo.index, 1)
        updated.splice(action.newIndex!, 0, moved)
        return { ...n, children: updated }
      })
      return cloned
    }

    case 'SET_DOCUMENT':
      return cloneDoc(action.document!)

    default:
      return doc
  }
}
