import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppContext } from '../contexts/AppContext'
import './AgentDialog.css'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'error'
  content: string
  toolName?: string
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
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [providers, setProviders] = useState<Provider[]>([])
  const [selectedProvider, setSelectedProvider] = useState('')
  const [port, setPort] = useState<number | null>(null)
  const [connecting, setConnecting] = useState(true)
  const [minimized, setMinimized] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

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
      } catch (e) {
        console.error('Failed to load providers:', e)
      }

      try {
        const resp = await fetch(`http://127.0.0.1:${p}/history`)
        const data = await resp.json()
        if (data.ok && data.messages.length > 0) {
          setMessages(data.messages.map((m: any) => ({
            id: Math.random().toString(36),
            role: m.role === 'tool' ? 'tool_result' : m.role,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            toolName: m.tool_name,
          })))
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

    try {
      const response = await fetch(`http://127.0.0.1:${port}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg.content,
          provider_id: selectedProvider,
          workspace: state.workspacePath || '',
          repos: state.codeRepoPath ? [state.codeRepoPath] : [],
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
              case 'text':
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
                  }]
                })
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
            }
          } catch {}
        }
      }
    } catch (e: any) {
      setMessages(prev => [...prev, {
        id: Math.random().toString(36),
        role: 'error',
        content: `Error: ${e.message}`,
      }])
    } finally {
      setLoading(false)
    }
  }, [input, port, loading, selectedProvider, state.workspacePath, state.codeRepoPath])

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
    } catch {}
  }

  const handleDocClick = (docPath: string) => {
    dispatch({ type: 'SELECT_NOTE', noteId: docPath })
    onClose()
  }

  const renderContent = (msg: Message) => {
    if (msg.role !== 'assistant') return msg.content

    const parts = msg.content.split(/(docs\/[\w./-]+\.(?:md|mind\.json|derive\.json|net\.json))/g)
    return parts.map((part, i) => {
      if (part.match(/^docs\/[\w./-]+\.(?:md|mind\.json|derive\.json|net\.json)$/)) {
        return (
          <span key={i} className="doc-link" onClick={() => handleDocClick(part)}>
            {part}
          </span>
        )
      }
      return part
    })
  }

  if (!visible) return null

  return (
    <div className="agent-dialog-overlay">
      <div className={`agent-dialog${minimized ? ' minimized' : ''}`}>
        <div className="agent-dialog-header">
          <span className="agent-dialog-title">Code Agent</span>
          <div className="agent-dialog-header-actions">
            <button className="agent-dialog-header-btn" onClick={() => setMinimized(!minimized)}>
              {minimized ? '□' : '−'}
            </button>
            <button className="agent-dialog-header-btn" onClick={handleClearHistory} title="Clear">
              Clear
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
              <span>Repo: {state.codeRepoPath?.split('/').pop() || 'none'}</span>
            </div>
            <div className="agent-dialog-messages">
              {messages.map((msg) => (
                <div key={msg.id} className={`agent-message ${msg.role}`}>
                  {renderContent(msg)}
                </div>
              ))}
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
