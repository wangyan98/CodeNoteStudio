import { Parser, Language } from 'web-tree-sitter'
import { readFileSync, existsSync, statSync } from 'node:fs'
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
  repoPath?: string
}

let parser: Parser | null = null
let wasmReady = false
let parserPoisoned = false
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

function getTreeSitterWasmPath(): string {
  const candidates = [
    // Development electron-vite: navigate from out/main/chunks up to project root
    path.join(__dirname, '..', '..', '..', 'node_modules', 'web-tree-sitter', 'web-tree-sitter.wasm'),
    // Directly in project root
    path.join(process.cwd(), 'node_modules', 'web-tree-sitter', 'web-tree-sitter.wasm'),
    // Bundled alongside the script
    path.join(__dirname, 'web-tree-sitter.wasm')
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return candidates[0]
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

export async function initParser(): Promise<Parser | null> {
  if (parser) return parser
  if (parserPoisoned) return null

  // WASM runtime can only be initialized once — subsequent calls just
  // create a fresh Parser instance to reset accumulated memory.
  if (!wasmReady) {
    const treeSitterWasmPath = getTreeSitterWasmPath()
    try {
      await Parser.init({
        locateFile(_scriptName: string) {
          return treeSitterWasmPath
        }
      })
      wasmReady = true
    } catch (err) {
      console.error('[code-parser] Failed to initialize WASM runtime:', err)
      throw err
    }
  }

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

  // Only load languages once — they stay in languageCache
  if (languageCache.size === 0) {
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
  // C++ uses function_definition, TS/JS use function_declaration
  if (nodeType.includes('function_definition') || nodeType.includes('function_declaration')) return 'function'
  // C++ method_definition, TS method_definition/method_declaration
  if (nodeType.includes('method_definition') || nodeType.includes('method_declaration')) return 'method'
  // C++ class_specifier, TS class_declaration, Python class_definition
  if (nodeType.includes('class_specifier') || nodeType.includes('struct_specifier') || nodeType.includes('class_declaration') || nodeType === 'class_definition') return 'class'
  if (nodeType.includes('interface_declaration')) return 'interface'
  if (nodeType.includes('type_alias_declaration')) return 'type'
  if (nodeType.includes('variable_declaration') || nodeType === 'variable_declarator') return 'variable'
  // C++ enum_specifier, TS enum_declaration
  if (nodeType.includes('enum_specifier') || nodeType.includes('enum_declaration')) return 'enum'
  return null
}

function extractName(node: TreeNode, nodeType: string): string | null {
  const nameNode = node.childForFieldName?.('name')
  if (nameNode && nameNode.text) return nameNode.text

  const children = node.children || []
  for (const child of children) {
    if (child.type === 'identifier' || child.type === 'property_identifier') {
      if (child.text) return child.text
    }
    if (child.type === 'variable_declarator') {
      const grandkids = child.children || []
      for (const gk of grandkids) {
        if (gk.type === 'identifier' && gk.text) return gk.text
      }
    }
    // C++ function_declarator contains the function name as identifier
    if (child.type === 'function_declarator') {
      const declKids = child.children || []
      for (const dk of declKids) {
        if (dk.type === 'identifier' && dk.text) return dk.text
        // Handle function_declarator → declarator → identifier (pointer/reference functions)
        if (dk.type === 'declarator' || dk.type === 'reference_declarator' || dk.type === 'pointer_declarator') {
          const innerKids = dk.children || []
          for (const ik of innerKids) {
            if (ik.type === 'identifier' && ik.text) return ik.text
          }
        }
      }
    }
  }

  return null
}

interface StackFrame {
  node: TreeNode
  parentName?: string
}

function traverseTree(
  rootNode: TreeNode,
  filePath: string,
  symbols: CodeSymbol[],
  parentName?: string
): void {
  const stack: StackFrame[] = [{ node: rootNode, parentName }]

  while (stack.length > 0) {
    const frame = stack.pop()!
    const { node, parentName: pn } = frame
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
          parentName: pn
        })

        const nextParent = kind === 'class' ? name : pn
        const children = node.children || []
        // Push in reverse order to preserve original traversal order
        for (let i = children.length - 1; i >= 0; i--) {
          stack.push({ node: children[i], parentName: nextParent })
        }
        continue
      }
    }

    const children = node.children || []
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push({ node: children[i], parentName: pn })
    }
  }
}

// Maximum file size to parse (1MB) — larger files can crash the WASM parser
const MAX_FILE_SIZE = 1024 * 1024

// Reset the parser singleton so the next call to initParser() creates a fresh one.
// If the crash was severe enough to corrupt the WASM runtime, mark it as poisoned
// so we don't attempt further parsing — the next new Parser() would Abort().
function resetParser(poisoned = false): void {
  parser = null
  if (poisoned) {
    parserPoisoned = true
  }
}

// Clear the poisoned flag for a fresh indexing attempt.
// If the WASM runtime is truly corrupted, it will crash again and re-poison.
export function clearParserPoison(): void {
  parserPoisoned = false
}

export async function parseCodeFile(filePath: string): Promise<CodeSymbol[]> {
  const langName = detectLanguage(filePath)
  if (!langName) return []

  const lang = languageCache.get(langName)
  if (!lang) return []

  let source: string
  try {
    const stat = statSync(filePath)
    if (stat.size > MAX_FILE_SIZE) return []
    source = readFileSync(filePath, 'utf-8')
  } catch {
    return []
  }

  try {
    const p = await initParser()
    if (!p) return [] // WASM runtime is poisoned from a previous crash

    p.setLanguage(lang)
    const tree = p.parse(source)
    if (!tree) return []

    const rootNode = tree.rootNode as unknown as TreeNode
    const symbols: CodeSymbol[] = []
    traverseTree(rootNode, filePath, symbols)
    return symbols
  } catch {
    // WASM parser crashed (OOM, stack overflow, etc.) — poison and skip this file
    resetParser(true)
    return []
  }
}

// Reset parser every N files to prevent WASM memory exhaustion
const PARSER_RESET_INTERVAL = 500

export async function extractSymbols(filePaths: string[]): Promise<CodeSymbol[]> {
  const allSymbols: CodeSymbol[] = []
  let skipped = 0

  for (let i = 0; i < filePaths.length; i++) {
    // Periodically reset parser to free accumulated WASM memory
    if (i > 0 && i % PARSER_RESET_INTERVAL === 0) {
      resetParser(false)
    }

    const symbols = await parseCodeFile(filePaths[i])
    if (symbols.length === 0) {
      skipped++
    }
    allSymbols.push(...symbols)

    if (parserPoisoned) {
      console.warn(`[code-parser] WASM runtime poisoned after ${i + 1}/${filePaths.length} files — stopping`)
      break
    }
  }

  if (skipped > 0) {
    console.log(`[code-parser] Skipped ${skipped}/${filePaths.length} files`)
  }

  return allSymbols
}
