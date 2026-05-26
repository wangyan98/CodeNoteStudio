import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const WORKSPACE_FILE = 'workspace.json'

function getWorkspaceFilePath(): string {
  return path.join(app.getPath('userData'), WORKSPACE_FILE)
}

export async function saveLastWorkspacePath(workspacePath: string): Promise<void> {
  const filePath = getWorkspaceFilePath()
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(filePath, JSON.stringify({ lastPath: workspacePath }), 'utf-8')
}

export async function loadLastWorkspacePath(): Promise<string | null> {
  const filePath = getWorkspaceFilePath()
  if (!fs.existsSync(filePath)) {
    return null
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw)
    return typeof data.lastPath === 'string' ? data.lastPath : null
  } catch {
    return null
  }
}

export function validateWorkspacePath(workspacePath: string): boolean {
  if (!workspacePath || !path.isAbsolute(workspacePath)) return false
  try {
    const stat = fs.statSync(workspacePath)
    return stat.isDirectory()
  } catch {
    return false
  }
}
