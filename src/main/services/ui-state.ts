import fs from 'node:fs'
import path from 'node:path'

const UI_STATE_FILE = 'ui-state.json'

export interface UiState {
  selectedNoteId: string | null
  codeRepoPath: string | null
  openCodeFiles: Array<{ path: string; name: string; language: string }>
  activeCodeFileIndex: number
}

export function loadUiState(projectPath: string): UiState | null {
  const filePath = path.join(projectPath, UI_STATE_FILE)
  if (!fs.existsSync(filePath)) return null
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as UiState
  } catch {
    return null
  }
}

export function saveUiState(projectPath: string, state: UiState): void {
  const filePath = path.join(projectPath, UI_STATE_FILE)
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8')
}
