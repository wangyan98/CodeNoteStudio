import { v4 as uuidv4 } from 'uuid'

// --- Code Mapping ---

export interface CodeMapping {
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
  embedRefs: string[]
  codeMappings: CodeMapping[]
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
    children: [],
    embedRefs: [],
    codeMappings: []
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
