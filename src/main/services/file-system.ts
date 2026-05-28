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

export async function readBinaryFile(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath)
  return buffer.toString('base64')
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

export async function copyFileToAssets(
  sourcePath: string,
  workspacePath: string
): Promise<{ relativePath: string; absolutePath: string }> {
  const destDir = path.join(workspacePath, 'assets')
  await ensureDir(destDir)

  const originalName = path.basename(sourcePath)
  let destName = originalName
  let destPath = path.join(destDir, destName)

  // Deduplicate: icon.png → icon-1.png if exists
  let counter = 1
  while (await fileExists(destPath)) {
    const ext = path.extname(originalName)
    const base = path.basename(originalName, ext)
    destName = `${base}-${counter}${ext}`
    destPath = path.join(destDir, destName)
    counter++
  }

  await fs.copyFile(sourcePath, destPath)
  return { relativePath: `./assets/${destName}`, absolutePath: destPath }
}

export interface RepoFileEntry {
  name: string
  relativePath: string
  absolutePath: string
  isDirectory: boolean
}

const IGNORE_DIRS = new Set([
  '.git', 'node_modules', '__pycache__', '.venv', 'venv',
  '.idea', '.vscode', 'dist', 'build', 'out', '.next',
  'target', '.DS_Store'
])

export async function listRepoFiles(rootPath: string): Promise<RepoFileEntry[]> {
  const result: RepoFileEntry[] = []

  async function scan(dirPath: string, relativeDir: string): Promise<void> {
    let entries: string[]
    try {
      const dirents = await fs.readdir(dirPath, { withFileTypes: true })
      entries = dirents.map(e => e.name)
    } catch {
      return
    }

    for (const name of entries) {
      if (name.startsWith('.') && name !== '.env') continue
      if (IGNORE_DIRS.has(name)) continue

      const absolutePath = path.join(dirPath, name)
      const relativePath = relativeDir ? `${relativeDir}/${name}` : name

      let stat
      try {
        stat = await fs.stat(absolutePath)
      } catch {
        continue
      }

      if (stat.isDirectory()) {
        // Also include directories in result for the tree structure
        result.push({ name, relativePath, absolutePath, isDirectory: true })
        await scan(absolutePath, relativePath)
      } else {
        result.push({ name, relativePath, absolutePath, isDirectory: false })
      }
    }
  }

  await scan(rootPath, '')
  return result.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}
