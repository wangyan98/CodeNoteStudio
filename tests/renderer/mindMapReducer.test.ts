import { describe, it, expect } from 'vitest'
import { mindMapReducer, findNode, getAncestorIds } from '../../src/renderer/src/components/editors/mindMapReducer'
import type { MindMapDocument } from '../../src/main/schemas/note-types'
import type { MindMapAction } from '../../src/renderer/src/components/editors/mindMapReducer'

function makeDoc(): MindMapDocument {
  return {
    type: 'mind',
    version: 1,
    root: {
      id: 'root-1',
      title: 'Root',
      content: '',
      children: [
        {
          id: 'child-1',
          title: 'Child 1',
          content: 'content one',
          children: []
        },
        {
          id: 'child-2',
          title: 'Child 2',
          content: '',
          children: [
            {
              id: 'grand-1',
              title: 'Grandchild',
              content: '',
              children: []
            }
          ]
        }
      ]
    }
  }
}

function dispatch(doc: MindMapDocument, action: MindMapAction): MindMapDocument {
  return mindMapReducer(doc, action)
}

describe('mindMapReducer', () => {
  describe('SELECT_NODE', () => {
    it('returns same doc (selectedNodeId tracked externally)', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'SELECT_NODE', nodeId: 'child-1' })
      expect(result).toEqual(doc)
    })
  })

  describe('UPDATE_TITLE', () => {
    it('updates title of an existing node', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'UPDATE_TITLE', nodeId: 'child-1', title: 'New Title' })
      expect(result.root.children[0].title).toBe('New Title')
    })
  })

  describe('UPDATE_CONTENT', () => {
    it('updates content of an existing node', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'UPDATE_CONTENT', nodeId: 'child-1', content: 'new content' })
      expect(result.root.children[0].content).toBe('new content')
    })
  })

  describe('ADD_CHILD', () => {
    it('adds a child node with default title', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'ADD_CHILD', parentId: 'child-1' })
      expect(result.root.children[0].children.length).toBe(1)
      expect(result.root.children[0].children[0].title).toBe('New Node')
    })
  })

  describe('ADD_SIBLING', () => {
    it('adds a sibling after the given node', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'ADD_SIBLING', nodeId: 'child-1' })
      expect(result.root.children.length).toBe(3)
      expect(result.root.children[1].title).toBe('New Node')
    })

    it('does nothing when trying to add sibling to root', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'ADD_SIBLING', nodeId: 'root-1' })
      expect(result).toEqual(doc)
    })
  })

  describe('DELETE_NODE', () => {
    it('deletes a node and its subtree', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'DELETE_NODE', nodeId: 'child-2' })
      expect(result.root.children.length).toBe(1)
      expect(result.root.children[0].id).toBe('child-1')
    })

    it('does nothing when trying to delete root', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'DELETE_NODE', nodeId: 'root-1' })
      expect(result).toEqual(doc)
    })
  })

  describe('REPARENT', () => {
    it('moves a node to a new parent', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'REPARENT', nodeId: 'grand-1', newParentId: 'child-1' })
      expect(result.root.children[0].children.length).toBe(1)
      expect(result.root.children[0].children[0].id).toBe('grand-1')
      expect(result.root.children[1].children.length).toBe(0)
    })

    it('rejects when reparent would create a cycle', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'REPARENT', nodeId: 'child-2', newParentId: 'grand-1' })
      expect(result).toEqual(doc)
    })
  })

  describe('REORDER', () => {
    it('reorders siblings', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'REORDER', nodeId: 'child-1', newIndex: 1 })
      expect(result.root.children[0].id).toBe('child-2')
      expect(result.root.children[1].id).toBe('child-1')
    })
  })

  describe('TOGGLE_COLLAPSE', () => {
    it('returns same doc (collapse state is external)', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'TOGGLE_COLLAPSE', nodeId: 'child-2' })
      expect(result).toEqual(doc)
    })
  })

  describe('SET_DOCUMENT', () => {
    it('replaces the entire document', () => {
      const old = makeDoc()
      const fresh = { type: 'mind' as const, version: 1 as const, root: { id: 'new-root', title: 'Fresh', content: '', children: [] } }
      const result = dispatch(old, { type: 'SET_DOCUMENT', document: fresh })
      expect(result.root.id).toBe('new-root')
    })
  })

  describe('immutability', () => {
    it('does not mutate the original document on UPDATE_TITLE', () => {
      const original = makeDoc()
      const originalJson = JSON.stringify(original)
      dispatch(original, { type: 'UPDATE_TITLE', nodeId: 'child-1', title: 'Changed' })
      expect(JSON.stringify(original)).toBe(originalJson)
    })

    it('does not mutate the original document on DELETE_NODE', () => {
      const original = makeDoc()
      const originalJson = JSON.stringify(original)
      dispatch(original, { type: 'DELETE_NODE', nodeId: 'child-2' })
      expect(JSON.stringify(original)).toBe(originalJson)
    })
  })
})

describe('findNode', () => {
  it('finds a node by id', () => {
    const doc = makeDoc()
    const node = findNode(doc, 'grand-1')
    expect(node?.id).toBe('grand-1')
    expect(node?.title).toBe('Grandchild')
  })

  it('returns null for non-existent id', () => {
    const doc = makeDoc()
    expect(findNode(doc, 'nonexistent')).toBeNull()
  })
})

describe('getAncestorIds', () => {
  it('returns ancestor ids from root to the node', () => {
    const doc = makeDoc()
    const ancestors = getAncestorIds(doc, 'grand-1')
    expect(ancestors).toEqual(['root-1', 'child-2'])
  })

  it('returns empty array for root', () => {
    const doc = makeDoc()
    expect(getAncestorIds(doc, 'root-1')).toEqual([])
  })
})
