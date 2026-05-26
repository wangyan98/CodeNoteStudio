# Note Types & Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the file-based note storage layer: note document schemas, file system CRUD operations, notebook.json config management, and SQLite index schema initialization, all exposed to the renderer via IPC.

**Architecture:** All file I/O lives in the Electron main process (Node.js fs module). Services are plain TypeScript modules with no Electron dependencies for testability. A thin IPC handler layer wires services to the preload bridge. SQLite (better-sqlite3) schema is initialized on app startup.

**Tech Stack:** Node.js fs/promises, better-sqlite3, uuid, Electron IPC, Vitest

---

### File Structure Map

```
src/main/
├── index.ts                        # Modify: add IPC handlers + DB init
├── types.ts                        # New: main-process-only types
├── services/
│   ├── file-system.ts              # New: fs wrapper utilities
│   ├── notebook-config.ts          # New: notebook.json read/write/validate
│   ├── note-service.ts             # New: note CRUD operations
│   └── index-db.ts                 # New: SQLite schema init + migrations
├── schemas/
│   └── note-types.ts               # New: mind.json & derive.json document types
src/preload/
├── index.ts                        # Modify: add note/config API methods
src/renderer/src/types/
├── index.ts                        # Modify: add IPC API type declarations
tests/
└── main/
    ├── file-system.test.ts         # New
    ├── notebook-config.test.ts     # New
    ├── note-service.test.ts        # New
    └── index-db.test.ts            # New
```

---

### Task 1: Install new dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add dependencies to package.json**

Run:
```bash
cd /Users/wangyan/Desktop/note && npm install better-sqlite3 uuid && npm install --save-dev @types/better-sqlite3 @types/uuid @electron/rebuild
```

Expected: 4+ packages installed without errors.

- [ ] **Step 2: Add electron-rebuild to dev script**

Update `package.json` scripts to add:
```json
"postinstall": "electron-rebuild -f -w better-sqlite3"
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add better-sqlite3, uuid, and electron-rebuild"
```

---

### Task 2: Define note document types and validation

**Files:**
- Create: `src/main/schemas/note-types.ts`
- Create: `src/main/types.ts`

- [ ] **Step 1: Write the test for schema validation**

```typescript
// tests/main/note-types.test.ts
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
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd /Users/wangyan/Desktop/note && npx vitest run tests/main/note-types.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write src/main/schemas/note-types.ts**

```typescript
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
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd /Users/wangyan/Desktop/note && npx vitest run tests/main/note-types.test.ts`
Expected: 7 tests PASS

- [ ] **Step 5: Write src/main/types.ts**

```typescript
export type { MindMapDocument, DerivationDocument, MindMapNode, DerivationNode, CodeMapping } from './schemas/note-types'

export interface CodeRepo {
  path: string
  commit: string
  lsp: {
    language: string
    command: string
  }
}

export interface NotebookConfig {
  name: string
  codeRepos: CodeRepo[]
}

export type NoteFileType = 'mind' | 'md' | 'derive'

export interface NoteListItem {
  name: string
  relativePath: string
  type: NoteFileType
}
```

- [ ] **Step 6: Commit**

```bash
git add src/main/schemas/note-types.ts src/main/types.ts tests/main/note-types.test.ts
git commit -m "feat: add note document types with validation and tests"
```

---

### Task 3: Create file system utility service

**Files:**
- Create: `src/main/services/file-system.ts`
- Create: `tests/main/file-system.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// tests/main/file-system.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  readJsonFile,
  writeJsonFile,
  readTextFile,
  writeTextFile,
  deleteFile,
  fileExists,
  listDirectory,
  ensureDir
} from '../../src/main/services/file-system'

describe('file-system', () => {
  let testDir: string

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'cns-test-'))
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe('JSON files', () => {
    it('writes and reads a JSON file', async () => {
      const filePath = join(testDir, 'test.json')
      const data = { name: 'test', items: [1, 2, 3] }
      await writeJsonFile(filePath, data)
      const result = await readJsonFile<typeof data>(filePath)
      expect(result).toEqual(data)
    })

    it('creates parent directories when writing', async () => {
      const filePath = join(testDir, 'nested', 'deep', 'file.json')
      await writeJsonFile(filePath, { ok: true })
      const exists = await fileExists(filePath)
      expect(exists).toBe(true)
    })
  })

  describe('text files', () => {
    it('writes and reads a text file', async () => {
      const filePath = join(testDir, 'note.md')
      const content = '# Hello\n\nWorld'
      await writeTextFile(filePath, content)
      const result = await readTextFile(filePath)
      expect(result).toBe(content)
    })
  })

  describe('fileExists', () => {
    it('returns true for existing file', async () => {
      const filePath = join(testDir, 'exists.txt')
      await writeTextFile(filePath, 'hello')
      expect(await fileExists(filePath)).toBe(true)
    })

    it('returns false for missing file', async () => {
      expect(await fileExists(join(testDir, 'nope.txt'))).toBe(false)
    })
  })

  describe('deleteFile', () => {
    it('deletes an existing file', async () => {
      const filePath = join(testDir, 'delete-me.txt')
      await writeTextFile(filePath, 'bye')
      await deleteFile(filePath)
      expect(await fileExists(filePath)).toBe(false)
    })

    it('throws on non-existent file', async () => {
      await expect(deleteFile(join(testDir, 'ghost.txt'))).rejects.toThrow()
    })
  })

  describe('listDirectory', () => {
    it('lists directory contents', async () => {
      await writeTextFile(join(testDir, 'a.txt'), '')
      await writeTextFile(join(testDir, 'b.txt'), '')
      const entries = await listDirectory(testDir)
      expect(entries.sort()).toEqual(['a.txt', 'b.txt'])
    })
  })

  describe('ensureDir', () => {
    it('creates directory if it does not exist', async () => {
      const dirPath = join(testDir, 'new-dir', 'sub')
      await ensureDir(dirPath)
      expect(await fileExists(dirPath)).toBe(true)
    })

    it('does not throw if directory exists', async () => {
      const dirPath = join(testDir, 'existing')
      await ensureDir(dirPath)
      await ensureDir(dirPath)
      expect(await fileExists(dirPath)).toBe(true)
    })
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd /Users/wangyan/Desktop/note && npx vitest run tests/main/file-system.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write src/main/services/file-system.ts**

```typescript
import fs from 'node:fs/promises'
import path from 'node:path'

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, 'utf-8')
  return JSON.parse(content) as T
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

export async function readTextFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8')
}

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf-8')
}

export async function deleteFile(filePath: string): Promise<void> {
  await fs.unlink(filePath)
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export async function listDirectory(dirPath: string): Promise<string[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  return entries.map((e) => e.name)
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd /Users/wangyan/Desktop/note && npx vitest run tests/main/file-system.test.ts`
Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/file-system.ts tests/main/file-system.test.ts
git commit -m "feat: add file system utility service with tests"
```

---

### Task 4: Create notebook config service

**Files:**
- Create: `src/main/services/notebook-config.ts`
- Create: `tests/main/notebook-config.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// tests/main/notebook-config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadConfig, saveConfig } from '../../src/main/services/notebook-config'
import type { NotebookConfig } from '../../src/main/types'

describe('notebook-config', () => {
  let testDir: string

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'cns-config-'))
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('loadConfig returns default config when notebook.json does not exist', async () => {
    const config = await loadConfig(testDir)
    expect(config.name).toBeTruthy()
    expect(config.codeRepos).toEqual([])
  })

  it('saveConfig writes notebook.json and loadConfig reads it back', async () => {
    const config: NotebookConfig = {
      name: 'my-notes',
      codeRepos: [
        {
          path: '/home/user/projects/algo',
          commit: 'a1b2c3d4',
          lsp: { language: 'cpp', command: 'clangd' }
        }
      ]
    }
    await saveConfig(testDir, config)
    const loaded = await loadConfig(testDir)
    expect(loaded).toEqual(config)
  })

  it('saveConfig overwrites existing config', async () => {
    await saveConfig(testDir, { name: 'first', codeRepos: [] })
    await saveConfig(testDir, { name: 'second', codeRepos: [] })
    const loaded = await loadConfig(testDir)
    expect(loaded.name).toBe('second')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd /Users/wangyan/Desktop/note && npx vitest run tests/main/notebook-config.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write src/main/services/notebook-config.ts**

```typescript
import path from 'node:path'
import { readJsonFile, writeJsonFile, fileExists } from './file-system'
import type { NotebookConfig } from '../types'

const CONFIG_FILE = 'notebook.json'

const DEFAULT_CONFIG: NotebookConfig = {
  name: '',
  codeRepos: []
}

export async function loadConfig(projectPath: string): Promise<NotebookConfig> {
  const configPath = path.join(projectPath, CONFIG_FILE)
  const exists = await fileExists(configPath)
  if (!exists) {
    return { ...DEFAULT_CONFIG, name: path.basename(projectPath) }
  }
  return readJsonFile<NotebookConfig>(configPath)
}

export async function saveConfig(projectPath: string, config: NotebookConfig): Promise<void> {
  const configPath = path.join(projectPath, CONFIG_FILE)
  await writeJsonFile(configPath, config)
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd /Users/wangyan/Desktop/note && npx vitest run tests/main/notebook-config.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/notebook-config.ts tests/main/notebook-config.test.ts
git commit -m "feat: add notebook.json config service with tests"
```

---

### Task 5: Create note CRUD service

**Files:**
- Create: `src/main/services/note-service.ts`
- Create: `tests/main/note-service.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// tests/main/note-service.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ensureDir } from '../../src/main/services/file-system'
import {
  createNote,
  readNote,
  updateNote,
  deleteNote,
  renameNote,
  listNotes,
  noteExists
} from '../../src/main/services/note-service'
import type { MindMapDocument, DerivationDocument } from '../../src/main/schemas/note-types'

describe('note-service', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'cns-notes-'))
    await ensureDir(join(testDir, 'notes'))
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe('createNote + readNote', () => {
    it('creates and reads a mind map note', async () => {
      await createNote(testDir, 'topics/algorithms.mind.json', 'mind')
      const doc = await readNote(testDir, 'topics/algorithms.mind.json') as MindMapDocument
      expect(doc.type).toBe('mind')
      expect(doc.version).toBe(1)
      expect(doc.root.title).toBe('New Mind Map')
    })

    it('creates and reads a derivation note', async () => {
      await createNote(testDir, 'math/main-theorem.derive.json', 'derive')
      const doc = await readNote(testDir, 'math/main-theorem.derive.json') as DerivationDocument
      expect(doc.type).toBe('derive')
      expect(doc.nodes).toEqual([])
    })

    it('creates and reads a markdown note', async () => {
      await createNote(testDir, 'notes/readme.md', 'md')
      const content = await readNote(testDir, 'notes/readme.md') as string
      expect(content).toBe('# notes/readme.md\n\n')
    })
  })

  describe('updateNote', () => {
    it('updates a mind map note', async () => {
      await createNote(testDir, 'test.mind.json', 'mind')
      const doc = await readNote(testDir, 'test.mind.json') as MindMapDocument
      doc.root.title = 'Updated Title'
      await updateNote(testDir, 'test.mind.json', doc)
      const updated = await readNote(testDir, 'test.mind.json') as MindMapDocument
      expect(updated.root.title).toBe('Updated Title')
    })

    it('updates a markdown note', async () => {
      await createNote(testDir, 'test.md', 'md')
      await updateNote(testDir, 'test.md', '# New Content')
      const content = await readNote(testDir, 'test.md') as string
      expect(content).toBe('# New Content')
    })
  })

  describe('deleteNote', () => {
    it('deletes a note', async () => {
      await createNote(testDir, 'delete-me.md', 'md')
      await deleteNote(testDir, 'delete-me.md')
      const exists = await noteExists(testDir, 'delete-me.md')
      expect(exists).toBe(false)
    })
  })

  describe('renameNote', () => {
    it('renames a note', async () => {
      await createNote(testDir, 'old-name.md', 'md')
      await renameNote(testDir, 'old-name.md', 'new-name.md')
      const exists = await noteExists(testDir, 'new-name.md')
      expect(exists).toBe(true)
      const oldExists = await noteExists(testDir, 'old-name.md')
      expect(oldExists).toBe(false)
    })
  })

  describe('listNotes', () => {
    it('lists notes in directory tree', async () => {
      await createNote(testDir, 'a.mind.json', 'mind')
      await createNote(testDir, 'b.md', 'md')
      await createNote(testDir, 'sub/c.derive.json', 'derive')
      const notes = await listNotes(testDir)
      expect(notes).toHaveLength(3)
      expect(notes.map((n) => n.name).sort()).toEqual(['a.mind.json', 'b.md', 'c.derive.json'])
    })

    it('returns empty array when no notes exist', async () => {
      const notes = await listNotes(testDir)
      expect(notes).toEqual([])
    })

    it('filters by note type', async () => {
      await createNote(testDir, 'a.mind.json', 'mind')
      await createNote(testDir, 'b.md', 'md')
      await createNote(testDir, 'c.derive.json', 'derive')
      const mdNotes = await listNotes(testDir, 'md')
      expect(mdNotes).toHaveLength(1)
      expect(mdNotes[0].name).toBe('b.md')
    })
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd /Users/wangyan/Desktop/note && npx vitest run tests/main/note-service.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write src/main/services/note-service.ts**

```typescript
import path from 'node:path'
import {
  readJsonFile,
  writeJsonFile,
  readTextFile,
  writeTextFile,
  deleteFile,
  fileExists,
  listDirectory,
  ensureDir
} from './file-system'
import {
  createMindMapDocument,
  createDerivationDocument,
  isValidMindMapDocument,
  isValidDerivationDocument
} from '../schemas/note-types'
import type { MindMapDocument, DerivationDocument } from '../schemas/note-types'
import type { NoteFileType, NoteListItem } from '../types'

const NOTES_DIR = 'notes'

function getExtensions(type: NoteFileType): string {
  switch (type) {
    case 'mind':
      return '.mind.json'
    case 'derive':
      return '.derive.json'
    case 'md':
      return '.md'
  }
}

function getNoteType(fileName: string): NoteFileType | null {
  if (fileName.endsWith('.mind.json')) return 'mind'
  if (fileName.endsWith('.derive.json')) return 'derive'
  if (fileName.endsWith('.md')) return 'md'
  return null
}

function getFullPath(projectPath: string, relativePath: string): string {
  return path.join(projectPath, NOTES_DIR, relativePath)
}

export type NoteContent = string | MindMapDocument | DerivationDocument

export async function createNote(
  projectPath: string,
  relativePath: string,
  type: NoteFileType
): Promise<void> {
  const fullPath = getFullPath(projectPath, relativePath)
  await ensureDir(path.dirname(fullPath))

  let content: NoteContent
  switch (type) {
    case 'mind':
      content = createMindMapDocument()
      await writeJsonFile(fullPath, content)
      break
    case 'derive':
      content = createDerivationDocument()
      await writeJsonFile(fullPath, content)
      break
    case 'md':
      content = `# ${path.basename(relativePath)}\n\n`
      await writeTextFile(fullPath, content)
      break
  }
}

export async function readNote(
  projectPath: string,
  relativePath: string
): Promise<NoteContent> {
  const fullPath = getFullPath(projectPath, relativePath)
  const ext = path.extname(relativePath)

  if (relativePath.endsWith('.mind.json')) {
    const doc = await readJsonFile<MindMapDocument>(fullPath)
    if (!isValidMindMapDocument(doc)) {
      throw new Error(`Invalid mind map document: ${relativePath}`)
    }
    return doc
  }

  if (relativePath.endsWith('.derive.json')) {
    const doc = await readJsonFile<DerivationDocument>(fullPath)
    if (!isValidDerivationDocument(doc)) {
      throw new Error(`Invalid derivation document: ${relativePath}`)
    }
    return doc
  }

  return readTextFile(fullPath)
}

export async function updateNote(
  projectPath: string,
  relativePath: string,
  content: NoteContent
): Promise<void> {
  const fullPath = getFullPath(projectPath, relativePath)

  if (typeof content === 'string') {
    await writeTextFile(fullPath, content)
  } else {
    await writeJsonFile(fullPath, content)
  }
}

export async function deleteNote(
  projectPath: string,
  relativePath: string
): Promise<void> {
  const fullPath = getFullPath(projectPath, relativePath)
  await deleteFile(fullPath)
}

export async function renameNote(
  projectPath: string,
  oldRelativePath: string,
  newRelativePath: string
): Promise<void> {
  const oldPath = getFullPath(projectPath, oldRelativePath)
  const newPath = getFullPath(projectPath, newRelativePath)
  await ensureDir(path.dirname(newPath))

  const fs = await import('node:fs/promises')
  await fs.rename(oldPath, newPath)
}

export async function noteExists(
  projectPath: string,
  relativePath: string
): Promise<boolean> {
  return fileExists(getFullPath(projectPath, relativePath))
}

export async function listNotes(
  projectPath: string,
  filterType?: NoteFileType
): Promise<NoteListItem[]> {
  const notesDir = path.join(projectPath, NOTES_DIR)
  const exists = await fileExists(notesDir)
  if (!exists) return []

  const result: NoteListItem[] = []

  async function scanDir(dirPath: string, relativeDir: string) {
    const entries = await listDirectory(dirPath)
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry)
      const relPath = relativeDir ? `${relativeDir}/${entry}` : entry

      const fs = await import('node:fs/promises')
      let stat
      try {
        stat = await fs.stat(fullPath)
      } catch {
        continue
      }

      if (stat.isDirectory()) {
        await scanDir(fullPath, relPath)
      } else {
        const type = getNoteType(entry)
        if (type && (!filterType || type === filterType)) {
          result.push({
            name: entry,
            relativePath: relPath,
            type
          })
        }
      }
    }
  }

  await scanDir(notesDir, '')
  return result
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd /Users/wangyan/Desktop/note && npx vitest run tests/main/note-service.test.ts`
Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/note-service.ts tests/main/note-service.test.ts
git commit -m "feat: add note CRUD service with tests"
```

---

### Task 6: Create SQLite index database service

**Files:**
- Create: `src/main/services/index-db.ts`
- Create: `tests/main/index-db.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// tests/main/index-db.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { initDatabase, closeDatabase } from '../../src/main/services/index-db'

describe('index-db', () => {
  let testDir: string

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'cns-db-'))
  })

  afterEach(() => {
    closeDatabase()
    rmSync(testDir, { recursive: true, force: true })
  })

  it('initDatabase creates the index.db file', () => {
    initDatabase(testDir)
    const fs = require('node:fs')
    expect(fs.existsSync(join(testDir, '.index.db'))).toBe(true)
  })

  it('initDatabase creates the code_mappings table', () => {
    const db = initDatabase(testDir)
    const result = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='code_mappings'"
    ).get() as { name: string } | undefined
    expect(result).toBeDefined()
    expect(result!.name).toBe('code_mappings')
  })

  it('initDatabase is idempotent', () => {
    initDatabase(testDir)
    const db = initDatabase(testDir)
    const result = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='code_mappings'"
    ).get() as { name: string } | undefined
    expect(result).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd /Users/wangyan/Desktop/note && npx vitest run tests/main/index-db.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write src/main/services/index-db.ts**

```typescript
import Database from 'better-sqlite3'
import path from 'node:path'

let db: Database.Database | null = null

export function initDatabase(projectPath: string): Database.Database {
  if (db) return db

  const dbPath = path.join(projectPath, '.index.db')
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS code_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_path TEXT NOT NULL,
      function_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(note_path, function_name, file_path)
    )
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_code_mappings_note
    ON code_mappings(note_path)
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_code_mappings_function
    ON code_mappings(function_name, file_path)
  `)

  return db
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd /Users/wangyan/Desktop/note && npx vitest run tests/main/index-db.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/index-db.ts tests/main/index-db.test.ts
git commit -m "feat: add SQLite index database with schema initialization"
```

---

### Task 7: Add IPC handlers to main process

**Files:**
- Create: `src/main/ipc-handlers.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Write src/main/ipc-handlers.ts**

```typescript
import { ipcMain } from 'electron'
import { loadConfig, saveConfig } from './services/notebook-config'
import {
  createNote,
  readNote,
  updateNote,
  deleteNote,
  renameNote,
  listNotes,
  noteExists
} from './services/note-service'
import { initDatabase, closeDatabase } from './services/index-db'
import type { NotebookConfig } from './types'
import type { NoteFileType, NoteListItem } from './types'
import type { NoteContent } from './services/note-service'

let currentProjectPath: string | null = null

export function registerIpcHandlers(projectPath: string): void {
  currentProjectPath = projectPath

  initDatabase(projectPath)

  // Notebook config
  ipcMain.handle('config:load', async (): Promise<NotebookConfig> => {
    return loadConfig(projectPath)
  })

  ipcMain.handle('config:save', async (_event, config: NotebookConfig): Promise<void> => {
    return saveConfig(projectPath, config)
  })

  // Notes
  ipcMain.handle('notes:list', async (_event, filterType?: NoteFileType): Promise<NoteListItem[]> => {
    return listNotes(projectPath, filterType)
  })

  ipcMain.handle('notes:create', async (_event, relativePath: string, type: NoteFileType): Promise<void> => {
    return createNote(projectPath, relativePath, type)
  })

  ipcMain.handle('notes:read', async (_event, relativePath: string): Promise<NoteContent> => {
    return readNote(projectPath, relativePath)
  })

  ipcMain.handle('notes:update', async (_event, relativePath: string, content: NoteContent): Promise<void> => {
    return updateNote(projectPath, relativePath, content)
  })

  ipcMain.handle('notes:delete', async (_event, relativePath: string): Promise<void> => {
    return deleteNote(projectPath, relativePath)
  })

  ipcMain.handle('notes:rename', async (_event, oldPath: string, newPath: string): Promise<void> => {
    return renameNote(projectPath, oldPath, newPath)
  })

  ipcMain.handle('notes:exists', async (_event, relativePath: string): Promise<boolean> => {
    return noteExists(projectPath, relativePath)
  })

  // Cleanup
  ipcMain.handle('app:get-project-path', (): string | null => {
    return currentProjectPath
  })
}

export function unregisterIpcHandlers(): void {
  closeDatabase()
  currentProjectPath = null
}
```

- [ ] **Step 2: Modify src/main/index.ts**

Add after the `ipcMain.handle('get-app-version', ...)` line and before `app.whenReady()`:

```typescript
import { registerIpcHandlers, unregisterIpcHandlers } from './ipc-handlers'
import { join } from 'node:path'
import { app as electronApp } from 'electron'

// ... inside app.whenReady().then(() => { ... }), BEFORE createWindow():
const projectPath = join(electronApp.getPath('home'), 'code-note-studio-workspace')
registerIpcHandlers(projectPath)
```

And add cleanup on quit:

```typescript
app.on('will-quit', () => {
  unregisterIpcHandlers()
})
```

The final `src/main/index.ts` should read:

```typescript
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { registerIpcHandlers, unregisterIpcHandlers } from './ipc-handlers'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    show: false,
    title: 'Code Note Studio',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('get-app-version', () => app.getVersion())

app.whenReady().then(() => {
  const projectPath = join(app.getPath('home'), 'code-note-studio-workspace')
  registerIpcHandlers(projectPath)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  unregisterIpcHandlers()
})
```

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc-handlers.ts src/main/index.ts
git commit -m "feat: add IPC handlers for note operations and config"
```

---

### Task 8: Update preload script with note API

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Rewrite src/preload/index.ts**

```typescript
import { contextBridge, ipcRenderer } from 'electron'

const api = {
  platform: process.platform,

  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),

  getProjectPath: (): Promise<string | null> => ipcRenderer.invoke('app:get-project-path'),

  // Config
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (config: unknown) => ipcRenderer.invoke('config:save', config),

  // Notes
  listNotes: (filterType?: string) => ipcRenderer.invoke('notes:list', filterType),
  createNote: (relativePath: string, type: string) =>
    ipcRenderer.invoke('notes:create', relativePath, type),
  readNote: (relativePath: string) => ipcRenderer.invoke('notes:read', relativePath),
  updateNote: (relativePath: string, content: unknown) =>
    ipcRenderer.invoke('notes:update', relativePath, content),
  deleteNote: (relativePath: string) => ipcRenderer.invoke('notes:delete', relativePath),
  renameNote: (oldPath: string, newPath: string) =>
    ipcRenderer.invoke('notes:rename', oldPath, newPath),
  noteExists: (relativePath: string) => ipcRenderer.invoke('notes:exists', relativePath)
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
```

- [ ] **Step 2: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat: add note and config APIs to preload bridge"
```

---

### Task 9: Update renderer type declarations

**Files:**
- Modify: `src/renderer/src/types/electron.d.ts`

- [ ] **Step 1: Update electron.d.ts to include new API methods**

Replace `src/renderer/src/types/electron.d.ts` content:
```typescript
import type { NotebookConfig, NoteItem, NoteType, NoteAPI, ConfigAPI } from './index'

declare global {
  interface Window {
    electronAPI: {
      platform: string
      getAppVersion: () => Promise<string>
      getProjectPath: () => Promise<string | null>
      loadConfig: () => Promise<NotebookConfig>
      saveConfig: (config: NotebookConfig) => Promise<void>
      listNotes: (filterType?: NoteType) => Promise<NoteItem[]>
      createNote: (relativePath: string, type: NoteType) => Promise<void>
      readNote: (relativePath: string) => Promise<string | object>
      updateNote: (relativePath: string, content: unknown) => Promise<void>
      deleteNote: (relativePath: string) => Promise<void>
      renameNote: (oldPath: string, newPath: string) => Promise<void>
      noteExists: (relativePath: string) => Promise<boolean>
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/types/electron.d.ts
git commit -m "feat: add IPC API type declarations to renderer window"
```

---

### Task 10: Run all tests and verify build

- [ ] **Step 1: Run all tests**

Run: `cd /Users/wangyan/Desktop/note && npx vitest run`
Expected: All tests PASS (12 existing + ~30 new = ~42 tests)

- [ ] **Step 2: Run production build**

Run: `cd /Users/wangyan/Desktop/note && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Run TypeScript check**

Run: `cd /Users/wangyan/Desktop/note && npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json`
Expected: Zero TypeScript errors

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: finalize note types and storage layer"
```

---

### Verification Checklist

```
[ ] npm test passes all tests (12 + ~30 = ~42 total)
[ ] npm run build completes without errors
[ ] tsc --noEmit passes for both node and web configs
[ ] .mind.json files serialize/deserialize correctly
[ ] .derive.json files serialize/deserialize correctly
[ ] notebook.json load/save round-trips correctly
[ ] .index.db is created with code_mappings table
[ ] IPC handlers registered without errors at app startup
```
