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
  ensureDir,
  listRepoFiles,
  copyFileToAssets
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

  describe('listRepoFiles', () => {
    it('lists files recursively', async () => {
      await writeTextFile(join(testDir, 'src', 'main.ts'), 'code')
      await writeTextFile(join(testDir, 'src', 'utils.ts'), 'code')
      await writeTextFile(join(testDir, 'README.md'), 'readme')
      const files = await listRepoFiles(testDir)
      expect(files).toHaveLength(4)
      expect(files.map(f => f.name).sort()).toEqual(['README.md', 'main.ts', 'src', 'utils.ts'])
    })

    it('excludes .git directories', async () => {
      await writeTextFile(join(testDir, 'src', 'main.ts'), 'code')
      await writeTextFile(join(testDir, '.git', 'config'), 'config')
      const files = await listRepoFiles(testDir)
      expect(files).toHaveLength(2)
    })

    it('excludes node_modules directories', async () => {
      await writeTextFile(join(testDir, 'src', 'main.ts'), 'code')
      await writeTextFile(join(testDir, 'node_modules', 'dep', 'index.js'), 'js')
      const files = await listRepoFiles(testDir)
      expect(files).toHaveLength(2)
    })
  })

  describe('copyFileToAssets', () => {
    it('copies a file to the assets directory', async () => {
      const sourcePath = join(testDir, 'img.png')
      await writeTextFile(sourcePath, 'fake-image-data')
      const result = await copyFileToAssets(sourcePath, testDir)
      expect(result.relativePath).toBe('./assets/img.png')
      const copiedExists = await fileExists(join(testDir, 'assets', 'img.png'))
      expect(copiedExists).toBe(true)
    })

    it('deduplicates when filename already exists', async () => {
      const sourcePath = join(testDir, 'icon.png')
      await writeTextFile(sourcePath, 'data')
      // Create a file at the destination first
      await ensureDir(join(testDir, 'assets'))
      await writeTextFile(join(testDir, 'assets', 'icon.png'), 'existing')
      const result = await copyFileToAssets(sourcePath, testDir)
      expect(result.relativePath).toBe('./assets/icon-1.png')
    })
  })
})
