// src/renderer/src/components/ConfigDialog.tsx
import { useState, useEffect, useCallback } from 'react'
import './ConfigDialog.css'

interface AgentProvider {
  id: string
  name: string
  model: string
  endpoint: string
  apiKey: string
  enabled: boolean
}

interface AgentConfig {
  pythonPath: string
  agentScriptPath: string
  autoStart: boolean
  providers: AgentProvider[]
}

interface ConfigDialogProps {
  visible: boolean
  onClose: () => void
}

const EMPTY_CONFIG: AgentConfig = {
  pythonPath: 'python3',
  agentScriptPath: '',
  autoStart: true,
  providers: []
}

export function ConfigDialog({ visible, onClose }: ConfigDialogProps) {
  const [config, setConfig] = useState<AgentConfig>(EMPTY_CONFIG)
  const [minimized, setMinimized] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (!visible) return
    window.electronAPI.getAgentConfig().then((cfg) => {
      setConfig(cfg)
      setSaveStatus('idle')
    }).catch(() => {
      setConfig(EMPTY_CONFIG)
    })
  }, [visible])

  const handleSave = useCallback(async () => {
    setSaveStatus('saving')
    try {
      const result = await window.electronAPI.saveAgentConfig(config)
      if (result.ok) {
        setSaveStatus('saved')
        setSaveError('')
        setTimeout(() => setSaveStatus('idle'), 2000)
      } else {
        setSaveStatus('error')
        setSaveError(result.error || 'Unknown error')
      }
    } catch (e: any) {
      setSaveStatus('error')
      setSaveError(e.message)
    }
  }, [config])

  const updateProvider = useCallback((index: number, field: string, value: string | boolean) => {
    setConfig((prev) => {
      const providers = [...prev.providers]
      providers[index] = { ...providers[index], [field]: value }
      return { ...prev, providers }
    })
    setSaveStatus('idle')
  }, [])

  const addProvider = useCallback(() => {
    setConfig((prev) => ({
      ...prev,
      providers: [
        ...prev.providers,
        { id: '', name: '', model: '', endpoint: '', apiKey: '', enabled: true }
      ]
    }))
    setSaveStatus('idle')
  }, [])

  const removeProvider = useCallback((index: number) => {
    setConfig((prev) => ({
      ...prev,
      providers: prev.providers.filter((_, i) => i !== index)
    }))
    setSaveStatus('idle')
  }, [])

  if (!visible) return null

  return (
    <div className="config-dialog-overlay">
      <div className={`config-dialog${minimized ? ' minimized' : ''}`}>
        <div className="config-dialog-header">
          <span className="config-dialog-title">Agent Configuration</span>
          <div className="config-dialog-header-actions">
            <button className="config-dialog-header-btn" onClick={() => setMinimized(!minimized)} title={minimized ? 'Expand' : 'Minimize'}>
              {minimized ? '□' : '−'}
            </button>
            <button className="config-dialog-header-btn" onClick={onClose}>×</button>
          </div>
        </div>
        {!minimized && (
          <>
            <div className="config-dialog-body">
              <div className="config-section">
                <div className="config-section-title">Agent Service</div>

                <div className="config-field">
                  <label>Python Path</label>
                  <input
                    type="text"
                    value={config.pythonPath}
                    onChange={(e) => { setConfig((p) => ({ ...p, pythonPath: e.target.value })); setSaveStatus('idle') }}
                    placeholder="python3"
                  />
                </div>

                <div className="config-field">
                  <label>Agent Script Path</label>
                  <input
                    type="text"
                    value={config.agentScriptPath}
                    onChange={(e) => { setConfig((p) => ({ ...p, agentScriptPath: e.target.value })); setSaveStatus('idle') }}
                    placeholder="Auto-detected from bundled agent/"
                  />
                </div>

                <label className="config-toggle">
                  <input
                    type="checkbox"
                    checked={config.autoStart}
                    onChange={(e) => { setConfig((p) => ({ ...p, autoStart: e.target.checked })); setSaveStatus('idle') }}
                  />
                  Auto-start agent on workspace open
                </label>
              </div>

              <div className="config-section">
                <div className="config-section-title">Model Providers</div>

                {config.providers.map((provider, i) => (
                  <div key={i} className="config-provider-card">
                    <div className="config-provider-card-header">
                      <span className="provider-name">{provider.name || 'New Provider'}</span>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <label className="config-toggle" style={{ margin: 0 }}>
                          <input
                            type="checkbox"
                            checked={provider.enabled}
                            onChange={(e) => updateProvider(i, 'enabled', e.target.checked)}
                          />
                        </label>
                        <button
                          className="config-dialog-header-btn"
                          onClick={() => removeProvider(i)}
                          title="Remove provider"
                          style={{ fontSize: '12px' }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div className="config-provider-card-fields">
                      <div className="config-field">
                        <label>ID</label>
                        <input
                          type="text"
                          value={provider.id}
                          onChange={(e) => updateProvider(i, 'id', e.target.value)}
                          placeholder="openai"
                        />
                      </div>
                      <div className="config-field">
                        <label>Name</label>
                        <input
                          type="text"
                          value={provider.name}
                          onChange={(e) => updateProvider(i, 'name', e.target.value)}
                          placeholder="OpenAI"
                        />
                      </div>
                      <div className="config-field">
                        <label>Model</label>
                        <input
                          type="text"
                          value={provider.model}
                          onChange={(e) => updateProvider(i, 'model', e.target.value)}
                          placeholder="gpt-4o"
                        />
                      </div>
                      <div className="config-field">
                        <label>Endpoint</label>
                        <input
                          type="text"
                          value={provider.endpoint}
                          onChange={(e) => updateProvider(i, 'endpoint', e.target.value)}
                          placeholder="https://api.openai.com/v1"
                        />
                      </div>
                      <div className="config-field full-width">
                        <label>API Key</label>
                        <input
                          type="password"
                          value={provider.apiKey}
                          onChange={(e) => updateProvider(i, 'apiKey', e.target.value)}
                          placeholder="sk-..."
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  className="config-dialog-header-btn"
                  onClick={addProvider}
                  style={{ alignSelf: 'flex-start', fontSize: '12px', padding: '4px 10px' }}
                >
                  + Add Provider
                </button>
              </div>
            </div>

            <div className="config-dialog-footer">
              {saveStatus === 'saved' && <span className="config-save-status">Saved</span>}
              {saveStatus === 'error' && <span className="config-save-status error">{saveError}</span>}
              <button className="config-save-btn" onClick={handleSave} disabled={saveStatus === 'saving'}>
                {saveStatus === 'saving' ? 'Saving...' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
