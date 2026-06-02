import { describe, it, expect } from 'vitest'
import {
  createMindMapDocument,
  createDerivationDocument,
  createMindMapNode,
  createDerivationNode,
  isValidMindMapDocument,
  isValidDerivationDocument,
  createNetworkDocument,
  createNetworkLayer,
  createNetworkBlock,
  isValidNetworkDocument
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

describe('NetworkDocument', () => {
  it('createNetworkDocument returns a valid empty document', () => {
    const doc = createNetworkDocument()
    expect(doc.type).toBe('net')
    expect(doc.version).toBe(1)
    expect(doc.name).toBe('New Network')
    expect(doc.inputShape).toBe('')
    expect(doc.blocks).toEqual([])
    expect(doc.connections).toEqual([])
  })

  it('createNetworkLayer generates a unique id', () => {
    const layer1 = createNetworkLayer('Conv2d')
    const layer2 = createNetworkLayer('Conv2d')
    expect(layer1.id).toBeDefined()
    expect(layer1.id).not.toBe(layer2.id)
    expect(layer1.type).toBe('Conv2d')
    expect(layer1.params).toEqual({})
  })

  it('createNetworkBlock returns a block with unique id', () => {
    const block = createNetworkBlock('ResidualBlock')
    expect(block.id).toBeDefined()
    expect(block.name).toBe('ResidualBlock')
    expect(block.layers).toEqual([])
    expect(block.connections).toEqual([])
    expect(block.skipConnections).toEqual([])
    expect(block.blocks).toEqual([])
  })

  it('createNetworkBlock supports repeat', () => {
    const block = createNetworkBlock('ResidualBlock', 3)
    expect(block.repeat).toBe(3)
  })

  it('isValidNetworkDocument validates correctly', () => {
    const doc = createNetworkDocument()
    expect(isValidNetworkDocument(doc)).toBe(true)
  })

  it('isValidNetworkDocument rejects null', () => {
    expect(isValidNetworkDocument(null)).toBe(false)
  })

  it('isValidNetworkDocument rejects wrong type', () => {
    expect(isValidNetworkDocument({ type: 'mind', version: 1 })).toBe(false)
  })

  it('isValidNetworkDocument rejects missing blocks', () => {
    expect(isValidNetworkDocument({ type: 'net', version: 1, name: 'test', inputShape: '', connections: [] })).toBe(false)
  })
})
