import { Parser, Language } from 'web-tree-sitter'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

export interface CodeSymbol {
  name: string
  kind: 'function' | 'method' | 'class' | 'interface' | 'type' | 'variable' | 'enum' | 'unknown'
  filePath: string
  startLine: number
  endLine: number
  startColumn: number
  endColumn: number
  parentName?: string
}

let parser: Parser | null = null
const languageCache = new Map<string, Language>()

const EXT_TO_LANG: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.hpp': 'cpp',
  '.cxx': 'cpp'
}

function getGrammarDir(): string {
  // Try multiple locations for the grammar WASM files
  const candidates = [
    path.join(process.cwd(), 'assets', 'tree-sitter'),
    path.join(__dirname, '..', '..', 'assets', 'tree-sitter'),
    path.join(__dirname, '..', '..', '..', 'assets', 'tree-sitter')
  ]

  for (const dir of candidates) {
    const jsWasm = path.join(dir, 'tree-sitter-javascript.wasm')
    if (existsSync(jsWasm)) {
      return dir
    }
  }

  // Fallback: use process.cwd() which should be the project root during dev/test
  return path.join(process.cwd(), 'assets', 'tree-sitter')
}

export async function initParser(): Promise<Parser> {
  if (parser) return parser

  await Parser.init()
  parser = new Parser()

  const grammarDir = getGrammarDir()

  const langMap: Record<string, string> = {
    javascript: 'tree-sitter-javascript',
    typescript: 'tree-sitter-typescript',
    tsx: 'tree-sitter-tsx',
    python: 'tree-sitter-python',
    rust: 'tree-sitter-rust',
    go: 'tree-sitter-go',
    c: 'tree-sitter-c',
    cpp: 'tree-sitter-cpp'
  }

  for (const [langName, wasmFile] of Object.entries(langMap)) {
    try {
      const wasmPath = path.join(grammarDir, `${wasmFile}.wasm`)
      if (existsSync(wasmPath)) {
        const lang = await Language.load(wasmPath)
        languageCache.set(langName, lang)
      }
    } catch {
      // Language not available — skip gracefully
    }
  }

  return parser
}

function detectLanguage(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.tsx') return 'tsx'
  return EXT_TO_LANG[ext] || null
}

// Lightweight tree node type for traversal
interface TreeNode {
  type: string
  text?: string
  childForFieldName?: (name: string) => TreeNode | null
  children?: TreeNode[]
  startPosition?: { row: number; column: number }
  endPosition?: { row: number; column: number }
}

function getSymbolKind(nodeType: string): CodeSymbol['kind'] | null {
  if (nodeType.includes('function_declaration') || nodeType === 'function_definition') return 'function'
  if (nodeType.includes('method_definition') || nodeType === 'method_declaration') return 'method'
  if (nodeType.includes('class_declaration') || nodeType === 'class_definition') return 'class'
  if (nodeType.includes('interface_declaration')) return 'interface'
  if (nodeType.includes('type_alias_declaration')) return 'type'
  if (nodeType.includes('variable_declaration') || nodeType === 'variable_declarator') return 'variable'
  if (nodeType.includes('enum_declaration')) return 'enum'
  return null
}

function extractName(node: TreeNode, nodeType: string): string | null {
  const nameNode =
    node.childForFieldName?.('name')

  if (nameNode && nameNode.text) return nameNode.text

  // Try children for identifier
  const children = node.children || []
  for (const child of children) {
    if (
      child.type === 'identifier' ||
      child.type === 'property_identifier'
    ) {
      if (child.text) return child.text
    }
    // For variable_declarator, the name is in the first identifier
    if (child.type === 'variable_declarator') {
      const grandkids = child.children || []
      for (const gk of grandkids) {
        if (gk.type === 'identifier' && gk.text) return gk.text
      }
    }
  }

  return null
}

function traverseTree(
  node: TreeNode,
  filePath: string,
  symbols: CodeSymbol[],
  parentName?: string
): void {
  const kind = getSymbolKind(node.type)
  if (kind) {
    const name = extractName(node, node.type)
    if (name) {
      symbols.push({
        name,
        kind,
        filePath,
        startLine: (node.startPosition?.row ?? 0) + 1,
        endLine: (node.endPosition?.row ?? 0) + 1,
        startColumn: (node.startPosition?.column ?? 0) + 1,
        endColumn: (node.endPosition?.column ?? 0) + 1,
        parentName
      })

      // Recurse into children with this symbol as parent
      const nextParent = kind === 'class' ? name : parentName
      const children = node.children || []
      for (const child of children) {
        traverseTree(child, filePath, symbols, nextParent)
      }
      return
    }
  }

  const children = node.children || []
  for (const child of children) {
    traverseTree(child, filePath, symbols, parentName)
  }
}

export async function parseCodeFile(filePath: string): Promise<CodeSymbol[]> {
  const p = await initParser()
  const langName = detectLanguage(filePath)

  if (!langName) return []

  const lang = languageCache.get(langName)
  if (!lang) return []

  let source: string
  try {
    source = readFileSync(filePath, 'utf-8')
  } catch {
    return []
  }

  p.setLanguage(lang)
  const tree = p.parse(source)
  const rootNode = tree.rootNode as unknown as TreeNode

  const symbols: CodeSymbol[] = []
  traverseTree(rootNode, filePath, symbols)
  return symbols
}

export async function extractSymbols(filePaths: string[]): Promise<CodeSymbol[]> {
  const allSymbols: CodeSymbol[] = []
  for (const filePath of filePaths) {
    const symbols = await parseCodeFile(filePath)
    allSymbols.push(...symbols)
  }
  return allSymbols
}
