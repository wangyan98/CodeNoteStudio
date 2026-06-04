import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const WORKSPACE_FILE = 'workspace.json'

export interface WorkspaceHistoryEntry {
  path: string
  name: string
  lastOpened: number
}

interface WorkspaceData {
  history: WorkspaceHistoryEntry[]
}

const MAX_HISTORY = 10

function getWorkspaceFilePath(): string {
  return path.join(app.getPath('userData'), WORKSPACE_FILE)
}

function readWorkspaceData(): WorkspaceData {
  const filePath = getWorkspaceFilePath()
  if (!fs.existsSync(filePath)) {
    return { history: [] }
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw)
    // Migration: old format { lastPath: "..." }
    if (data.lastPath && !data.history) {
      return {
        history: [{ path: data.lastPath, name: path.basename(data.lastPath), lastOpened: Date.now() }]
      }
    }
    if (Array.isArray(data.history)) {
      return { history: data.history }
    }
    return { history: [] }
  } catch {
    return { history: [] }
  }
}

function writeWorkspaceData(data: WorkspaceData): void {
  const filePath = getWorkspaceFilePath()
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

export async function addToHistory(workspacePath: string, name: string): Promise<void> {
  const data = readWorkspaceData()
  // Remove existing entry with same path
  data.history = data.history.filter((e) => e.path !== workspacePath)
  // Insert at front
  data.history.unshift({ path: workspacePath, name, lastOpened: Date.now() })
  // Trim to max
  if (data.history.length > MAX_HISTORY) {
    data.history = data.history.slice(0, MAX_HISTORY)
  }
  writeWorkspaceData(data)
}

export async function getHistory(): Promise<WorkspaceHistoryEntry[]> {
  return readWorkspaceData().history
}

export async function removeFromHistory(workspacePath: string): Promise<void> {
  const data = readWorkspaceData()
  data.history = data.history.filter((e) => e.path !== workspacePath)
  writeWorkspaceData(data)
}

export async function loadLastWorkspacePath(): Promise<string | null> {
  const { history } = readWorkspaceData()
  if (history.length === 0) return null
  return history[0].path
}

// Deprecated — kept for backward compat only during migration
export async function saveLastWorkspacePath(workspacePath: string): Promise<void> {
  await addToHistory(workspacePath, path.basename(workspacePath))
}

export function validateWorkspacePath(workspacePath: string): boolean {
  if (!workspacePath || !path.isAbsolute(workspacePath)) return false
  try {
    fs.accessSync(workspacePath, fs.constants.R_OK | fs.constants.W_OK)
    const stat = fs.statSync(workspacePath)
    return stat.isDirectory()
  } catch {
    return false
  }
}
