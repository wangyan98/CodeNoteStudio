import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { createWebApiClient } from './services/web-api-client'

const IS_BROWSER = typeof (window as any).electronAPI === 'undefined'

if (IS_BROWSER) {
  ;(window as any).electronAPI = createWebApiClient()
  console.log('[web-live-server] Running in browser mode')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App isReadOnly={IS_BROWSER} />
  </StrictMode>
)
