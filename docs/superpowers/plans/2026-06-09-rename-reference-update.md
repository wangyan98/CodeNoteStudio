# Rename Reference Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a note file is renamed, automatically update `![[path]]` and `[text](path)` references in `.md` and `.mind.json` files.

**Architecture:** New `src/main/services/update-references.ts` module containing path-matching and text-replacement logic. Called from `renameNote()` in `note-service.ts` after the file move. Scans only `.md` and `.mind.json` target files, resolves relative reference paths, and rewrites matching files.

**Tech Stack:** TypeScript, Node.js `fs`/`path`, vitest

---

### Task 1: Create `update-references.ts` service module

**Files:**
- Create: `src/main/services/update-references.ts`

- [ ] **Step 1: Write the module with note-type guard and path matching**

```ts
import path from 'node:path'
import { listNotes, readNote, updateNote } from './note-service'
import type { MindMapDocument, MindMapNode } from '../schemas/note-types'

function isNoteType(filePath: string): boolean {
  return (
    filePath.endsWith('.md') ||
    filePath.endsWith('.mind.json') ||
    filePath.endsWith('.derive.json') ||
    filePath.endsWith('.seq.mermaid') ||
    filePath.endsWith('.net.json')
  )
}

function resolveRefPath(refPath: string, fileDir: string): string {
  return path.normalize(path.join(fileDir, refPath)).replace(/\\/g, '/')
}

function matchesOldPath(refPath: string, fileDir: string, oldRelativePath: string): boolean {
  return resolveRefPath(refPath, fileDir) === oldRelativePath
}

function replaceEmbedRefs(
  text: string,
  oldPath: string,
  newPath: string,
  fileDir: string
): { content: string; replaced: boolean } {
  let replaced = false
  const newText = text.replace(/!\[\[([^\]]+)\]\]/g, (match, refPath: string) => {
    const trimmed = refPath.trim()
    if (!isNoteType(trimmed)) return match
    if (matchesOldPath(trimmed, fileDir, oldPath)) {
      replaced = true
      const newRefPath = path.relative(fileDir, newPath).replace(/\\/g, '/') || `./${path.basename(newPath)}`
      return `![[${newRefPath}]]`
    }
    return match
  })
  return { content: newText, replaced }
}

function replaceLinkRefs(
  text: string,
  oldPath: string,
  newPath: string,
  fileDir: string
): { content: string; replaced: boolean } {
  let replaced = false
  // (?<!!) excludes image syntax ![alt](url)
  const newText = text.replace(/(?<!!)\[([^\]]*)\]\(([^)]+)\)/g, (match, label: string, refPath: string) => {
    const trimmed = refPath.trim()
    if (!isNoteType(trimmed)) return match
    if (matchesOldPath(trimmed, fileDir, oldPath)) {
      replaced = true
      const newRefPath = path.relative(fileDir, newPath).replace(/\\/g, '/') || `./${path.basename(newPath)}`
      return `[${label}](${newRefPath})`
    }
    return match
  })
  return { content: newText, replaced }
}

function replaceInMd(
  content: string,
  oldPath: string,
  newPath: string,
  fileDir: string
): { content: string; replaced: boolean } {
  let replaced = false
  let newContent = content

  const embedResult = replaceEmbedRefs(newContent, oldPath, newPath, fileDir)
  newContent = embedResult.content
  replaced = embedResult.replaced

  const linkResult = replaceLinkRefs(newContent, oldPath, newPath, fileDir)
  newContent = linkResult.content
  replaced = replaced || linkResult.replaced

  return { content: newContent, replaced }
}

function replaceMindMapNode(
  node: MindMapNode,
  oldPath: string,
  newPath: string,
  fileDir: string
): { node: MindMapNode; replaced: boolean } {
  let replaced = false

  const titleResult = replaceEmbedRefs(node.title, oldPath, newPath, fileDir)
  const contentResult = replaceEmbedRefs(node.content, oldPath, newPath, fileDir)

  if (titleResult.replaced || contentResult.replaced) replaced = true

  const children = node.children.map((child) => {
    const result = replaceMindMapNode(child, oldPath, newPath, fileDir)
    if (result.replaced) replaced = true
    return result.node
  })

  return {
    node: {
      ...node,
      title: titleResult.content,
      content: contentResult.content,
      children
    },
    replaced
  }
}

function replaceInMindMap(
  doc: MindMapDocument,
  oldPath: string,
  newPath: string,
  fileDir: string
): { doc: MindMapDocument; replaced: boolean } {
  const result = replaceMindMapNode(doc.root, oldPath, newPath, fileDir)
  return { doc: { ...doc, root: result.node }, replaced: result.replaced }
}

export async function updateReferencesOnRename(
  projectPath: string,
  oldRelativePath: string,
  newRelativePath: string
): Promise<{ updated: number }> {
  let updated = 0
  const allNotes = await listNotes(projectPath)
  const targetNotes = allNotes.filter((n) => n.type === 'md' || n.type === 'mind')

  for (const note of targetNotes) {
    // Skip the renamed file itself
    if (note.relativePath === oldRelativePath) continue

    const fileDir = path.dirname(note.relativePath) || '.'

    try {
      const content = await readNote(projectPath, note.relativePath)

      if (note.type === 'md') {
        const result = replaceInMd(content as string, oldRelativePath, newRelativePath, fileDir)
        if (result.replaced) {
          await updateNote(projectPath, note.relativePath, result.content)
          updated++
        }
      } else if (note.type === 'mind') {
        const result = replaceInMindMap(
          content as MindMapDocument,
          oldRelativePath,
          newRelativePath,
          fileDir
        )
        if (result.replaced) {
          await updateNote(projectPath, note.relativePath, result.doc)
          updated++
        }
      }
    } catch {
      // Skip file on read/write errors, continue with remaining files
    }
  }

  return { updated }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/services/update-references.ts
git commit -m "feat: add update-references service for rename reference tracking"
```

---

### Task 2: Wire into `renameNote()` in `note-service.ts`

**Files:**
- Modify: `src/main/services/note-service.ts:146-162`

- [ ] **Step 1: Add the call to `updateReferencesOnRename`**

Replace the `renameNote` function body:

```ts
export async function renameNote(
  projectPath: string,
  oldRelativePath: string,
  newRelativePath: string
): Promise<void> {
  const oldPath = await getFullPath(projectPath, oldRelativePath)
  const newPath = await getFullPath(projectPath, newRelativePath)
  await ensureDir(path.dirname(newPath))
  await fs.rename(oldPath, newPath)
  // Move ref cache sidecar if it exists
  const { loadRefCache, saveRefCache, deleteRefCache } = await import('./ref-cache')
  const cached = loadRefCache(projectPath, oldRelativePath)
  if (cached.length > 0) {
    saveRefCache(projectPath, newRelativePath, cached)
    deleteRefCache(projectPath, oldRelativePath)
  }
  // Update ![[path]] and [text](path) references in other notes
  const { updateReferencesOnRename } = await import('./update-references')
  await updateReferencesOnRename(projectPath, oldRelativePath, newRelativePath)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/services/note-service.ts
git commit -m "feat: wire updateReferencesOnRename into renameNote"
```

---

### Task 3: Write tests

**Files:**
- Create: `tests/main/update-references.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ensureDir } from '../../src/main/services/file-system'
import { createNote, readNote, renameNote, updateNote } from '../../src/main/services/note-service'
import type { MindMapDocument } from '../../src/main/schemas/note-types'

describe('update-references (rename-triggered)', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'cns-ref-update-'))
    await ensureDir(join(testDir, 'notes'))
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('updates ![[path]] embed in .md file when referenced note is renamed', async () => {
    await createNote(testDir, 'target.md', 'md')
    await createNote(testDir, 'ref.md', 'md')
    await updateNote(testDir, 'ref.md', 'See ![[target.md]] for details')

    await renameNote(testDir, 'target.md', 'renamed-target.md')

    const content = await readNote(testDir, 'ref.md') as string
    expect(content).toContain('![[renamed-target.md]]')
    expect(content).not.toContain('![[target.md]]')
  })

  it('updates [text](path) link in .md file when referenced note is renamed', async () => {
    await createNote(testDir, 'target.md', 'md')
    await createNote(testDir, 'ref.md', 'md')
    await updateNote(testDir, 'ref.md', 'See [the target](target.md) for details')

    await renameNote(testDir, 'target.md', 'renamed-target.md')

    const content = await readNote(testDir, 'ref.md') as string
    expect(content).toContain('[the target](renamed-target.md)')
    expect(content).not.toContain('[the target](target.md)')
  })

  it('updates ![[path]] in .mind.json node title/content when referenced note is renamed', async () => {
    await createNote(testDir, 'target.md', 'md')
    await createNote(testDir, 'map.mind.json', 'mind')
    const doc = await readNote(testDir, 'map.mind.json') as MindMapDocument
    doc.root.title = 'See ![[target.md]]'
    doc.root.content = 'Details in ![[target.md]]'
    await updateNote(testDir, 'map.mind.json', doc)

    await renameNote(testDir, 'target.md', 'renamed-target.md')

    const updated = await readNote(testDir, 'map.mind.json') as MindMapDocument
    expect(updated.root.title).toContain('![[renamed-target.md]]')
    expect(updated.root.title).not.toContain('![[target.md]]')
    expect(updated.root.content).toContain('![[renamed-target.md]]')
  })

  it('updates references using relative paths across directories', async () => {
    await createNote(testDir, 'sub/target.md', 'md')
    await createNote(testDir, 'ref.md', 'md')
    await updateNote(testDir, 'ref.md', 'See ![[sub/target.md]]')

    await renameNote(testDir, 'sub/target.md', 'sub/renamed-target.md')

    const content = await readNote(testDir, 'ref.md') as string
    expect(content).toContain('![[sub/renamed-target.md]]')
  })

  it('does not modify references to non-note files', async () => {
    await createNote(testDir, 'target.md', 'md')
    await createNote(testDir, 'ref.md', 'md')
    await updateNote(testDir, 'ref.md', 'Code: ![[script.js]] and ![[target.md]]')

    await renameNote(testDir, 'target.md', 'renamed-target.md')

    const content = await readNote(testDir, 'ref.md') as string
    expect(content).toContain('![[script.js]]')  // unchanged — not a note type
    expect(content).toContain('![[renamed-target.md]]')
  })

  it('does not modify image syntax ![alt](url)', async () => {
    await createNote(testDir, 'target.md', 'md')
    await createNote(testDir, 'ref.md', 'md')
    await updateNote(testDir, 'ref.md', 'Image: ![screenshot](target.md) and link: [target](target.md)')

    await renameNote(testDir, 'target.md', 'renamed-target.md')

    const content = await readNote(testDir, 'ref.md') as string
    expect(content).toContain('![screenshot](target.md)')   // image URL not replaced
    expect(content).toContain('[target](renamed-target.md)')  // link is replaced
  })

  it('does not modify the renamed file itself', async () => {
    await createNote(testDir, 'self-ref.md', 'md')
    await updateNote(testDir, 'self-ref.md', 'See ![[self-ref.md]]')

    await renameNote(testDir, 'self-ref.md', 'new-name.md')

    const content = await readNote(testDir, 'new-name.md') as string
    // Content is unchanged — the renamed file is skipped during scan
    expect(content).toContain('![[self-ref.md]]')
  })

  it('resolves ../ relative paths when updating references', async () => {
    await createNote(testDir, 'shared/target.md', 'md')
    await createNote(testDir, 'notes/ref.md', 'md')
    await updateNote(testDir, 'notes/ref.md', 'See ![[../shared/target.md]]')

    await renameNote(testDir, 'shared/target.md', 'shared/renamed.md')

    const content = await readNote(testDir, 'notes/ref.md') as string
    expect(content).toContain('![[../shared/renamed.md]]')
  })

  it('handles rename of .mind.json file and updates .md references to it', async () => {
    await createNote(testDir, 'map.mind.json', 'mind')
    await createNote(testDir, 'ref.md', 'md')
    await updateNote(testDir, 'ref.md', 'Mind map: ![[map.mind.json]]')

    await renameNote(testDir, 'map.mind.json', 'renamed-map.mind.json')

    const content = await readNote(testDir, 'ref.md') as string
    expect(content).toContain('![[renamed-map.mind.json]]')
  })

  it('does not modify references when no file references the renamed note', async () => {
    await createNote(testDir, 'lonely.md', 'md')
    await createNote(testDir, 'other.md', 'md')
    await updateNote(testDir, 'other.md', 'No references here')

    // Should not throw
    await renameNote(testDir, 'lonely.md', 'still-lonely.md')

    const content = await readNote(testDir, 'other.md') as string
    expect(content).toBe('No references here')
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
npx vitest run tests/main/update-references.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/main/update-references.test.ts
git commit -m "test: add update-references tests for rename-triggered reference updates"
```
