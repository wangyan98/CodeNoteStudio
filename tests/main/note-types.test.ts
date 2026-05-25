import { describe, it, expect } from 'vitest'
import {
  createMindMapDocument,
  createDerivationDocument,
  createMindMapNode,
  createDerivationNode,
  isValidMindMapDocument,
  isValidDerivationDocument
} from '../../src/main/schemas/note-types'

describe('MindMapDocument', () => {
  it('createMindMapDocument returns a valid empty document', () => {
    const doc = createMindMapDocument()
    expect(doc.type).toBe('mind')
    expect(doc.version).toBe(1)
    expect(doc.root.id).toBeDefined()
    expect(doc.root.title).toBe('New Mind Map')
    expect(doc.root.children).toEqual([])
    expect(doc.root.embedRefs).toEqual([])
    expect(doc.root.codeMappings).toEqual([])
  })

  it('createMindMapNode generates a unique id', () => {
    const node1 = createMindMapNode('Topic A')
    const node2 = createMindMapNode('Topic B')
    expect(node1.id).toBeDefined()
    expect(node1.id).not.toBe(node2.id)
  })

  it('isValidMindMapDocument validates correctly', () => {
    const doc = createMindMapDocument()
    expect(isValidMindMapDocument(doc)).toBe(true)
  })

  it('isValidMindMapDocument rejects null', () => {
    expect(isValidMindMapDocument(null)).toBe(false)
  })

  it('isValidMindMapDocument rejects wrong type', () => {
    expect(isValidMindMapDocument({ type: 'derive', version: 1 })).toBe(false)
  })
})

describe('DerivationDocument', () => {
  it('createDerivationDocument returns a valid empty document', () => {
    const doc = createDerivationDocument()
    expect(doc.type).toBe('derive')
    expect(doc.version).toBe(1)
    expect(doc.nodes).toEqual([])
  })

  it('createDerivationNode sets stepNumber to 0', () => {
    const node = createDerivationNode('Step 1')
    expect(node.stepNumber).toBe(0)
    expect(node.title).toBe('Step 1')
    expect(node.derivesFrom).toBeNull()
    expect(node.derivesTo).toEqual([])
  })

  it('isValidDerivationDocument validates correctly', () => {
    const doc = createDerivationDocument()
    expect(isValidDerivationDocument(doc)).toBe(true)
  })
})
