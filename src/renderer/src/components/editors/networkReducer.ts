import type { NetworkDocument, NetworkBlock, CodeMapping } from '../../../../main/schemas/note-types'
import { createNetworkLayer, createNetworkBlock } from '../../../../main/schemas/note-types'

export interface NetworkAction {
  type: string
  document?: NetworkDocument
  name?: string
  shape?: string
  blockId?: string
  layerId?: string
  layerType?: string
  afterLayerId?: string
  afterBlockId?: string
  field?: string
  paramKey?: string
  value?: unknown
  codeMapping?: CodeMapping | null
}

function cloneDoc(doc: NetworkDocument): NetworkDocument {
  return {
    ...doc,
    blocks: doc.blocks.map(cloneBlock),
    connections: doc.connections.map(c => ({ ...c }))
  }
}

function cloneBlock(block: NetworkBlock): NetworkBlock {
  return {
    ...block,
    layers: block.layers.map(l => ({ ...l, params: { ...l.params }, codeMapping: l.codeMapping ? { ...l.codeMapping } : undefined })),
    connections: block.connections.map(c => ({ ...c })),
    skipConnections: block.skipConnections.map(c => ({ ...c })),
    blocks: block.blocks.map(cloneBlock)
  }
}

function updateBlockInPlace(blocks: NetworkBlock[], blockId: string, updater: (b: NetworkBlock) => NetworkBlock): NetworkBlock[] {
  return blocks.map(b => {
    if (b.id === blockId) return updater(b)
    if (b.blocks.length > 0) {
      const updated = updateBlockInPlace(b.blocks, blockId, updater)
      if (updated !== b.blocks) return { ...b, blocks: updated }
    }
    return b
  })
}

export function networkReducer(doc: NetworkDocument, action: NetworkAction): NetworkDocument {
  switch (action.type) {

    case 'SET_DOCUMENT':
      return cloneDoc(action.document!)

    case 'UPDATE_NETWORK_NAME':
      return { ...doc, name: action.name! }

    case 'UPDATE_INPUT_SHAPE':
      return { ...doc, inputShape: action.shape! }

    case 'ADD_LAYER': {
      const cloned = cloneDoc(doc)
      const block = cloned.blocks.find(b => b.id === action.blockId)
      if (!block) return doc
      const idx = action.afterLayerId
        ? block.layers.findIndex(l => l.id === action.afterLayerId)
        : block.layers.length - 1
      const newLayer = createNetworkLayer(action.layerType!)
      const layers = [...block.layers]
      layers.splice(idx >= 0 ? idx + 1 : layers.length, 0, newLayer)
      cloned.blocks = updateBlockInPlace(cloned.blocks, action.blockId!, b => ({ ...b, layers }))
      return cloned
    }

    case 'UPDATE_LAYER': {
      const cloned = cloneDoc(doc)
      cloned.blocks = updateBlockInPlace(cloned.blocks, action.blockId!, b => ({
        ...b,
        layers: b.layers.map(l => {
          if (l.id !== action.layerId!) return l
          if (action.field === 'params' && action.paramKey) {
            return { ...l, params: { ...l.params, [action.paramKey]: action.value } }
          }
          return { ...l, [action.field!]: action.value }
        })
      }))
      return cloned
    }

    case 'UPDATE_LAYER_CODE_MAPPING': {
      const cloned = cloneDoc(doc)
      cloned.blocks = updateBlockInPlace(cloned.blocks, action.blockId!, b => ({
        ...b,
        layers: b.layers.map(l =>
          l.id === action.layerId! ? { ...l, codeMapping: action.codeMapping ?? undefined } : l
        )
      }))
      return cloned
    }

    case 'DELETE_LAYER': {
      const cloned = cloneDoc(doc)
      cloned.blocks = updateBlockInPlace(cloned.blocks, action.blockId!, b => ({
        ...b,
        layers: b.layers.filter(l => l.id !== action.layerId!)
      }))
      return cloned
    }

    case 'ADD_BLOCK': {
      const cloned = cloneDoc(doc)
      const newBlock = createNetworkBlock(action.name || 'New Block')
      const idx = action.afterBlockId
        ? cloned.blocks.findIndex(b => b.id === action.afterBlockId)
        : cloned.blocks.length - 1
      const blocks = [...cloned.blocks]
      blocks.splice(idx >= 0 ? idx + 1 : blocks.length, 0, newBlock)
      return { ...cloned, blocks }
    }

    case 'UPDATE_BLOCK': {
      const cloned = cloneDoc(doc)
      cloned.blocks = updateBlockInPlace(cloned.blocks, action.blockId!, b => ({
        ...b,
        [action.field!]: action.value
      }))
      return cloned
    }

    case 'DELETE_BLOCK': {
      const cloned = cloneDoc(doc)
      return { ...cloned, blocks: cloned.blocks.filter(b => b.id !== action.blockId!) }
    }

    default:
      return doc
  }
}
