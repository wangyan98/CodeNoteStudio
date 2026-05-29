import { describe, it, expect } from 'vitest'
import { derivationReducer } from '../../src/renderer/src/components/editors/derivationReducer'
import type { DerivationAction } from '../../src/renderer/src/components/editors/derivationReducer'
import type { DerivationDocument } from '../../src/main/schemas/note-types'

function makeDoc(): DerivationDocument {
  return {
    type: 'derive',
    version: 1,
    nodes: [
      {
        id: 'n1',
        title: 'Problem Setup',
        content: '\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\varepsilon_0}',
        stepNumber: 1,
        derivesFrom: null,
        derivesTo: ['n2'],
        embedRefs: [],
        codeMappings: []
      },
      {
        id: 'n2',
        title: 'Derivation',
        content: '\\oint \\mathbf{E} \\cdot d\\mathbf{A}',
        stepNumber: 2,
        derivesFrom: 'n1',
        derivesTo: ['n3'],
        embedRefs: [],
        codeMappings: []
      },
      {
        id: 'n3',
        title: 'Result',
        content: '\\nabla \\cdot \\mathbf{E} = 0',
        stepNumber: 3,
        derivesFrom: 'n2',
        derivesTo: [],
        embedRefs: [],
        codeMappings: []
      }
    ]
  }
}

function dispatch(doc: DerivationDocument, action: DerivationAction): DerivationDocument {
  return derivationReducer(doc, action)
}

describe('derivationReducer', () => {
  describe('SET_DOCUMENT', () => {
    it('replaces the entire document', () => {
      const old = makeDoc()
      const fresh = { type: 'derive' as const, version: 1 as const, nodes: [] }
      const result = dispatch(old, { type: 'SET_DOCUMENT', document: fresh })
      expect(result.nodes.length).toBe(0)
    })
  })

  describe('UPDATE_NODE', () => {
    it('updates title of a node', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'UPDATE_NODE', nodeId: 'n1', field: 'title', value: 'New Title' })
      expect(result.nodes[0].title).toBe('New Title')
    })

    it('updates content of a node', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'UPDATE_NODE', nodeId: 'n2', field: 'content', value: '\\frac{1}{2}' })
      expect(result.nodes[1].content).toBe('\\frac{1}{2}')
    })
  })

  describe('SET_DERIVES_FROM', () => {
    it('changes the parent of a node', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'SET_DERIVES_FROM', nodeId: 'n3', parentId: 'n1' })
      const n3 = result.nodes.find((n) => n.id === 'n3')!
      expect(n3.derivesFrom).toBe('n1')
    })

    it('sets derivesFrom to null (root node)', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'SET_DERIVES_FROM', nodeId: 'n2', parentId: null })
      const n2 = result.nodes.find((n) => n.id === 'n2')!
      expect(n2.derivesFrom).toBeNull()
    })

    it('syncs derivesTo on the new parent', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'SET_DERIVES_FROM', nodeId: 'n3', parentId: 'n1' })
      const n1 = result.nodes.find((n) => n.id === 'n1')!
      expect(n1.derivesTo).toContain('n3')
    })

    it('removes derivesTo from the old parent', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'SET_DERIVES_FROM', nodeId: 'n3', parentId: 'n1' })
      const n2 = result.nodes.find((n) => n.id === 'n2')!
      expect(n2.derivesTo).not.toContain('n3')
    })

    it('rejects setting parent to self', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'SET_DERIVES_FROM', nodeId: 'n1', parentId: 'n1' })
      expect(result).toEqual(doc)
    })

    it('rejects cycles (setting n1 to derive from n3)', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'SET_DERIVES_FROM', nodeId: 'n1', parentId: 'n3' })
      expect(result).toEqual(doc)
    })
  })

  describe('ADD_NODE', () => {
    it('adds a node at the end', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'ADD_NODE', afterStepNumber: 3 })
      expect(result.nodes.length).toBe(4)
      expect(result.nodes[3].stepNumber).toBe(4)
      expect(result.nodes[3].title).toBe('New Step')
    })

    it('adds a node in the middle', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'ADD_NODE', afterStepNumber: 1 })
      expect(result.nodes.length).toBe(4)
      expect(result.nodes[1].stepNumber).toBe(2)
      expect(result.nodes[2].stepNumber).toBe(3)
    })

    it('adds a node at the beginning', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'ADD_NODE', afterStepNumber: 0 })
      expect(result.nodes.length).toBe(4)
      expect(result.nodes[0].stepNumber).toBe(1)
      expect(result.nodes[0].title).toBe('New Step')
    })

    it('recalculates all step numbers', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'ADD_NODE', afterStepNumber: 1 })
      expect(result.nodes[0].stepNumber).toBe(1)
      expect(result.nodes[1].stepNumber).toBe(2)
      expect(result.nodes[2].stepNumber).toBe(3)
      expect(result.nodes[3].stepNumber).toBe(4)
    })
  })

  describe('DELETE_NODE', () => {
    it('deletes a node', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'DELETE_NODE', nodeId: 'n2' })
      expect(result.nodes.length).toBe(2)
    })

    it('sets derivesFrom to null for children of deleted node', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'DELETE_NODE', nodeId: 'n2' })
      const n3 = result.nodes.find((n) => n.id === 'n3')!
      expect(n3.derivesFrom).toBeNull()
    })

    it('recalculates step numbers after delete', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'DELETE_NODE', nodeId: 'n1' })
      expect(result.nodes[0].stepNumber).toBe(1)
      expect(result.nodes[1].stepNumber).toBe(2)
    })

    it('does nothing for non-existent node', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'DELETE_NODE', nodeId: 'nonexistent' })
      expect(result.nodes.length).toBe(3)
    })
  })

  describe('REORDER_NODES', () => {
    it('moves a node from one position to another', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'REORDER_NODES', fromIndex: 0, toIndex: 2 })
      expect(result.nodes[0].id).toBe('n2')
      expect(result.nodes[1].id).toBe('n3')
      expect(result.nodes[2].id).toBe('n1')
    })

    it('recalculates step numbers after reorder', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'REORDER_NODES', fromIndex: 2, toIndex: 0 })
      expect(result.nodes[0].stepNumber).toBe(1)
      expect(result.nodes[1].stepNumber).toBe(2)
      expect(result.nodes[2].stepNumber).toBe(3)
    })

    it('does nothing for out-of-bounds indices', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'REORDER_NODES', fromIndex: 0, toIndex: 99 })
      expect(result).toEqual(doc)
    })

    it('does nothing when fromIndex equals toIndex', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'REORDER_NODES', fromIndex: 1, toIndex: 1 })
      expect(result).toEqual(doc)
    })
  })

  describe('immutability', () => {
    it('does not mutate original document on UPDATE_NODE', () => {
      const original = makeDoc()
      const originalJson = JSON.stringify(original)
      dispatch(original, { type: 'UPDATE_NODE', nodeId: 'n1', field: 'title', value: 'Changed' })
      expect(JSON.stringify(original)).toBe(originalJson)
    })

    it('does not mutate original document on DELETE_NODE', () => {
      const original = makeDoc()
      const originalJson = JSON.stringify(original)
      dispatch(original, { type: 'DELETE_NODE', nodeId: 'n2' })
      expect(JSON.stringify(original)).toBe(originalJson)
    })

    it('does not mutate original document on ADD_NODE', () => {
      const original = makeDoc()
      const originalJson = JSON.stringify(original)
      dispatch(original, { type: 'ADD_NODE', afterStepNumber: 1 })
      expect(JSON.stringify(original)).toBe(originalJson)
    })
  })
})
