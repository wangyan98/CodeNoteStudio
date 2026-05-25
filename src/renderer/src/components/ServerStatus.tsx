import { useLiveServer } from '../hooks/useLiveServer'
import { useAppContext } from '../contexts/AppContext'
import './ServerStatus.css'

export function ServerStatus() {
  const { isReadOnly } = useAppContext()
  const { running, url, loading, startServer, stopServer } = useLiveServer(isReadOnly)

  if (isReadOnly) return null

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(url)
  }

  return (
    <div className="server-status-bar">
      {running ? (
        <>
          <span className="server-status-indicator server-running"></span>
          <span className="server-url">{url}</span>
          <button className="server-btn" onClick={handleCopyUrl}>Copy</button>
          <button
            className="server-btn server-stop"
            onClick={stopServer}
            disabled={loading}
          >
            Stop
          </button>
        </>
      ) : (
        <>
          <span className="server-status-indicator server-stopped"></span>
          <span className="server-label">Web server offline</span>
          <button
            className="server-btn server-start"
            onClick={startServer}
            disabled={loading}
          >
            Start Live Server
          </button>
        </>
      )}
    </div>
  )
}
