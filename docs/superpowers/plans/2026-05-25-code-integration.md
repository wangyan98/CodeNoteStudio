# Code Integration Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the code integration engine: tree-sitter-based code parsing for symbol extraction, SQLite symbol index, @ref annotation resolution linking notes to code locations, and real git integration replacing the stub.

**Architecture:** Pure TypeScript/Node.js services in the main process — no native C++ addon needed. Uses `web-tree-sitter` (WASM) for parsing to avoid native compilation issues. Uses `simple-git` for git operations. Services are loaded via dynamic `import()` in IPC handlers (consistent with existing pattern). Symbol extraction produces `CodeSymbol` objects stored in SQLite. The `@ref(name)` annotation parser scans note content and resolves references through the symbol index.

**Tech Stack:** web-tree-sitter (WASM), tree-sitter WASM grammars (TypeScript, Python, Rust, Go, C/C++), simple-git, better-sqlite3 (already installed)

---

### File Structure Map

```
src/main/
├── index.ts                          # unchanged
├── ipc-handlers.ts                   # Modify: replace git stub, add code:get-symbols, code:resolve-refs
├── types.ts                          # Modify: add CodeSymbol type
├── services/
│   ├── code-parser.ts                # New: tree-sitter symbol extractor
│   ├── symbol-index.ts               # New: SQLite symbol CRUD
│   ├── ref-resolver.ts               # New: @ref annotation parser + resolver
│   └── git-service.ts                # New: simple-git wrappers
src/preload/
├── index.ts                          # Modify: add code integration APIs
src/renderer/src/
├── types/
│   ├── index.ts                      # Modify: add CodeSymbol + @ref types
│   └── electron.d.ts                 # Modify: add code integration API types
tests/main/
├── code-parser.test.ts               # New
├── symbol-index.test.ts              # New
├── ref-resolver.test.ts              # New
└── git-service.test.ts               # New
```

---

### Task 1: Install dependencies + add WASM grammar assets

**Files:**
- Modify: `package.json`
- Create: `assets/tree-sitter/` (grammar WASM files)

- [ ] **Step 1: Install npm packages**

```bash
cd /Users/wangyan/Desktop/note && npm install web-tree-sitter simple-git
```

- [ ] **Step 2: Create grammar download script**

Create `scripts/download-grammars.sh`:

```bash
#!/bin/bash
set -e

GRAMMAR_DIR="assets/tree-sitter"
mkdir -p "$GRAMMAR_DIR"

# Tree-sitter WASM grammar URLs (pre-built from GitHub releases)
declare -A GRAMMARS=(
  ["tree-sitter-javascript"]="https://github.com/tree-sitter/tree-sitter-javascript/releases/download/v0.23.0/tree-sitter-javascript.wasm"
  ["tree-sitter-typescript"]="https://github.com/tree-sitter/tree-sitter-typescript/releases/download/v0.23.0/tree-sitter-typescript.wasm"
  ["tree-sitter-tsx"]="https://github.com/tree-sitter/tree-sitter-typescript/releases/download/v0.23.0/tree-sitter-tsx.wasm"
  ["tree-sitter-python"]="https://github.com/tree-sitter/tree-sitter-python/releases/download/v0.23.0/tree-sitter-python.wasm"
  ["tree-sitter-rust"]="https://github.com/tree-sitter/tree-sitter-rust/releases/download/v0.23.0/tree-sitter-rust.wasm"
  ["tree-sitter-go"]="https://github.com/tree-sitter/tree-sitter-go/releases/download/v0.23.0/tree-sitter-go.wasm"
  ["tree-sitter-c"]="https://github.com/tree-sitter/tree-sitter-c/releases/download/v0.23.0/tree-sitter-c.wasm"
  ["tree-sitter-cpp"]="https://github.com/tree-sitter/tree-sitter-cpp/releases/download/v0.23.0/tree-sitter-cpp.wasm"
)

for grammar in "${!GRAMMARS[@]}"; do
  url="${GRAMMARS[$grammar]}"
  output="$GRAMMAR_DIR/${grammar}.wasm"
  if [ ! -f "$output" ]; then
    echo "Downloading $grammar..."
    curl -L "$url" -o "$output" || echo "WARNING: failed to download $grammar (may need manual setup)"
  else
    echo "$grammar already exists, skipping"
  fi
done

echo "Grammar download complete. Files in $GRAMMAR_DIR:"
ls -la "$GRAMMAR_DIR"
```

Run: `bash scripts/download-grammars.sh`

Note: If the pre-built WASM URLs don't work (grammar version may differ), we will use a fallback approach: create the grammar files programmatically in the code-parser service using tree-sitter's built-in WASM compilation, or skip grammars that fail to download and handle missing grammars gracefully.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json scripts/download-grammars.sh assets/tree-sitter/
git commit -m "chore: add web-tree-sitter, simple-git, and WASM grammar assets"
```

---

### Task 2: Build code parser service

**Files:**
- Create: `src/main/services/code-parser.ts`
- Create: `tests/main/code-parser.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/main/code-parser.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { initParser, parseCodeFile, extractSymbols, type CodeSymbol } from '../../src/main/services/code-parser'

const testDir = join(tmpdir(), 'cns-code-parser-test')

beforeAll(async () => {
  mkdirSync(testDir, { recursive: true })
  await initParser()
})

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true })
})

describe('code-parser', () => {
  it('extracts function declarations from TypeScript', async () => {
    const code = `
function hello() {
  return "world"
}

export async function fetchData(url: string): Promise<string> {
  return await fetch(url).then(r => r.text())
}

class MyClass {
  getValue() { return 42 }
}
`
    const filePath = join(testDir, 'sample.ts')
    writeFileSync(filePath, code)
    const symbols = await parseCodeFile(filePath)

    const funcNames = symbols.filter(s => s.kind === 'function').map(s => s.name)
    expect(funcNames).toContain('hello')
    expect(funcNames).toContain('fetchData')

    const methods = symbols.filter(s => s.kind === 'method')
    expect(methods.some(m => m.name === 'getValue')).toBe(true)

    const classes = symbols.filter(s => s.kind === 'class')
    expect(classes.some(c => c.name === 'MyClass')).toBe(true)
  })

  it('returns empty array for non-code files', async () => {
    const filePath = join(testDir, 'readme.md')
    writeFileSync(filePath, '# Hello World')
    const symbols = await parseCodeFile(filePath)
    expect(symbols).toEqual([])
  })

  it('returns empty array for unparseable files', async () => {
    const filePath = join(testDir, 'broken.ts')
    writeFileSync(filePath, 'this is not @@@ valid typescript {{{')
    const symbols = await parseCodeFile(filePath)
    expect(Array.isArray(symbols)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /Users/wangyan/Desktop/note && npx vitest run tests/main/code-parser.test.ts
```
Expected: FAIL — `initParser` not exported

- [ ] **Step 3: Write code-parser service**

Create `src/main/services/code-parser.ts`:

```typescript
import Parser, { type Language } from 'web-tree-sitter'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

async function getGrammarDir(): Promise<string> {
  // In production (Electron), grammars are in app.asar.unpacked or resources
  // In dev, they're in the project root's assets/tree-sitter
  const candidates = [
    path.join(process.cwd(), 'assets', 'tree-sitter'),
    path.join(process.cwd(), '..', 'assets', 'tree-sitter'),
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'tree-sitter')
  ]

  // Also check __dirname equivalent for CJS
  if (typeof __dirname !== 'undefined') {
    candidates.push(path.join(__dirname, '..', '..', 'assets', 'tree-sitter'))
  }

  for (const dir of candidates) {
    if (existsSync(path.join(dir, 'tree-sitter-javascript.wasm'))) {
      return dir
    }
  }

  // Fallback: check project root
  const projectRoot = process.cwd()
  const fallback = path.join(projectRoot, 'assets', 'tree-sitter')
  if (existsSync(path.join(fallback, 'tree-sitter-javascript.wasm'))) {
    return fallback
  }

  return ''
}

export async function initParser(): Promise<Parser> {
  if (parser) return parser

  await Parser.init()
  parser = new Parser()

  const grammarDir = await getGrammarDir()

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
      const wasmPath = grammarDir ? path.join(grammarDir, `${wasmFile}.wasm`) : ''
      if (wasmPath && existsSync(wasmPath)) {
        const lang = await Parser.Language.load(wasmPath)
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

type SExpNode = {
  type: string
  childForFieldName?: (name: string) => SExpNode | null
  children?: SExpNode[]
  startPosition?: { row: number; column: number }
  endPosition?: { row: number; column: number }
  text?: string
}

function getSymbolKindSitter(nodeType: string): CodeSymbol['kind'] | null {
  // tree-sitter node types mapping to symbol kinds
  if (nodeType.includes('function_declaration') || nodeType === 'function_definition') return 'function'
  if (nodeType.includes('method_definition') || nodeType === 'method_declaration') return 'method'
  if (nodeType.includes('class_declaration') || nodeType === 'class_definition') return 'class'
  if (nodeType.includes('interface_declaration')) return 'interface'
  if (nodeType.includes('type_alias_declaration')) return 'type'
  if (nodeType.includes('variable_declaration') || nodeType === 'variable_declarator') return 'variable'
  if (nodeType.includes('enum_declaration')) return 'enum'
  return null
}

function extractName(node: SExpNode, nodeType: string): string | null {
  // Different languages have different field names for the identifier
  const nameNode =
    node.childForFieldName?.('name') ||
    node.childForFieldName?.('declarator')

  if (nameNode && nameNode.text) return nameNode.text

  // Try children
  const children = node.children || []
  for (const child of children) {
    if (
      child.type === 'identifier' ||
      child.type === 'property_identifier' ||
      child.type === 'variable_declarator'
    ) {
      if (child.text) return child.text
      // For variable_declarator, the name is in the first identifier child
      const grandkids = child.children || []
      for (const gk of grandkids) {
        if (gk.type === 'identifier' && gk.text) return gk.text
      }
    }
  }

  return null
}

function traverseTree(
  node: SExpNode,
  filePath: string,
  symbols: CodeSymbol[],
  parentName?: string
): void {
  const kind = getSymbolKindSitter(node.type)
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
  const rootNode = tree.rootNode as unknown as SExpNode

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
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /Users/wangyan/Desktop/note && npx vitest run tests/main/code-parser.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/main/services/code-parser.ts tests/main/code-parser.test.ts
git commit -m "feat: add tree-sitter code parser service with symbol extraction"
```

---

### Task 3: Build symbol index service

**Files:**
- Create: `src/main/services/symbol-index.ts`
- Create: `tests/main/symbol-index.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/main/symbol-index.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import { initSymbolDatabase, indexSymbols, querySymbols, clearSymbols } from '../../src/main/services/symbol-index'
import type { CodeSymbol } from '../../src/main/services/code-parser'

describe('symbol-index', () => {
  let testDir: string
  let db: Database.Database

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'cns-symbol-'))
    db = initSymbolDatabase(testDir)
  })

  afterEach(() => {
    db.close()
    rmSync(testDir, { recursive: true, force: true })
  })

  const sampleSymbols: CodeSymbol[] = [
    {
      name: 'fetchData',
      kind: 'function',
      filePath: '/repo/src/api.ts',
      startLine: 10,
      endLine: 20,
      startColumn: 1,
      endColumn: 1,
      parentName: undefined
    },
    {
      name: 'getValue',
      kind: 'method',
      filePath: '/repo/src/api.ts',
      startLine: 25,
      endLine: 27,
      startColumn: 3,
      endColumn: 3,
      parentName: 'MyClass'
    },
    {
      name: 'MyClass',
      kind: 'class',
      filePath: '/repo/src/api.ts',
      startLine: 22,
      endLine: 30,
      startColumn: 1,
      endColumn: 1,
      parentName: undefined
    }
  ]

  it('indexes and queries symbols by name', () => {
    indexSymbols(db, sampleSymbols)

    const results = querySymbols(db, 'fetchData')
    expect(results).toHaveLength(1)
    expect(results[0].kind).toBe('function')
    expect(results[0].filePath).toBe('/repo/src/api.ts')
    expect(results[0].startLine).toBe(10)
  })

  it('returns empty array for non-existent symbol', () => {
    const results = querySymbols(db, 'nonexistent')
    expect(results).toEqual([])
  })

  it('clears all symbols', () => {
    indexSymbols(db, sampleSymbols)
    clearSymbols(db)
    const results = querySymbols(db, 'fetchData')
    expect(results).toEqual([])
  })

  it('queries by file path', () => {
    indexSymbols(db, sampleSymbols)
    const results = querySymbols(db, '', '/repo/src/api.ts')
    expect(results.length).toBeGreaterThanOrEqual(3)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /Users/wangyan/Desktop/note && npx vitest run tests/main/symbol-index.test.ts
```
Expected: FAIL — `initSymbolDatabase` not exported

- [ ] **Step 3: Write symbol-index service**

Create `src/main/services/symbol-index.ts`:

```typescript
import Database from 'better-sqlite3'
import path from 'node:path'
import type { CodeSymbol } from './code-parser'

export function initSymbolDatabase(projectPath: string): Database.Database {
  const dbPath = path.join(projectPath, '.symbols.db')
  const db = new Database(dbPath)

  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS symbols (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      file_path TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      start_column INTEGER NOT NULL,
      end_column INTEGER NOT NULL,
      parent_name TEXT
    )
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_path)`)

  return db
}

export function indexSymbols(db: Database.Database, symbols: CodeSymbol[]): void {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO symbols (name, kind, file_path, start_line, end_line, start_column, end_column, parent_name)
    VALUES (@name, @kind, @file_path, @start_line, @end_line, @start_column, @end_column, @parent_name)
  `)

  const transaction = db.transaction((syms: CodeSymbol[]) => {
    for (const sym of syms) {
      insert.run({
        name: sym.name,
        kind: sym.kind,
        file_path: sym.filePath,
        start_line: sym.startLine,
        end_line: sym.endLine,
        start_column: sym.startColumn,
        end_column: sym.endColumn,
        parent_name: sym.parentName || null
      })
    }
  })

  transaction(symbols)
}

export function querySymbols(
  db: Database.Database,
  name?: string,
  filePath?: string,
  kind?: string
): CodeSymbol[] {
  let sql = 'SELECT name, kind, file_path, start_line, end_line, start_column, end_column, parent_name FROM symbols WHERE 1=1'
  const params: Record<string, string> = {}

  if (name) {
    sql += ' AND name = @name'
    params.name = name
  }
  if (filePath) {
    sql += ' AND file_path = @file_path'
    params.file_path = filePath
  }
  if (kind) {
    sql += ' AND kind = @kind'
    params.kind = kind
  }

  sql += ' ORDER BY start_line ASC'

  const rows = db.prepare(sql).all(...Object.values(params)) as Array<{
    name: string
    kind: string
    file_path: string
    start_line: number
    end_line: number
    start_column: number
    end_column: number
    parent_name: string | null
  }>

  return rows.map((row) => ({
    name: row.name,
    kind: row.kind as CodeSymbol['kind'],
    filePath: row.file_path,
    startLine: row.start_line,
    endLine: row.end_line,
    startColumn: row.start_column,
    endColumn: row.end_column,
    parentName: row.parent_name || undefined
  }))
}

export function clearSymbols(db: Database.Database): void {
  db.exec('DELETE FROM symbols')
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /Users/wangyan/Desktop/note && npx vitest run tests/main/symbol-index.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/main/services/symbol-index.ts tests/main/symbol-index.test.ts
git commit -m "feat: add symbol index service with SQLite storage"
```

---

### Task 4: Build @ref resolution engine

**Files:**
- Create: `src/main/services/ref-resolver.ts`
- Create: `tests/main/ref-resolver.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/main/ref-resolver.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseRefs, resolveRefs } from '../../src/main/services/ref-resolver'
import type { CodeSymbol } from '../../src/main/services/code-parser'

describe('parseRefs', () => {
  it('extracts @ref annotations from markdown', () => {
    const content = `
# Architecture

The main entry point is @ref(main). For data fetching, see @ref(fetchData).

Some code:

\`\`\`ts
@ref(MyClass.getValue)
\`\`\`
`
    const refs = parseRefs(content)
    expect(refs).toHaveLength(3)
    expect(refs).toContain('main')
    expect(refs).toContain('fetchData')
    expect(refs).toContain('MyClass.getValue')
  })

  it('returns empty array when no @ref present', () => {
    expect(parseRefs('just some text without refs')).toEqual([])
    expect(parseRefs('')).toEqual([])
  })

  it('extracts @ref from mind map content', () => {
    const content = JSON.stringify({
      root: {
        title: 'Auth Flow',
        content: 'See @ref(authenticate) for the implementation',
        children: [
          { title: 'Login', content: '@ref(loginHandler)', children: [] }
        ]
      }
    })
    const refs = parseRefs(content)
    expect(refs).toContain('authenticate')
    expect(refs).toContain('loginHandler')
  })

  it('extracts @ref from derivation nodes', () => {
    const content = JSON.stringify({
      nodes: [
        { title: 'Step 1', content: 'Start with @ref(init)', stepNumber: 1 },
        { title: 'Step 2', content: '@ref(process)', stepNumber: 2 }
      ]
    })
    const refs = parseRefs(content)
    expect(refs).toContain('init')
    expect(refs).toContain('process')
  })
})

describe('resolveRefs', () => {
  const mockSymbols: CodeSymbol[] = [
    {
      name: 'main',
      kind: 'function',
      filePath: '/repo/src/index.ts',
      startLine: 1,
      endLine: 10,
      startColumn: 1,
      endColumn: 1
    },
    {
      name: 'fetchData',
      kind: 'function',
      filePath: '/repo/src/api.ts',
      startLine: 10,
      endLine: 20,
      startColumn: 1,
      endColumn: 1
    },
    {
      name: 'getValue',
      kind: 'method',
      filePath: '/repo/src/api.ts',
      startLine: 25,
      endLine: 27,
      startColumn: 3,
      endColumn: 3,
      parentName: 'MyClass'
    }
  ]

  it('resolves @ref names to CodeMapping objects', () => {
    const refs = ['main', 'fetchData']
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(2)
    expect(mappings[0]).toEqual({
      functionName: 'main',
      filePath: '/repo/src/index.ts',
      startLine: 1,
      endLine: 10
    })
    expect(mappings[1]).toEqual({
      functionName: 'fetchData',
      filePath: '/repo/src/api.ts',
      startLine: 10,
      endLine: 20
    })
  })

  it('handles unresolved refs gracefully', () => {
    const refs = ['main', 'nonexistent']
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].functionName).toBe('main')
  })

  it('handles Class.method notation', () => {
    const refs = ['MyClass.getValue']
    const mappings = resolveRefs(refs, mockSymbols)
    expect(mappings).toHaveLength(1)
    expect(mappings[0]).toEqual({
      functionName: 'MyClass.getValue',
      filePath: '/repo/src/api.ts',
      startLine: 25,
      endLine: 27
    })
  })

  it('returns empty array for empty refs', () => {
    expect(resolveRefs([], mockSymbols)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /Users/wangyan/Desktop/note && npx vitest run tests/main/ref-resolver.test.ts
```
Expected: FAIL — `parseRefs` not exported

- [ ] **Step 3: Write ref-resolver service**

Create `src/main/services/ref-resolver.ts`:

```typescript
import type { CodeSymbol } from './code-parser'

export interface CodeMapping {
  functionName: string
  filePath: string
  startLine: number
  endLine: number
}

/**
 * Extract @ref(name) references from arbitrary text content.
 * Works with Markdown, JSON (mind maps, derivation trees), and plain text.
 */
export function parseRefs(content: string): string[] {
  if (!content) return []

  const refs: string[] = []
  // Match @ref(name) where name can contain letters, digits, dots, underscores, hyphens
  const regex = /@ref\(([a-zA-Z0-9._-]+)\)/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    const name = match[1]
    if (!refs.includes(name)) {
      refs.push(name)
    }
  }

  return refs
}

/**
 * Resolve parsed @ref names to CodeMapping objects using a symbol lookup function.
 */
export function resolveRefs(
  refNames: string[],
  symbols: CodeSymbol[]
): CodeMapping[] {
  const mappings: CodeMapping[] = []
  const matched = new Set<string>()

  for (const refName of refNames) {
    if (matched.has(refName)) continue

    // Try exact match by name
    const match = symbols.find((s) => s.name === refName)

    if (match) {
      matched.add(refName)
      mappings.push({
        functionName: refName,
        filePath: match.filePath,
        startLine: match.startLine,
        endLine: match.endLine
      })
      continue
    }

    // Try Class.method resolution: split by last dot
    const lastDot = refName.lastIndexOf('.')
    if (lastDot > 0) {
      const className = refName.slice(0, lastDot)
      const methodName = refName.slice(lastDot + 1)

      const methodMatch = symbols.find(
        (s) => s.name === methodName && s.parentName === className
      )

      if (methodMatch) {
        matched.add(refName)
        mappings.push({
          functionName: refName,
          filePath: methodMatch.filePath,
          startLine: methodMatch.startLine,
          endLine: methodMatch.endLine
        })
      }
    }
  }

  return mappings
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /Users/wangyan/Desktop/note && npx vitest run tests/main/ref-resolver.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/main/services/ref-resolver.ts tests/main/ref-resolver.test.ts
git commit -m "feat: add @ref annotation parser and resolver"
```

---

### Task 5: Real git integration (replace stub)

**Files:**
- Create: `src/main/services/git-service.ts`
- Create: `tests/main/git-service.test.ts`
- Modify: `src/main/ipc-handlers.ts`

- [ ] **Step 1: Write the test**

Create `tests/main/git-service.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { writeTextFile } from '../../src/main/services/file-system'
import { getCommitInfo, getFileBlame, getRecentCommits } from '../../src/main/services/git-service'

describe('git-service', () => {
  let testDir: string

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'cns-git-'))
    execSync('git init', { cwd: testDir })
    execSync('git config user.email "test@test.com"', { cwd: testDir })
    execSync('git config user.name "Test"', { cwd: testDir })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe('getCommitInfo', () => {
    it('returns commit info for a git repo', async () => {
      // Create and commit a file
      await writeTextFile(join(testDir, 'test.txt'), 'hello')
      execSync('git add test.txt', { cwd: testDir })
      execSync('git commit -m "initial commit"', { cwd: testDir })

      const info = await getCommitInfo(testDir)
      expect(info.sha).toBeTruthy()
      expect(info.sha).toHaveLength(40)
      expect(info.message).toBe('initial commit')
      expect(info.author).toBe('Test')
    })

    it('returns stub for non-git directory', async () => {
      const nonGitDir = mkdtempSync(join(tmpdir(), 'cns-nogit-'))
      const info = await getCommitInfo(nonGitDir)
      expect(info.sha).toBe('not available')
      rmSync(nonGitDir, { recursive: true, force: true })
    })
  })

  describe('getRecentCommits', () => {
    it('returns recent commit messages', async () => {
      await writeTextFile(join(testDir, 'test.txt'), 'v1')
      execSync('git add test.txt', { cwd: testDir })
      execSync('git commit -m "first"', { cwd: testDir })

      await writeTextFile(join(testDir, 'test.txt'), 'v2')
      execSync('git add test.txt', { cwd: testDir })
      execSync('git commit -m "second"', { cwd: testDir })

      const commits = await getRecentCommits(testDir, 5)
      expect(commits).toHaveLength(2)
      expect(commits[0].message).toBe('second')
      expect(commits[1].message).toBe('first')
    })
  })

  describe('getFileBlame', () => {
    it('returns blame info for a tracked file', async () => {
      await writeTextFile(join(testDir, 'blame.ts'), 'line1')
      execSync('git add blame.ts', { cwd: testDir })
      execSync('git commit -m "add blame"', { cwd: testDir })

      const blame = await getFileBlame(testDir, 'blame.ts')
      expect(blame).toHaveLength(1)
      expect(blame[0].line).toBe(1)
      expect(blame[0].commit).toBeTruthy()
    })
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /Users/wangyan/Desktop/note && npx vitest run tests/main/git-service.test.ts
```
Expected: FAIL — `getCommitInfo` not exported

- [ ] **Step 3: Write git-service**

Create `src/main/services/git-service.ts`:

```typescript
import { simpleGit, type SimpleGit } from 'simple-git'
import fs from 'node:fs'
import path from 'node:path'

export interface CommitInfo {
  sha: string
  message: string
  author: string
  date: string
}

export interface CommitEntry {
  sha: string
  message: string
  author: string
  date: string
}

export interface BlameLine {
  line: number
  commit: string
  author: string
  date: string
  summary: string
}

function isGitRepo(repoPath: string): boolean {
  try {
    return fs.existsSync(path.join(repoPath, '.git'))
  } catch {
    return false
  }
}

function getGit(repoPath: string): SimpleGit | null {
  if (!isGitRepo(repoPath)) return null
  return simpleGit(repoPath)
}

export async function getCommitInfo(repoPath: string): Promise<CommitInfo> {
  const git = getGit(repoPath)
  if (!git) {
    return { sha: 'not available', message: '', author: '', date: '' }
  }

  try {
    const log = await git.log({ maxCount: 1 })
    if (!log.latest) {
      return { sha: 'not available', message: '', author: '', date: '' }
    }
    return {
      sha: log.latest.hash,
      message: log.latest.message,
      author: log.latest.author_name,
      date: log.latest.date
    }
  } catch {
    return { sha: 'not available', message: '', author: '', date: '' }
  }
}

export async function getRecentCommits(
  repoPath: string,
  maxCount = 10
): Promise<CommitEntry[]> {
  const git = getGit(repoPath)
  if (!git) return []

  try {
    const log = await git.log({ maxCount })
    return log.all.map((entry) => ({
      sha: entry.hash,
      message: entry.message,
      author: entry.author_name,
      date: entry.date
    }))
  } catch {
    return []
  }
}

export async function getFileBlame(
  repoPath: string,
  filePath: string
): Promise<BlameLine[]> {
  const git = getGit(repoPath)
  if (!git) return []

  try {
    // simple-git's blame returns structured data
    const result = await git.raw('blame', '--line-porcelain', filePath)
    return parseBlameOutput(result)
  } catch {
    return []
  }
}

function parseBlameOutput(output: string): BlameLine[] {
  const lines: BlameLine[] = []
  const entries = output.split('\n')

  let current: Partial<BlameLine> = {}
  let lineNum = 0

  for (const entry of entries) {
    if (/^[0-9a-f]{40} \d+ \d+/.test(entry)) {
      // New blame entry header
      if (current.commit && current.line) {
        lines.push(current as BlameLine)
      }
      const parts = entry.split(' ')
      current = { commit: parts[0] }
      // The line number follows: <sha> <original_line> <final_line>
      lineNum = parseInt(parts[2] || '0', 10)
      current.line = lineNum
    } else if (entry.startsWith('author ')) {
      current.author = entry.slice(7)
    } else if (entry.startsWith('author-time ')) {
      current.date = entry.slice(12)
    } else if (entry.startsWith('summary ')) {
      current.summary = entry.slice(8)
    }
  }

  if (current.commit && current.line) {
    lines.push(current as BlameLine)
  }

  return lines
}
```

- [ ] **Step 4: Update ipc-handlers.ts to use real git service**

In `src/main/ipc-handlers.ts`, replace the `code:get-git-commit` stub handler:

```typescript
  ipcMain.handle('code:get-git-commit', async (_event, repoPath: string) => {
    const { getCommitInfo } = await import('./services/git-service')
    return getCommitInfo(repoPath)
  })
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd /Users/wangyan/Desktop/note && npx vitest run tests/main/git-service.test.ts
```

- [ ] **Step 6: Run all existing tests to check nothing is broken**

```bash
cd /Users/wangyan/Desktop/note && npx vitest run
```

- [ ] **Step 7: Commit**

```bash
git add src/main/services/git-service.ts tests/main/git-service.test.ts src/main/ipc-handlers.ts
git commit -m "feat: add real git integration replacing stub"
```

---

### Task 6: IPC, preload, types + final verification

**Files:**
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/types/electron.d.ts`
- Modify: `src/renderer/src/types/index.ts`
- Modify: `src/main/types.ts`

- [ ] **Step 1: Add code integration IPC handlers**

In `src/main/ipc-handlers.ts`, add after the git handler:

```typescript
  ipcMain.handle('code:parse-symbols', async (_event, filePaths: string[]) => {
    const { extractSymbols } = await import('./services/code-parser')
    return extractSymbols(filePaths)
  })

  ipcMain.handle('code:index-symbols', async (_event, repoPath: string) => {
    const { initSymbolDatabase, indexSymbols } = await import('./services/symbol-index')
    const { extractSymbols, initParser } = await import('./services/code-parser')
    const { listRepoFiles } = await import('./services/file-system')

    await initParser()
    const files = await listRepoFiles(repoPath)
    const codeFiles = files.filter((f) => !f.isDirectory).map((f) => f.absolutePath)

    const db = initSymbolDatabase(projectPath)
    const symbols = await extractSymbols(codeFiles)
    indexSymbols(db, symbols)

    return { indexed: symbols.length, totalFiles: codeFiles.length }
  })

  ipcMain.handle('code:resolve-refs', async (_event, notePath: string, content: string) => {
    const { parseRefs, resolveRefs } = await import('./services/ref-resolver')
    const { initSymbolDatabase, querySymbols } = await import('./services/symbol-index')

    const refs = parseRefs(content)
    if (refs.length === 0) return []

    const db = initSymbolDatabase(projectPath)
    const allSymbols = querySymbols(db)
    return resolveRefs(refs, allSymbols)
  })
```

- [ ] **Step 2: Add preload APIs**

In `src/preload/index.ts` api object, add:

```typescript
  // Code integration
  parseSymbols: (filePaths: string[]) => ipcRenderer.invoke('code:parse-symbols', filePaths),
  indexSymbols: (repoPath: string) => ipcRenderer.invoke('code:index-symbols', repoPath),
  resolveRefs: (notePath: string, content: string) => ipcRenderer.invoke('code:resolve-refs', notePath, content)
```

- [ ] **Step 3: Update electron.d.ts**

In `src/renderer/src/types/electron.d.ts`, update `getGitCommit` return type AND add new APIs to `Window.electronAPI`:

Change:
```typescript
      getGitCommit: (repoPath: string) => Promise<string>
```
To:
```typescript
      getGitCommit: (repoPath: string) => Promise<{ sha: string; message: string; author: string; date: string }>
```

And add:
```typescript
      parseSymbols: (filePaths: string[]) => Promise<Array<{
        name: string
        kind: string
        filePath: string
        startLine: number
        endLine: number
        startColumn: number
        endColumn: number
        parentName?: string
      }>>
      indexSymbols: (repoPath: string) => Promise<{ indexed: number; totalFiles: number }>
      resolveRefs: (notePath: string, content: string) => Promise<Array<{
        functionName: string
        filePath: string
        startLine: number
        endLine: number
      }>>
```

- [ ] **Step 4: Update CodeViewport to use real git info**

In `src/renderer/src/components/CodeViewport.tsx`, update the `gitCommit` state and the git info display.

Currently the git info displays `gitCommit.slice(0, 7)`. After the IPC handler change, `getGitCommit` returns a `CommitInfo` object instead of a string. Update the component:

In the git info section, change:
```typescript
const [gitCommit, setGitCommit] = useState<string>('')
```
to:
```typescript
const [gitCommit, setGitCommit] = useState<{ sha: string; message: string; author: string; date: string } | null>(null)
```

And the git info bar to:
```typescript
        <div className="code-git-info">
          <span>{activeFile.language}</span>
          {gitCommit && gitCommit.sha !== 'not available' && (
            <>
              <span className="code-git-sha">{gitCommit.sha.slice(0, 7)}</span>
              <span>{gitCommit.message.slice(0, 60)}</span>
            </>
          )}
          <span>{activeFile.name}</span>
        </div>
```

Also update `tests/renderer/CodeViewport.test.tsx` AND `tests/renderer/CodeDirectory.test.tsx` — change the `getGitCommit` mock from returning a string to returning an object:

```typescript
    getGitCommit: vi.fn().mockResolvedValue({ sha: 'a1b2c3d4e5f6', message: 'test commit', author: 'test', date: '2024-01-01' }),
```

- [ ] **Step 5: TypeScript check**

```bash
cd /Users/wangyan/Desktop/note && npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json
```

Fix any type errors.

- [ ] **Step 6: Run all tests**

```bash
cd /Users/wangyan/Desktop/note && npx vitest run
```

- [ ] **Step 7: Build**

```bash
cd /Users/wangyan/Desktop/note && npm run build
```

- [ ] **Step 8: Commit**

```bash
git add src/main/ipc-handlers.ts src/preload/index.ts src/renderer/src/types/electron.d.ts src/renderer/src/components/CodeViewport.tsx
git commit -m "feat: wire code integration engine into IPC, preload, and UI"
```

---

### Verification Checklist

```
[ ] tree-sitter parses TS/JS/Python/Rust/Go/C files and extracts symbols
[ ] Symbol index stores/retrieves symbols in SQLite
[ ] @ref(name) annotations parsed from Markdown and JSON content
[ ] @ref names resolved to CodeMapping (file + line range)
[ ] Git commit info works (SHA, message, author)
[ ] Git blame shows per-line commit history
[ ] Git recent commits list works
[ ] npm test: all tests pass
[ ] npm run build: succeeds
```
