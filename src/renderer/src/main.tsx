import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import { App } from './App'
import { createWebApiClient } from './services/web-api-client'

const IS_BROWSER = typeof (window as any).electronAPI === 'undefined'

if (IS_BROWSER) {
  // Web mode: load Monaco from local server to avoid CDN CSP violation
  loader.config({ paths: { vs: '/monaco-vs' } })
} else {
  // Electron mode: use the bundled monaco-editor package
  loader.config({ monaco })
}

if (IS_BROWSER) {
  ;(window as any).electronAPI = createWebApiClient()
  console.log('[web-live-server] Running in browser mode')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App isReadOnly={IS_BROWSER} />
  </StrictMode>
)
