import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import { App } from './App'
import { createWebApiClient } from './services/web-api-client'

loader.config({ monaco })

// Load Monaco workers from local bundle instead of CDN (required for CSP compliance)
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    switch (label) {
      case 'json':
        return new Worker(new URL('monaco-editor/esm/vs/language/json/json.worker.js', import.meta.url), { type: 'module' })
      case 'css':
      case 'scss':
      case 'less':
        return new Worker(new URL('monaco-editor/esm/vs/language/css/css.worker.js', import.meta.url), { type: 'module' })
      case 'html':
      case 'handlebars':
      case 'razor':
        return new Worker(new URL('monaco-editor/esm/vs/language/html/html.worker.js', import.meta.url), { type: 'module' })
      case 'typescript':
      case 'javascript':
        return new Worker(new URL('monaco-editor/esm/vs/language/typescript/ts.worker.js', import.meta.url), { type: 'module' })
      default:
        return new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), { type: 'module' })
    }
  }
}

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
