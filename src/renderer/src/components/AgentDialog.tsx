import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppContext } from '../contexts/AppContext'
import { renderMarkdown } from '../services/markdown-renderer'
import './AgentDialog.css'

export interface FrozenContext {
  workspace: string
  repos: string[]
  activeFile: string
  providerId: string
  frozenAt: string
}

export function buildFrozenFromState(state: any, selectedProvider: string): FrozenContext {
  const activeFilePath =
    state.activeCodeFileIndex >= 0
      ? state.openCodeFiles?.[state.activeCodeFileIndex]?.path || ''
      : ''
  return {
    workspace: state.workspacePath || '',
    repos: state.codeRepoPath ? [state.codeRepoPath] : [],
    activeFile: activeFilePath,
    providerId: selectedProvider || '',
    frozenAt: new Date().toISOString(),
  }
}

export type RoundState = 'pending' | 'frozen' | 'staleContext'

export function deriveRoundState(messagesLen: number, frozen: FrozenContext | null): RoundState {
  if (messagesLen === 0) return 'pending'
  return frozen ? 'frozen' : 'staleContext'
}

interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'error'
  content: string
  toolName?: string
  thinking?: string  // streaming thinking that preceded this assistant message
}

interface Provider {
  id: string
  name: string
  model: string
}

interface AgentDialogProps {
  visible: boolean
  onClose: () => void
}

export function AgentDialog({ visible, onClose }: AgentDialogProps) {
  const { state, dispatch } = useAppContext()
  const [messages, setMessages] = useState<Message[]>([])
  const [thinkingText, setThinkingText] = useState('')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [providers, setProviders] = useState<Provider[]>([])
  const [selectedProvider, setSelectedProvider] = useState('')
  const [port, setPort] = useState<number | null>(null)
  const [connecting, setConnecting] = useState(true)
  const [minimized, setMinimized] = useState(false)
  const [frozen, setFrozen] = useState<FrozenContext | null>(null)
  const frozenRef = useRef<FrozenContext | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => { frozenRef.current = frozen }, [frozen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!visible) return
    setConnecting(true)
    window.electronAPI.getAgentPort().then(async (p) => {
      setPort(p)
      setConnecting(false)
      try {
        const resp = await fetch(`http://127.0.0.1:${p}/providers`)
        const data = await resp.json()
        setProviders(data.providers || [])
        if (data.providers?.length > 0 && !selectedProvider) {
          setSelectedProvider(data.providers[0].id)
        }
      } catch (e: any) {
      console.error('Failed to load providers:', e, 'port:', p)
      setMessages(prev => [...prev, {
        id: Math.random().toString(36),
        role: 'error',
        content: `Failed to connect to agent at port ${p}. Is the server running?`,
      }])
    }

      try {
        const resp = await fetch(`http://127.0.0.1:${p}/history`)
        const data = await resp.json()
        if (data.ok) {
          const restored = data.messages
            .map((m: any) => ({
              id: Math.random().toString(36),
              role: m.role === 'tool' ? 'tool_result' : m.role,
              content: typeof m.content === 'string' ? m.content : (m.content != null ? JSON.stringify(m.content) : ''),
              toolName: m.tool_name,
            }))
            .filter((m: Message) => m.role !== 'tool_call' && m.role !== 'tool_result' && m.content?.trim())
          setMessages(restored)
          // Restore the round snapshot if the backend persisted one.
          // Backend snapshot uses snake_case; map to the frontend FrozenContext.
          const f = data.frozen
          setFrozen(f ? {
            workspace: f.workspace || '',
            repos: Array.isArray(f.repos) ? f.repos : [],
            activeFile: f.active_file || '',
            providerId: f.provider_id || '',
            frozenAt: f.frozen_at || '',
          } : null)
        }
      } catch {}
    }).catch((e) => {
      console.error('Failed to start agent:', e)
      setConnecting(false)
      setMessages(prev => [...prev, {
        id: Math.random().toString(36),
        role: 'error',
        content: `Agent server failed to start: ${e.message}. Check that python3 and dependencies are installed.`,
      }])
    })
  }, [visible])

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading) return
    if (!port) {
      setMessages(prev => [...prev, {
        id: Math.random().toString(36),
        role: 'error',
        content: 'Agent is not connected yet. Please wait...',
      }])
      return
    }

    const userMsg: Message = {
      id: Math.random().toString(36),
      role: 'user',
      content: input.trim(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    // Freeze config on the first send of a round only.
    const msgCount = messages.length
    const rs = deriveRoundState(msgCount, frozenRef.current)
    let snapshot = frozenRef.current
    if (rs === 'pending') {
      snapshot = buildFrozenFromState(state, selectedProvider)
      setFrozen(snapshot)
      frozenRef.current = snapshot
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg.content,
          provider_id: snapshot?.providerId || selectedProvider,
          workspace: snapshot?.workspace || '',
          repos: snapshot?.repos || [],
          active_file: snapshot?.activeFile || '',
        }),
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let assistantText = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))

            switch (event.type) {
              case 'thinking':
                setThinkingText(prev => prev + event.content)
                break

              case 'text':
                {
                  const hadThinking = thinkingText
                  setThinkingText('')
                  assistantText += event.content
                  setMessages(prev => {
                    const last = prev[prev.length - 1]
                    if (last?.role === 'assistant') {
                      return [...prev.slice(0, -1), { ...last, content: assistantText }]
                    }
                    return [...prev, {
                      id: Math.random().toString(36),
                      role: 'assistant',
                      content: assistantText,
                      thinking: hadThinking || undefined,
                    }]
                  })
                }
                break

              case 'tool_call':
                setMessages(prev => [...prev, {
                  id: Math.random().toString(36),
                  role: 'tool_call',
                  content: `${event.name}(${JSON.stringify(event.arguments)})`,
                  toolName: event.name,
                }])
                break

              case 'tool_result':
                setMessages(prev => [...prev, {
                  id: Math.random().toString(36),
                  role: 'tool_result',
                  content: JSON.stringify(event.result, null, 2),
                  toolName: event.name,
                }])
                break

              case 'error':
                setMessages(prev => [...prev, {
                  id: Math.random().toString(36),
                  role: 'error',
                  content: event.content,
                }])
                break

              case 'done':
                setThinkingText('')
                break

              case 'resume':
                setThinkingText('')
                break
            }
          } catch {}
        }
      }
    } catch (e: any) {
      console.error('Chat fetch failed. Port:', port, 'Error:', e)
      setMessages(prev => [...prev, {
        id: Math.random().toString(36),
        role: 'error',
        content: `Error fetching http://127.0.0.1:${port}/chat: ${e.message}`,
      }])
    } finally {
      setLoading(false)
    }
  }, [input, port, loading, selectedProvider, messages])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClearHistory = async () => {
    if (!port) return
    try {
      await fetch(`http://127.0.0.1:${port}/history`, { method: 'DELETE' })
      setMessages([])
      setFrozen(null)
      frozenRef.current = null
    } catch {}
  }

  const handleDocClick = (docPath: string) => {
    dispatch({ type: 'SELECT_NOTE', noteId: docPath })
    onClose()
  }

  const DOC_PATH_RE = /(docs\/[\w./-]+\.(?:md|mind\.json|derive\.json|net\.json))/g

  const renderAssistantHtml = (content: string): string => {
    // Pre-process: convert raw doc paths to markdown links so renderMarkdown
    // turns them into <a> tags with a custom protocol we can intercept on click.
    const preprocessed = content.replace(DOC_PATH_RE, '[$1](doclink://$1)')
    return renderMarkdown(preprocessed, [])
  }

  const renderContent = (msg: Message) => {
    if (msg.role === 'assistant') {
      return renderAssistantHtml(msg.content)
    }
    return msg.content
  }

  if (!visible) return null

  const roundState = deriveRoundState(messages.length, frozen)
  const repoLabel =
    roundState === 'frozen'
      ? (frozen!.repos[0]?.split('/').pop() || 'none')
      : roundState === 'pending'
      ? (state.codeRepoPath?.split('/').pop() || 'none')
      : '快照不可用'

  return (
    <div className="agent-dialog-overlay">
      <div className={`agent-dialog${minimized ? ' minimized' : ''}`}>
        <div className="agent-dialog-header">
          <span className="agent-dialog-title">Code Agent</span>
          <div className="agent-dialog-header-actions">
            <button className="agent-dialog-header-btn" onClick={handleClearHistory} title="Clear history">
              Clear
            </button>
            <button className="agent-dialog-header-btn" onClick={() => setMinimized(!minimized)} title={minimized ? 'Expand' : 'Minimize'}>
              {minimized ? '□' : '−'}
            </button>
            <button className="agent-dialog-header-btn" onClick={onClose}>×</button>
          </div>
        </div>
        {!minimized && (
          <>
            <div className="agent-dialog-context">
              <select value={selectedProvider} onChange={(e) => setSelectedProvider(e.target.value)}>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.model})</option>
                ))}
              </select>
              <span title={frozen?.activeFile || state.codeRepoPath || ''}>
                {roundState === 'frozen' ? '🔒 ' : ''}Repo: {repoLabel}
              </span>
            </div>
            <div
              className="agent-dialog-messages"
              onClick={(e) => {
                const anchor = (e.target as HTMLElement).closest('a[href^="doclink://"]')
                if (anchor) {
                  e.preventDefault()
                  const href = anchor.getAttribute('href') || ''
                  const docPath = href.slice('doclink://'.length)
                  if (docPath) handleDocClick(docPath)
                }
              }}
            >
              {thinkingText && (
                <div className="agent-message assistant">
                  <details open>
                    <summary>🤔 Thinking...</summary>
                    <div className="thinking-content">{thinkingText}</div>
                  </details>
                </div>
              )}
              {messages
                .filter(msg => msg.role !== 'tool_call' && msg.role !== 'tool_result' && msg.content?.trim())
                .map((msg) => {
                const content = renderContent(msg)
                if (msg.role === 'assistant') {
                  return (
                    <div key={msg.id} className="agent-message assistant">
                      {msg.thinking && (
                        <details open>
                          <summary>🤔 Thinking...</summary>
                          <div className="thinking-content">{msg.thinking}</div>
                        </details>
                      )}
                      <div
                        className="assistant-content"
                        dangerouslySetInnerHTML={{ __html: content as string }}
                      />
                    </div>
                  )
                }
                return (
                  <div key={msg.id} className={`agent-message ${msg.role}`}>
                    {content}
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>
            <div className="agent-dialog-input">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={connecting ? 'Connecting to agent...' : 'Type a message...'}
                disabled={loading || connecting}
              />
              <button onClick={handleSend} disabled={loading || !input.trim()}>
                {loading ? '...' : 'Send'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
