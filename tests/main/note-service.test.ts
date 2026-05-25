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
      expect(content).toBe('# readme.md\n\n')
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
