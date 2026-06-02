import { v4 as uuidv4 } from 'uuid'

// --- Code Mapping ---

export interface CodeMapping {
  raw: string
  functionName: string
  filePath: string
  startLine: number
  endLine: number
}

// --- Mind Map (.mind.json) ---

export interface MindMapNode {
  id: string
  title: string
  content: string
  children: MindMapNode[]
}

export interface MindMapDocument {
  type: 'mind'
  version: 1
  root: MindMapNode
}

export function createMindMapNode(title = ''): MindMapNode {
  return {
    id: uuidv4(),
    title,
    content: '',
    children: []
  }
}

export function createMindMapDocument(): MindMapDocument {
  return {
    type: 'mind',
    version: 1,
    root: createMindMapNode('New Mind Map')
  }
}

export function isValidMindMapDocument(obj: unknown): obj is MindMapDocument {
  if (!obj || typeof obj !== 'object') return false
  const doc = obj as Record<string, unknown>
  return doc.type === 'mind' && doc.version === 1 && typeof doc.root === 'object'
}

// --- Derivation Tree (.derive.json) ---

export interface DerivationNode {
  id: string
  title: string
  content: string
  stepNumber: number
  derivesFrom: string | null
  derivesTo: string[]
  embedRefs: string[]
  codeMappings: CodeMapping[]
}

export interface DerivationDocument {
  type: 'derive'
  version: 1
  nodes: DerivationNode[]
}

export function createDerivationNode(title = ''): DerivationNode {
  return {
    id: uuidv4(),
    title,
    content: '',
    stepNumber: 0,
    derivesFrom: null,
    derivesTo: [],
    embedRefs: [],
    codeMappings: []
  }
}

export function createDerivationDocument(): DerivationDocument {
  return {
    type: 'derive',
    version: 1,
    nodes: []
  }
}

export function isValidDerivationDocument(obj: unknown): obj is DerivationDocument {
  if (!obj || typeof obj !== 'object') return false
  const doc = obj as Record<string, unknown>
  return doc.type === 'derive' && doc.version === 1 && Array.isArray(doc.nodes)
}

// --- Network Visualization (.net.json) ---

export interface LayerParams {
  [key: string]: string | number | boolean | number[]
}

export interface NetworkLayer {
  id: string
  type: string
  name?: string
  params: LayerParams
  inputShape?: string
  outputShape?: string
  codeMapping?: CodeMapping
}

export interface NetworkConnection {
  id: string
  from: string
  to: string
  label?: string
}

export interface NetworkBlock {
  id: string
  name: string
  repeat?: number
  layers: NetworkLayer[]
  connections: NetworkConnection[]
  skipConnections: NetworkConnection[]
  blocks: NetworkBlock[]
  codeMapping?: CodeMapping
}

export interface NetworkDocument {
  type: 'net'
  version: 1
  name: string
  inputShape: string
  blocks: NetworkBlock[]
  connections: NetworkConnection[]
}

export function createNetworkLayer(type = 'Linear'): NetworkLayer {
  return {
    id: uuidv4(),
    type,
    params: {}
  }
}

export function createNetworkBlock(name = 'New Block', repeat?: number): NetworkBlock {
  return {
    id: uuidv4(),
    name,
    repeat,
    layers: [],
    connections: [],
    skipConnections: [],
    blocks: []
  }
}

export function createNetworkDocument(name = 'New Network'): NetworkDocument {
  return {
    type: 'net',
    version: 1,
    name,
    inputShape: '',
    blocks: [],
    connections: []
  }
}

export function isValidNetworkDocument(obj: unknown): obj is NetworkDocument {
  if (!obj || typeof obj !== 'object') return false
  const doc = obj as Record<string, unknown>
  return doc.type === 'net' && doc.version === 1 && typeof doc.name === 'string' && Array.isArray(doc.blocks)
}
