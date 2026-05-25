import path from 'node:path'
import fs from 'node:fs/promises'
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

  switch (type) {
    case 'mind': {
      const content = createMindMapDocument()
      await writeJsonFile(fullPath, content)
      break
    }
    case 'derive': {
      const content = createDerivationDocument()
      await writeJsonFile(fullPath, content)
      break
    }
    case 'md': {
      const content = `# ${path.basename(relativePath)}\n\n`
      await writeTextFile(fullPath, content)
      break
    }
  }
}

export async function readNote(
  projectPath: string,
  relativePath: string
): Promise<NoteContent> {
  const fullPath = getFullPath(projectPath, relativePath)

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

  async function scanDir(dirPath: string, relativeDir: string): Promise<void> {
    const entries = await listDirectory(dirPath)
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry)
      const relPath = relativeDir ? `${relativeDir}/${entry}` : entry

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
