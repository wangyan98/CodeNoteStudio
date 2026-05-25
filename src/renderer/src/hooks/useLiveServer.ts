import { useState, useCallback, useEffect } from 'react'

interface ServerState {
  running: boolean
  port: number
  url: string
  loading: boolean
}

export function useLiveServer(isReadOnly: boolean) {
  const [server, setServer] = useState<ServerState>({
    running: false,
    port: 0,
    url: '',
    loading: false
  })

  useEffect(() => {
    if (isReadOnly) return
    window.electronAPI.getServerStatus().then((status) => {
      setServer((prev) => ({ ...prev, ...status, loading: false }))
    })
  }, [isReadOnly])

  const startServer = useCallback(async () => {
    if (isReadOnly) return
    setServer((prev) => ({ ...prev, loading: true }))
    const status = await window.electronAPI.startServer()
    setServer({ ...status, loading: false })
  }, [isReadOnly])

  const stopServer = useCallback(async () => {
    if (isReadOnly) return
    setServer((prev) => ({ ...prev, loading: true }))
    await window.electronAPI.stopServer()
    setServer({ running: false, port: 0, url: '', loading: false })
  }, [isReadOnly])

  return { ...server, startServer, stopServer }
}
