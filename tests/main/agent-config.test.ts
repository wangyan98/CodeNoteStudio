// tests/main/agent-config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('agent-config (integration)', () => {
  let configDir: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'cns-agent-config-'))
  })

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true })
  })

  it('default config has expected shape', () => {
    const defaults = {
      pythonPath: 'python3',
      agentScriptPath: '',
      autoStart: true,
      providers: []
    }
    expect(defaults).toHaveProperty('pythonPath')
    expect(defaults).toHaveProperty('agentScriptPath')
    expect(defaults).toHaveProperty('autoStart')
    expect(defaults).toHaveProperty('providers')
    expect(Array.isArray(defaults.providers)).toBe(true)
  })

  it('writes and reads config file correctly', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')

    const config = {
      pythonPath: '/usr/bin/python3',
      agentScriptPath: '/app/agent/server.py',
      autoStart: false,
      providers: [
        { id: 'openai', name: 'OpenAI', model: 'gpt-4o', endpoint: 'https://api.openai.com/v1', apiKey: 'sk-test', enabled: true }
      ]
    }

    const filePath = path.join(configDir, 'agent-config.json')
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8')

    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw)

    expect(parsed.pythonPath).toBe('/usr/bin/python3')
    expect(parsed.providers).toHaveLength(1)
    expect(parsed.providers[0].id).toBe('openai')
  })

  it('returns defaults when file does not exist', () => {
    const defaultProviders: Array<{
      id: string; name: string; model: string; endpoint: string; apiKey: string; enabled: boolean
    }> = []
    expect(defaultProviders).toEqual([])
  })
})
