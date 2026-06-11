// tests/main/agent-config.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import os from 'node:os'

describe('agent-config', () => {
  let configDir: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'cns-agent-config-'))
    vi.spyOn(os, 'homedir').mockReturnValue(configDir)
    vi.resetModules()
  })

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('readAgentConfig returns defaults when file does not exist', async () => {
    const { readAgentConfig } = await import('../../src/main/services/agent-config')
    const config = readAgentConfig()
    expect(config.pythonPath).toBe('python3')
    expect(config.agentScriptPath).toBe('')
    expect(config.autoStart).toBe(true)
    expect(config.providers).toEqual([])
  })

  it('writeAgentConfig and readAgentConfig round-trip', async () => {
    const { writeAgentConfig, readAgentConfig } = await import('../../src/main/services/agent-config')
    const config = {
      pythonPath: '/usr/bin/python3',
      agentScriptPath: '/app/agent/server.py',
      autoStart: false,
      providers: [
        {
          id: 'openai',
          name: 'OpenAI',
          model: 'gpt-4o',
          endpoint: 'https://api.openai.com/v1',
          apiKey: 'sk-test',
          enabled: true,
        },
      ],
    }
    const result = writeAgentConfig(config)
    expect(result.ok).toBe(true)

    const loaded = readAgentConfig()
    expect(loaded.pythonPath).toBe('/usr/bin/python3')
    expect(loaded.autoStart).toBe(false)
    expect(loaded.providers).toHaveLength(1)
    expect(loaded.providers[0].id).toBe('openai')
  })

  it('readAgentConfig returns defaults with corrupt JSON', async () => {
    mkdirSync(join(configDir, '.code-note-studio'), { recursive: true })
    writeFileSync(join(configDir, '.code-note-studio', 'agent-config.json'), '{{{ not valid json }}}')

    const { readAgentConfig } = await import('../../src/main/services/agent-config')
    const config = readAgentConfig()
    expect(config.pythonPath).toBe('python3')
    expect(config.providers).toEqual([])
  })

  it('migrates legacy providers.json to agent-config.json', async () => {
    mkdirSync(join(configDir, '.code-note-studio'), { recursive: true })
    writeFileSync(
      join(configDir, '.code-note-studio', 'providers.json'),
      JSON.stringify([
        { id: 'deepseek', name: 'DeepSeek', base_url: 'https://api.deepseek.com/v1', api_key: 'sk-key', model: 'deepseek-v4' }
      ])
    )

    const { readAgentConfig } = await import('../../src/main/services/agent-config')
    const config = readAgentConfig()

    expect(config.providers).toHaveLength(1)
    expect(config.providers[0].id).toBe('deepseek')
    expect(config.providers[0].name).toBe('DeepSeek')
    expect(config.providers[0].model).toBe('deepseek-v4')
    expect(config.providers[0].endpoint).toBe('https://api.deepseek.com/v1')
    expect(config.providers[0].apiKey).toBe('sk-key')
    expect(config.providers[0].enabled).toBe(true)
    expect(config.pythonPath).toBe('python3')
    expect(config.autoStart).toBe(true)
  })

  it('writeAgentConfig returns error on write failure', async () => {
    // Override homedir to /dev/null which is a file, so mkdirSync will fail
    vi.restoreAllMocks()
    vi.spyOn(os, 'homedir').mockReturnValue('/dev/null')
    vi.resetModules()

    const { writeAgentConfig } = await import('../../src/main/services/agent-config')

    const result = writeAgentConfig({
      pythonPath: 'python3',
      agentScriptPath: '',
      autoStart: true,
      providers: []
    })
    expect(result.ok).toBe(false)
    expect(typeof result.error).toBe('string')
  })
})
