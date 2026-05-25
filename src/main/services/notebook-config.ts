import path from 'node:path'
import { readJsonFile, writeJsonFile, fileExists } from './file-system'
import type { NotebookConfig } from '../types'

const CONFIG_FILE = 'notebook.json'

const DEFAULT_CONFIG: NotebookConfig = {
  name: '',
  codeRepos: []
}

export async function loadConfig(projectPath: string): Promise<NotebookConfig> {
  const configPath = path.join(projectPath, CONFIG_FILE)
  const exists = await fileExists(configPath)
  if (!exists) {
    return { ...DEFAULT_CONFIG, name: path.basename(projectPath) }
  }
  return readJsonFile<NotebookConfig>(configPath)
}

export async function saveConfig(projectPath: string, config: NotebookConfig): Promise<void> {
  const configPath = path.join(projectPath, CONFIG_FILE)
  await writeJsonFile(configPath, config)
}
