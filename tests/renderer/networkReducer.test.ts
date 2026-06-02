import { describe, it, expect } from 'vitest'
import { networkReducer } from '../../src/renderer/src/components/editors/networkReducer'
import type { NetworkAction } from '../../src/renderer/src/components/editors/networkReducer'
import type { NetworkDocument } from '../../src/main/schemas/note-types'
import { createNetworkDocument } from '../../src/main/schemas/note-types'

function makeDoc(): NetworkDocument {
  return {
    type: 'net',
    version: 1,
    name: 'TestNet',
    inputShape: '3×224×224',
    blocks: [
      {
        id: 'b1',
        name: 'Stem',
        layers: [
          { id: 'l1', type: 'Conv2d', params: { in_channels: 3, out_channels: 64, kernel_size: 7, stride: 2, padding: 3 } },
          { id: 'l2', type: 'BatchNorm2d', params: { num_features: 64 } },
          { id: 'l3', type: 'ReLU', params: { inplace: true } },
        ],
        connections: [],
        skipConnections: [],
        blocks: []
      }
    ],
    connections: []
  }
}

function dispatch(doc: NetworkDocument, action: NetworkAction): NetworkDocument {
  return networkReducer(doc, action)
}

describe('networkReducer', () => {
  describe('SET_DOCUMENT', () => {
    it('replaces the entire document', () => {
      const old = makeDoc()
      const fresh = createNetworkDocument('Fresh')
      const result = dispatch(old, { type: 'SET_DOCUMENT', document: fresh })
      expect(result.name).toBe('Fresh')
      expect(result.blocks.length).toBe(0)
    })
  })

  describe('UPDATE_NETWORK_NAME', () => {
    it('changes the network name', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'UPDATE_NETWORK_NAME', name: 'ResNet-50' })
      expect(result.name).toBe('ResNet-50')
    })
  })

  describe('UPDATE_INPUT_SHAPE', () => {
    it('changes the input shape', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'UPDATE_INPUT_SHAPE', shape: '1×28×28' })
      expect(result.inputShape).toBe('1×28×28')
    })
  })

  describe('ADD_LAYER', () => {
    it('adds a layer to a block', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'ADD_LAYER', blockId: 'b1', layerType: 'Linear', afterLayerId: 'l2' })
      expect(result.blocks[0].layers.length).toBe(4)
      expect(result.blocks[0].layers[2].type).toBe('Linear')
    })

    it('adds a layer at the end when no afterLayerId', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'ADD_LAYER', blockId: 'b1', layerType: 'Dropout' })
      expect(result.blocks[0].layers.length).toBe(4)
      expect(result.blocks[0].layers[3].type).toBe('Dropout')
    })

    it('does nothing for non-existent block', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'ADD_LAYER', blockId: 'bogus', layerType: 'Conv2d' })
      expect(result).toEqual(doc)
    })
  })

  describe('UPDATE_LAYER', () => {
    it('updates a layer parameter', () => {
      const doc = makeDoc()
      const result = dispatch(doc, {
        type: 'UPDATE_LAYER',
        blockId: 'b1', layerId: 'l1',
        field: 'params',
        paramKey: 'out_channels',
        value: 128
      })
      expect(result.blocks[0].layers[0].params.out_channels).toBe(128)
    })

    it('updates layer name', () => {
      const doc = makeDoc()
      const result = dispatch(doc, {
        type: 'UPDATE_LAYER',
        blockId: 'b1', layerId: 'l1',
        field: 'name',
        value: 'initial_conv'
      })
      expect(result.blocks[0].layers[0].name).toBe('initial_conv')
    })

    it('updates input shape', () => {
      const doc = makeDoc()
      const result = dispatch(doc, {
        type: 'UPDATE_LAYER',
        blockId: 'b1', layerId: 'l1',
        field: 'inputShape',
        value: '3×224×224'
      })
      expect(result.blocks[0].layers[0].inputShape).toBe('3×224×224')
    })
  })

  describe('UPDATE_LAYER_CODE_MAPPING', () => {
    it('sets a code mapping on a layer', () => {
      const doc = makeDoc()
      const mapping = {
        raw: 'models/resnet.py:conv1:42',
        functionName: 'conv1',
        filePath: 'models/resnet.py',
        startLine: 42,
        endLine: 43
      }
      const result = dispatch(doc, {
        type: 'UPDATE_LAYER_CODE_MAPPING',
        blockId: 'b1', layerId: 'l1',
        codeMapping: mapping
      })
      expect(result.blocks[0].layers[0].codeMapping).toEqual(mapping)
    })

    it('clears code mapping with null', () => {
      const doc = makeDoc()
      const withMapping = dispatch(doc, {
        type: 'UPDATE_LAYER_CODE_MAPPING',
        blockId: 'b1', layerId: 'l1',
        codeMapping: { raw: 'test', functionName: 'f', filePath: 'f.py', startLine: 1, endLine: 2 }
      })
      const cleared = dispatch(withMapping, {
        type: 'UPDATE_LAYER_CODE_MAPPING',
        blockId: 'b1', layerId: 'l1',
        codeMapping: null
      })
      expect(cleared.blocks[0].layers[0].codeMapping).toBeUndefined()
    })
  })

  describe('DELETE_LAYER', () => {
    it('deletes a layer from a block', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'DELETE_LAYER', blockId: 'b1', layerId: 'l2' })
      expect(result.blocks[0].layers.length).toBe(2)
      expect(result.blocks[0].layers[0].id).toBe('l1')
      expect(result.blocks[0].layers[1].id).toBe('l3')
    })
  })

  describe('ADD_BLOCK', () => {
    it('adds a block to the document', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'ADD_BLOCK', name: 'Stage2', afterBlockId: 'b1' })
      expect(result.blocks.length).toBe(2)
      expect(result.blocks[1].name).toBe('Stage2')
    })
  })

  describe('UPDATE_BLOCK', () => {
    it('updates block name', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'UPDATE_BLOCK', blockId: 'b1', field: 'name', value: 'NewStem' })
      expect(result.blocks[0].name).toBe('NewStem')
    })

    it('updates block repeat', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'UPDATE_BLOCK', blockId: 'b1', field: 'repeat', value: 3 })
      expect(result.blocks[0].repeat).toBe(3)
    })
  })

  describe('DELETE_BLOCK', () => {
    it('deletes a block', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'DELETE_BLOCK', blockId: 'b1' })
      expect(result.blocks.length).toBe(0)
    })
  })

  describe('immutability', () => {
    it('does not mutate original on ADD_LAYER', () => {
      const original = makeDoc()
      const origJson = JSON.stringify(original)
      dispatch(original, { type: 'ADD_LAYER', blockId: 'b1', layerType: 'Linear' })
      expect(JSON.stringify(original)).toBe(origJson)
    })

    it('does not mutate original on DELETE_LAYER', () => {
      const original = makeDoc()
      const origJson = JSON.stringify(original)
      dispatch(original, { type: 'DELETE_LAYER', blockId: 'b1', layerId: 'l2' })
      expect(JSON.stringify(original)).toBe(origJson)
    })
  })
})
