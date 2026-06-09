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
