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

function getProvidersFilePath(): string {
  return path.join(CONFIG_DIR, 'providers.json')
}

function migrateLegacyProviders(): AgentProvider[] | null {
  const oldPath = getProvidersFilePath()
  if (!fs.existsSync(oldPath)) return null
  try {
    const raw = fs.readFileSync(oldPath, 'utf-8')
    const oldProviders = JSON.parse(raw)
    if (!Array.isArray(oldProviders) || oldProviders.length === 0) return null
    const migrated: AgentProvider[] = oldProviders
      .filter((p: any) => p && typeof p === 'object')
      .map((p: any) => ({
        id: p.id || '',
        name: p.name || '',
        model: p.model || '',
        endpoint: p.base_url || '',
        apiKey: p.api_key || '',
        enabled: true
      }))
    // Write migrated config immediately so it persists
    const config: AgentConfig = { ...DEFAULTS, providers: migrated }
    writeAgentConfig(config)
    return migrated
  } catch {
    return null
  }
}

export function readAgentConfig(): AgentConfig {
  const filePath = getConfigFilePath()
  if (!fs.existsSync(filePath)) {
    const migrated = migrateLegacyProviders()
    if (migrated) {
      return { ...DEFAULTS, providers: migrated }
    }
    return { ...DEFAULTS }
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw)
    return {
      pythonPath: data.pythonPath ?? DEFAULTS.pythonPath,
      agentScriptPath: data.agentScriptPath ?? DEFAULTS.agentScriptPath,
      autoStart: data.autoStart ?? DEFAULTS.autoStart,
      providers: Array.isArray(data.providers)
        ? data.providers.filter((p: any) => p && typeof p === 'object')
        : []
    }
  } catch {
    console.warn(`[agent-config] Corrupted config at ${filePath}, using defaults`)
    return { ...DEFAULTS }
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
    fs.chmodSync(filePath, 0o600)
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}
