// src/main/services/agent-config.ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const CONFIG_DIR = path.join(os.homedir(), '.code-note-studio')
const CONFIG_FILE = 'agent-config.json'

export interface AgentProvider {
  id: string
  name: string
  model: string
  endpoint: string
  apiKey: string
  enabled: boolean
}

export interface AgentConfig {
  pythonPath: string
  agentScriptPath: string
  autoStart: boolean
  providers: AgentProvider[]
}

const DEFAULTS: AgentConfig = {
  pythonPath: 'python3',
  agentScriptPath: '',
  autoStart: true,
  providers: []
}

function getConfigFilePath(): string {
  return path.join(CONFIG_DIR, CONFIG_FILE)
}

export function readAgentConfig(): AgentConfig {
  const filePath = getConfigFilePath()
  if (!fs.existsSync(filePath)) {
    return { ...DEFAULTS, providers: [] }
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw)
    return {
      pythonPath: data.pythonPath ?? DEFAULTS.pythonPath,
      agentScriptPath: data.agentScriptPath ?? DEFAULTS.agentScriptPath,
      autoStart: data.autoStart ?? DEFAULTS.autoStart,
      providers: Array.isArray(data.providers) ? data.providers : []
    }
  } catch {
    return { ...DEFAULTS, providers: [] }
  }
}

export function writeAgentConfig(config: AgentConfig): { ok: boolean; error?: string } {
  const filePath = getConfigFilePath()
  const dir = path.dirname(filePath)
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8')
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}
