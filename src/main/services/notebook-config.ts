import path from 'node:path'
import { readJsonFile, writeJsonFile, fileExists } from './file-system'
import type { NotebookConfig } from '../types'

const CONFIG_FILE = 'notebook.json'

const DEFAULT_CONFIG: NotebookConfig = {
  name: '',
  notesPath: './',
  codeRepos: []
}

export async function loadConfig(projectPath: string): Promise<NotebookConfig> {
  const configPath = path.join(projectPath, CONFIG_FILE)
  const exists = await fileExists(configPath)
  if (!exists) {
    return { ...DEFAULT_CONFIG, name: path.basename(projectPath) }
  }
  try {
    const config = await readJsonFile<NotebookConfig>(configPath)
    return {
      notesPath: config.notesPath || DEFAULT_CONFIG.notesPath,
      name: config.name || path.basename(projectPath),
      codeRepos: Array.isArray(config.codeRepos) ? config.codeRepos : []
    }
  } catch {
    console.warn(`[notebook-config] Corrupted config at ${configPath}, using defaults`)
    return { ...DEFAULT_CONFIG, name: path.basename(projectPath) }
  }
}

export async function saveConfig(projectPath: string, config: NotebookConfig): Promise<void> {
  const configPath = path.join(projectPath, CONFIG_FILE)
  await writeJsonFile(configPath, config)
}
