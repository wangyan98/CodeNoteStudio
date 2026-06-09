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
