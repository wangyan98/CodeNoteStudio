import fs from 'node:fs'
import path from 'node:path'
import type { CodeMapping } from './ref-resolver'

function getCachePath(projectPath: string, notePath: string): string {
  return path.join(projectPath, notePath + '.refs.json')
}

export function loadRefCache(projectPath: string, notePath: string): CodeMapping[] {
  const cachePath = getCachePath(projectPath, notePath)
  if (!fs.existsSync(cachePath)) return []
  try {
    const raw = fs.readFileSync(cachePath, 'utf-8')
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

export function saveRefCache(
  projectPath: string,
  notePath: string,
  mappings: CodeMapping[]
): void {
  const cachePath = getCachePath(projectPath, notePath)
  if (mappings.length === 0) {
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath)
    }
    return
  }
  const dir = path.dirname(cachePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(cachePath, JSON.stringify(mappings, null, 2), 'utf-8')
}

export function deleteRefCache(projectPath: string, notePath: string): void {
  const cachePath = getCachePath(projectPath, notePath)
  if (fs.existsSync(cachePath)) {
    fs.unlinkSync(cachePath)
  }
}
