# Project Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Initialize an Electron + React + TypeScript project with a resizable 4-panel layout shell, producing a runnable desktop app with empty placeholder panels.

**Architecture:** electron-vite scaffolds Electron's three-process architecture (main/preload/renderer). The renderer uses React with a single AppContext for state. The 4-panel layout uses `react-resizable-panels` for drag-to-resize with default ratios 18%/32%/32%/18%.

**Tech Stack:** Electron 33, electron-vite, React 18, TypeScript 5, react-resizable-panels, Vitest + @testing-library/react

---

### File Structure Map

```
/Users/wangyan/Desktop/note/
├── package.json                    # Dependencies, scripts, metadata
├── tsconfig.json                   # Base TS config (references sub-configs)
├── tsconfig.node.json              # Main + preload TS config
├── tsconfig.web.json               # Renderer TS config
├── electron.vite.config.ts         # electron-vite build configuration
├── vitest.config.ts                # Test configuration
├── src/
│   ├── main/
│   │   └── index.ts                # Electron main process entry
│   ├── preload/
│   │   └── index.ts                # contextBridge preload script
│   └── renderer/
│       ├── index.html              # HTML entry point
│       └── src/
│           ├── main.tsx            # React DOM root
│           ├── App.tsx             # Root component (wraps Layout + Context)
│           ├── App.css             # Global styles
│           ├── types/
│           │   └── index.ts        # All TypeScript type definitions
│           ├── contexts/
│           │   └── AppContext.tsx   # App-wide state (Context + Reducer)
│           └── components/
│               ├── Layout.tsx       # 4-panel resizable container
│               ├── Layout.css       # Layout-specific styles
│               ├── NoteDirectory.tsx    # Panel 1 placeholder
│               ├── NoteViewport.tsx     # Panel 2 placeholder
│               ├── CodeViewport.tsx     # Panel 3 placeholder
│               └── CodeDirectory.tsx    # Panel 4 placeholder
└── tests/
    └── renderer/
        ├── setup.ts                # Test setup (jsdom, cleanup)
        ├── Layout.test.tsx         # Layout rendering + resize tests
        └── AppContext.test.tsx     # Context reducer tests
```

---

### Task 1: Create package.json and install dependencies

**Files:**
- Create: `package.json`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "code-note-studio",
  "version": "0.1.0",
  "description": "Desktop code note-taking tool with mind maps, Markdown, and code integration",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-resizable-panels": "^2.0.25"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "electron": "^33.2.1",
    "electron-vite": "^2.3.0",
    "jsdom": "^25.0.1",
    "typescript": "^5.6.3",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd /Users/wangyan/Desktop/note && npm install`
Expected: Dependencies install without errors. `node_modules/` created.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: initialize project with package.json and dependencies"
```

---

### Task 2: Configure TypeScript and electron-vite

**Files:**
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tsconfig.web.json`
- Create: `electron.vite.config.ts`
- Create: `vitest.config.ts`

- [ ] **Step 1: Write tsconfig.json**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

- [ ] **Step 2: Write tsconfig.node.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./out",
    "declaration": true,
    "types": ["electron-vite/node"]
  },
  "include": ["src/main/**/*.ts", "src/preload/**/*.ts", "electron.vite.config.ts"]
}
```

- [ ] **Step 3: Write tsconfig.web.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./out",
    "declaration": true
  },
  "include": ["src/renderer/src/**/*.ts", "src/renderer/src/**/*.tsx"]
}
```

- [ ] **Step 4: Write electron.vite.config.ts**

```typescript
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    },
    plugins: [react()]
  }
})
```

- [ ] **Step 5: Write vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/renderer/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}']
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src')
    }
  }
})
```

- [ ] **Step 6: Verify TypeScript compilation setup**

Run: `cd /Users/wangyan/Desktop/note && npx tsc --noEmit`
Expected: Error about missing source files (haven't created them yet). This is OK — configs are valid.

- [ ] **Step 7: Commit**

```bash
git add tsconfig.json tsconfig.node.json tsconfig.web.json electron.vite.config.ts vitest.config.ts
git commit -m "chore: add TypeScript, electron-vite, and Vitest configuration"
```

---

### Task 3: Create Electron main process entry

**Files:**
- Create: `src/main/index.ts`

- [ ] **Step 1: Write main process entry**

```typescript
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: 'Code Note Studio',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: add Electron main process with window creation"
```

---

### Task 4: Create preload script

**Files:**
- Create: `src/preload/index.ts`

- [ ] **Step 1: Write preload script**

```typescript
import { contextBridge, ipcRenderer } from 'electron'

const api = {
  platform: process.platform,

  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version')
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
```

- [ ] **Step 2: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat: add preload script with contextBridge skeleton"
```

---

### Task 5: Create TypeScript types

**Files:**
- Create: `src/renderer/src/types/index.ts`

- [ ] **Step 1: Write type definitions**

```typescript
export type NoteType = 'mind' | 'md' | 'derive'

export type NoteFilter = 'all' | NoteType

export interface NoteItem {
  id: string
  name: string
  path: string
  type: NoteType
}

export interface CodeFile {
  path: string
  name: string
  language: string
}

export interface CodeRepo {
  path: string
  commit: string
  lsp: {
    language: string
    command: string
  }
}

export interface NotebookConfig {
  name: string
  codeRepos: CodeRepo[]
}

export interface PanelWidths {
  panel1: number
  panel2: number
  panel3: number
  panel4: number
}

export type AppAction =
  | { type: 'SELECT_NOTE'; noteId: string | null }
  | { type: 'SET_NOTE_FILTER'; filter: NoteFilter }
  | { type: 'SET_NOTE_SEARCH'; query: string }
  | { type: 'SET_NOTES'; notes: NoteItem[] }
  | { type: 'OPEN_CODE_FILE'; file: CodeFile }
  | { type: 'CLOSE_CODE_FILE'; index: number }
  | { type: 'SET_ACTIVE_CODE_FILE'; index: number }
  | { type: 'SET_CODE_REPO'; path: string }
  | { type: 'SET_CODE_FILES'; files: CodeFile[] }
  | { type: 'SET_PANEL_WIDTHS'; widths: PanelWidths }

export interface AppState {
  notes: NoteItem[]
  selectedNoteId: string | null
  noteFilter: NoteFilter
  noteSearchQuery: string
  openCodeFiles: CodeFile[]
  activeCodeFileIndex: number
  codeRepoPath: string | null
  codeFiles: CodeFile[]
  panelWidths: PanelWidths
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/types/index.ts
git commit -m "feat: add TypeScript type definitions for app state"
```

---

### Task 6: Create AppContext with reducer

**Files:**
- Create: `src/renderer/src/contexts/AppContext.tsx`
- Create: `tests/renderer/AppContext.test.tsx`

- [ ] **Step 1: Write the failing context tests**

```typescript
// tests/renderer/AppContext.test.tsx
import { describe, it, expect } from 'vitest'
import { appReducer, initialState } from '../../src/renderer/src/contexts/AppContext'

describe('appReducer', () => {
  it('SELECT_NOTE sets selectedNoteId', () => {
    const state = appReducer(initialState, { type: 'SELECT_NOTE', noteId: 'note-1' })
    expect(state.selectedNoteId).toBe('note-1')
  })

  it('SELECT_NOTE with null deselects note', () => {
    const withSelection = { ...initialState, selectedNoteId: 'note-1' }
    const state = appReducer(withSelection, { type: 'SELECT_NOTE', noteId: null })
    expect(state.selectedNoteId).toBeNull()
  })

  it('SET_NOTE_FILTER changes the filter', () => {
    const state = appReducer(initialState, { type: 'SET_NOTE_FILTER', filter: 'md' })
    expect(state.noteFilter).toBe('md')
  })

  it('SET_NOTE_SEARCH updates search query', () => {
    const state = appReducer(initialState, { type: 'SET_NOTE_SEARCH', query: 'sort' })
    expect(state.noteSearchQuery).toBe('sort')
  })

  it('OPEN_CODE_FILE adds file and sets it active', () => {
    const file = { path: '/repo/src/main.ts', name: 'main.ts', language: 'typescript' }
    const state = appReducer(initialState, { type: 'OPEN_CODE_FILE', file })
    expect(state.openCodeFiles).toHaveLength(1)
    expect(state.openCodeFiles[0]).toEqual(file)
    expect(state.activeCodeFileIndex).toBe(0)
  })

  it('OPEN_CODE_FILE does not duplicate existing file', () => {
    const file = { path: '/repo/src/main.ts', name: 'main.ts', language: 'typescript' }
    const withFile = appReducer(initialState, { type: 'OPEN_CODE_FILE', file })
    const state = appReducer(withFile, { type: 'OPEN_CODE_FILE', file })
    expect(state.openCodeFiles).toHaveLength(1)
    expect(state.activeCodeFileIndex).toBe(0)
  })

  it('CLOSE_CODE_FILE removes the file at index', () => {
    const file1 = { path: '/a.ts', name: 'a.ts', language: 'typescript' }
    const file2 = { path: '/b.ts', name: 'b.ts', language: 'typescript' }
    let state = appReducer(initialState, { type: 'OPEN_CODE_FILE', file: file1 })
    state = appReducer(state, { type: 'OPEN_CODE_FILE', file: file2 })
    state = appReducer(state, { type: 'CLOSE_CODE_FILE', index: 0 })
    expect(state.openCodeFiles).toHaveLength(1)
    expect(state.openCodeFiles[0]).toEqual(file2)
  })

  it('SET_ACTIVE_CODE_FILE changes active index', () => {
    const file1 = { path: '/a.ts', name: 'a.ts', language: 'typescript' }
    const file2 = { path: '/b.ts', name: 'b.ts', language: 'typescript' }
    let state = appReducer(initialState, { type: 'OPEN_CODE_FILE', file: file1 })
    state = appReducer(state, { type: 'OPEN_CODE_FILE', file: file2 })
    state = appReducer(state, { type: 'SET_ACTIVE_CODE_FILE', index: 0 })
    expect(state.activeCodeFileIndex).toBe(0)
  })

  it('SET_PANEL_WIDTHS updates panel widths', () => {
    const widths = { panel1: 20, panel2: 30, panel3: 30, panel4: 20 }
    const state = appReducer(initialState, { type: 'SET_PANEL_WIDTHS', widths })
    expect(state.panelWidths).toEqual(widths)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/wangyan/Desktop/note && npx vitest run tests/renderer/AppContext.test.tsx`
Expected: FAIL — `appReducer` and `initialState` not exported from AppContext

- [ ] **Step 3: Write the AppContext implementation**

```typescript
// src/renderer/src/contexts/AppContext.tsx
import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import type { AppState, AppAction, NoteItem, CodeFile, PanelWidths } from '../types'

export const initialState: AppState = {
  notes: [],
  selectedNoteId: null,
  noteFilter: 'all',
  noteSearchQuery: '',
  openCodeFiles: [],
  activeCodeFileIndex: -1,
  codeRepoPath: null,
  codeFiles: [],
  panelWidths: { panel1: 18, panel2: 32, panel3: 32, panel4: 18 }
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SELECT_NOTE':
      return { ...state, selectedNoteId: action.noteId }

    case 'SET_NOTE_FILTER':
      return { ...state, noteFilter: action.filter }

    case 'SET_NOTE_SEARCH':
      return { ...state, noteSearchQuery: action.query }

    case 'SET_NOTES':
      return { ...state, notes: action.notes }

    case 'OPEN_CODE_FILE': {
      const existingIndex = state.openCodeFiles.findIndex(
        (f) => f.path === action.file.path
      )
      if (existingIndex >= 0) {
        return { ...state, activeCodeFileIndex: existingIndex }
      }
      return {
        ...state,
        openCodeFiles: [...state.openCodeFiles, action.file],
        activeCodeFileIndex: state.openCodeFiles.length
      }
    }

    case 'CLOSE_CODE_FILE': {
      const updated = state.openCodeFiles.filter((_, i) => i !== action.index)
      const newIndex = Math.min(state.activeCodeFileIndex, updated.length - 1)
      return {
        ...state,
        openCodeFiles: updated,
        activeCodeFileIndex: updated.length === 0 ? -1 : newIndex
      }
    }

    case 'SET_ACTIVE_CODE_FILE':
      return { ...state, activeCodeFileIndex: action.index }

    case 'SET_CODE_REPO':
      return { ...state, codeRepoPath: action.path }

    case 'SET_CODE_FILES':
      return { ...state, codeFiles: action.files }

    case 'SET_PANEL_WIDTHS':
      return { ...state, panelWidths: action.widths }

    default:
      return state
  }
}

interface AppContextValue {
  state: AppState
  dispatch: Dispatch<AppAction>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState)
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  )
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) {
    throw new Error('useAppContext must be used within AppProvider')
  }
  return ctx
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/wangyan/Desktop/note && npx vitest run tests/renderer/AppContext.test.tsx`
Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/contexts/AppContext.tsx tests/renderer/AppContext.test.tsx
git commit -m "feat: add AppContext with reducer for global state management"
```

---

### Task 7: Create placeholder panel components

**Files:**
- Create: `src/renderer/src/components/NoteDirectory.tsx`
- Create: `src/renderer/src/components/NoteViewport.tsx`
- Create: `src/renderer/src/components/CodeViewport.tsx`
- Create: `src/renderer/src/components/CodeDirectory.tsx`

- [ ] **Step 1: Write all four placeholder components**

```typescript
// src/renderer/src/components/NoteDirectory.tsx
export function NoteDirectory() {
  return (
    <div className="panel panel-note-directory">
      <div className="panel-header">Notes</div>
      <div className="panel-body panel-placeholder">
        <p>Note directory tree</p>
      </div>
    </div>
  )
}
```

```typescript
// src/renderer/src/components/NoteViewport.tsx
export function NoteViewport() {
  return (
    <div className="panel panel-note-viewport">
      <div className="panel-header">Note Viewport</div>
      <div className="panel-body panel-placeholder">
        <p>Select a note to view</p>
      </div>
    </div>
  )
}
```

```typescript
// src/renderer/src/components/CodeViewport.tsx
export function CodeViewport() {
  return (
    <div className="panel panel-code-viewport">
      <div className="panel-header">Code Viewport</div>
      <div className="panel-body panel-placeholder">
        <p>No code file open</p>
      </div>
    </div>
  )
}
```

```typescript
// src/renderer/src/components/CodeDirectory.tsx
export function CodeDirectory() {
  return (
    <div className="panel panel-code-directory">
      <div className="panel-header">Code</div>
      <div className="panel-body panel-placeholder">
        <p>Code directory tree</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/NoteDirectory.tsx src/renderer/src/components/NoteViewport.tsx src/renderer/src/components/CodeViewport.tsx src/renderer/src/components/CodeDirectory.tsx
git commit -m "feat: add placeholder panel components for 4-panel layout"
```

---

### Task 8: Create resizable Layout component

**Files:**
- Create: `src/renderer/src/components/Layout.tsx`
- Create: `src/renderer/src/components/Layout.css`

- [ ] **Step 1: Write Layout.css**

```css
.layout-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.layout-panels {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--panel-bg);
  border-right: 1px solid var(--border-color);
}

.panel:last-child {
  border-right: none;
}

.panel-header {
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--header-color);
  background: var(--header-bg);
  border-bottom: 1px solid var(--border-color);
  user-select: none;
}

.panel-body {
  flex: 1;
  overflow: auto;
  padding: 12px;
}

.panel-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--placeholder-color);
  font-size: 13px;
}

.resize-handle {
  width: 4px;
  background: transparent;
  transition: background 0.15s ease;
  cursor: col-resize;
  flex-shrink: 0;
}

.resize-handle:hover,
.resize-handle[data-resize-handle-active] {
  background: var(--accent-color);
}
```

- [ ] **Step 2: Write Layout.tsx**

```typescript
import { useCallback } from 'react'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import { useAppContext } from '../contexts/AppContext'
import { NoteDirectory } from './NoteDirectory'
import { NoteViewport } from './NoteViewport'
import { CodeViewport } from './CodeViewport'
import { CodeDirectory } from './CodeDirectory'
import type { PanelWidths } from '../types'
import './Layout.css'

export function Layout() {
  const { state, dispatch } = useAppContext()
  const { panelWidths } = state

  const handleLayoutChange = useCallback(
    (sizes: number[]) => {
      const widths: PanelWidths = {
        panel1: sizes[0],
        panel2: sizes[1],
        panel3: sizes[2],
        panel4: sizes[3]
      }
      dispatch({ type: 'SET_PANEL_WIDTHS', widths })
    },
    [dispatch]
  )

  return (
    <div className="layout-container">
      <div className="layout-panels">
        <PanelGroup
          direction="horizontal"
          onLayout={handleLayoutChange}
        >
          <Panel defaultSize={panelWidths.panel1} minSize={10} maxSize={30}>
            <NoteDirectory />
          </Panel>
          <PanelResizeHandle className="resize-handle" />
          <Panel defaultSize={panelWidths.panel2} minSize={20}>
            <NoteViewport />
          </Panel>
          <PanelResizeHandle className="resize-handle" />
          <Panel defaultSize={panelWidths.panel3} minSize={20}>
            <CodeViewport />
          </Panel>
          <PanelResizeHandle className="resize-handle" />
          <Panel defaultSize={panelWidths.panel4} minSize={10} maxSize={30}>
            <CodeDirectory />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/Layout.tsx src/renderer/src/components/Layout.css
git commit -m "feat: add resizable 4-panel layout with react-resizable-panels"
```

---

### Task 9: Create App component and styles

**Files:**
- Create: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/App.css`

- [ ] **Step 1: Write App.css with CSS custom properties**

```css
:root {
  --panel-bg: #1e1e1e;
  --header-bg: #252526;
  --header-color: #cccccc;
  --border-color: #3c3c3c;
  --placeholder-color: #6a6a6a;
  --accent-color: #007acc;
  --text-color: #d4d4d4;
  --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #root {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--panel-bg);
  color: var(--text-color);
  font-family: var(--font-family);
  font-size: 13px;
}
```

- [ ] **Step 2: Write App.tsx**

```typescript
import { AppProvider } from './contexts/AppContext'
import { Layout } from './components/Layout'
import './App.css'

export default function App() {
  return (
    <AppProvider>
      <Layout />
    </AppProvider>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/App.css
git commit -m "feat: add root App component with dark theme"
```

---

### Task 10: Create renderer entry point and HTML

**Files:**
- Create: `src/renderer/index.html`
- Create: `src/renderer/src/main.tsx`

- [ ] **Step 1: Write index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
    />
    <title>Code Note Studio</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Write main.tsx**

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/index.html src/renderer/src/main.tsx
git commit -m "feat: add renderer entry point and HTML template"
```

---

### Task 11: Create test setup and Layout tests

**Files:**
- Create: `tests/renderer/setup.ts`
- Create: `tests/renderer/Layout.test.tsx`

- [ ] **Step 1: Write test setup**

```typescript
// tests/renderer/setup.ts
import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})
```

- [ ] **Step 2: Write Layout tests**

```typescript
// tests/renderer/Layout.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppProvider } from '../../src/renderer/src/contexts/AppContext'
import { Layout } from '../../src/renderer/src/components/Layout'

function renderLayout() {
  return render(
    <AppProvider>
      <Layout />
    </AppProvider>
  )
}

describe('Layout', () => {
  it('renders all four panel headers', () => {
    renderLayout()
    expect(screen.getByText('Notes')).toBeInTheDocument()
    expect(screen.getByText('Note Viewport')).toBeInTheDocument()
    expect(screen.getByText('Code Viewport')).toBeInTheDocument()
    expect(screen.getByText('Code')).toBeInTheDocument()
  })

  it('renders placeholder content in each panel', () => {
    renderLayout()
    expect(screen.getByText('Note directory tree')).toBeInTheDocument()
    expect(screen.getByText('Select a note to view')).toBeInTheDocument()
    expect(screen.getByText('No code file open')).toBeInTheDocument()
    expect(screen.getByText('Code directory tree')).toBeInTheDocument()
  })

  it('renders three resize handles', () => {
    const { container } = renderLayout()
    const handles = container.querySelectorAll('.resize-handle')
    expect(handles).toHaveLength(3)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /Users/wangyan/Desktop/note && npx vitest run tests/renderer/Layout.test.tsx`
Expected: FAIL — `@testing-library/jest-dom` module or components not found (missing setup or dependency resolution)

- [ ] **Step 4: Verify tests pass**

Run: `cd /Users/wangyan/Desktop/note && npx vitest run`
Expected: All 11 tests PASS (8 context tests + 3 layout tests)

- [ ] **Step 5: Commit**

```bash
git add tests/renderer/setup.ts tests/renderer/Layout.test.tsx
git commit -m "test: add Layout rendering tests"
```

---

### Task 12: Run the dev build and launch the app

- [ ] **Step 1: Start the dev server**

Run: `cd /Users/wangyan/Desktop/note && npm run dev`

Expected: electron-vite builds all three targets, Electron window launches displaying a dark-themed 4-panel layout. Each panel shows its header and placeholder text. Drag handles between panels are functional.

- [ ] **Step 2: Verify visual output**

Check that:
- Window title is "Code Note Studio"
- Four panels visible: Notes | Note Viewport | Code Viewport | Code
- Dark theme applied (dark backgrounds, light text)
- Three vertical resize handles between panels
- Panels can be resized by dragging handles
- Panels respect minimum size constraints (10% for outer panels, 20% for inner)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: finalize project scaffold and verify dev build"
```

---

### Verification Checklist

After completing all tasks, confirm:

```
[ ] npm run dev launches Electron window without errors
[ ] 4-panel layout renders with correct headers
[ ] Panel widths are ~18% / 32% / 32% / 18%
[ ] Drag handles are visible and functional
[ ] Window can be resized (panels scale proportionally)
[ ] Dark theme is applied consistently
[ ] npm test passes all 11 tests
[ ] npm run build completes without errors
```
