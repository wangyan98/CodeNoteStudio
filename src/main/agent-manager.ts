import { spawn, ChildProcess } from 'child_process'
import net from 'net'
import path from 'path'
import { app } from 'electron'

let agentProcess: ChildProcess | null = null
let agentPort: number | null = null
let restartAttempts = 0
const MAX_RESTART_ATTEMPTS = 3

function getRandomPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address === 'object') {
        const port = address.port
        server.close(() => resolve(port))
      } else {
        reject(new Error('Failed to get random port'))
      }
    })
  })
}

async function waitForHealth(port: number, timeoutMs: number = 5000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/health`)
      if (resp.ok) return true
    } catch {
      // not ready yet
    }
    await new Promise(r => setTimeout(r, 200))
  }
  return false
}

export async function startAgent(): Promise<{ port: number }> {
  if (agentProcess && agentPort) {
    try {
      const resp = await fetch(`http://127.0.0.1:${agentPort}/health`)
      if (resp.ok) return { port: agentPort }
    } catch {
      // Process died, restart
      agentProcess = null
      agentPort = null
    }
  }

  const port = await getRandomPort()
  const serverScript = path.join(app.getAppPath(), 'agent', 'server.py')

  agentProcess = spawn('python3', [serverScript, '--port', String(port), '--host', '127.0.0.1'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  agentProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`[agent] ${data.toString().trim()}`)
  })

  agentProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[agent:err] ${data.toString().trim()}`)
  })

  agentProcess.on('exit', (code, signal) => {
    console.log(`[agent] Process exited (code=${code}, signal=${signal})`)
    agentProcess = null
    agentPort = null

    if (restartAttempts < MAX_RESTART_ATTEMPTS) {
      restartAttempts++
      console.log(`[agent] Auto-restart attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS}`)
      startAgent()
    }
  })

  const healthy = await waitForHealth(port, 5000)
  if (!healthy) {
    agentProcess.kill()
    agentProcess = null
    throw new Error('Agent server failed to start within timeout')
  }

  restartAttempts = 0
  agentPort = port
  return { port }
}

export function stopAgent(): void {
  if (agentProcess) {
    agentProcess.kill()
    agentProcess = null
    agentPort = null
    restartAttempts = MAX_RESTART_ATTEMPTS // prevent auto-restart
  }
}

export function getAgentPort(): number | null {
  return agentPort
}
