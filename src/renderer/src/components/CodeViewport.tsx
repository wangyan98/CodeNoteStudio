import { useState, useEffect, useCallback, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { useAppContext } from '../contexts/AppContext'
import { SymbolPicker } from './SymbolPicker'
import type { CodeSymbol } from './SymbolPicker'
import type * as monaco from 'monaco-editor'
import './CodeViewport.css'

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'])

const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
}

function getImageExt(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() || ''
}

function isImageFile(filePath: string): boolean {
  return IMAGE_EXTS.has(getImageExt(filePath))
}

function getMimeType(filePath: string): string {
  return MIME_MAP[getImageExt(filePath)] || 'image/png'
}

export function CodeViewport() {
  const { state, dispatch } = useAppContext()
  const { openCodeFiles, activeCodeFileIndex, codeRepoPath } = state
  const activeFile = activeCodeFileIndex >= 0 ? openCodeFiles[activeCodeFileIndex] : null
  const [fileContents, setFileContents] = useState<Map<string, string>>(new Map())
  const [gitCommit, setGitCommit] = useState<{ sha: string; message: string; author: string; date: string } | null>(null)
  const [symbolPickerOpen, setSymbolPickerOpen] = useState(false)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const selectedSymbolRef = useRef<CodeSymbol | null>(null)
  const decorationIdsRef = useRef<string[]>([])
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const [zoomedImage, setZoomedImage] = useState<string | null>(null)
  const [zoomLevel, setZoomLevel] = useState(1)
  const activeFileRef = useRef(activeFile)
  activeFileRef.current = activeFile

  const clearSelection = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const ids = decorationIdsRef.current
    if (ids.length > 0) {
      editor.deltaDecorations(ids, [])
    }
    decorationIdsRef.current = []
    selectedSymbolRef.current = null
    if (editorContainerRef.current) {
      editorContainerRef.current.removeAttribute('draggable')
    }
  }, [])

  useEffect(() => {
    clearSelection()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile?.path])

  const selectSymbolAtPosition = useCallback(async (
    editor: monaco.editor.IStandaloneCodeEditor,
    position: monaco.Position
  ) => {
    const model = editor.getModel()
    if (!model || !activeFileRef.current) return

    const word = model.getWordAtPosition(position)
    if (!word) return

    try {
      const symbols: CodeSymbol[] = await window.electronAPI.querySymbols(
        word.word,
        activeFileRef.current.path,
        undefined
      )
      // Find symbol in current file matching the clicked word
      const match = symbols.find(s =>
        s.name === word.word && s.filePath === activeFileRef.current.path
      )
      if (!match) return

      clearSelection()

      // Apply Monaco decoration to highlight the symbol name
      const ids = editor.deltaDecorations([], [{
        range: {
          startLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: word.endColumn
        },
        options: {
          inlineClassName: 'ref-drag-highlight',
          description: 'ref-drag-highlight'
        }
      }])
      decorationIdsRef.current = ids
      selectedSymbolRef.current = match
      if (editorContainerRef.current) {
        editorContainerRef.current.setAttribute('draggable', 'true')
      }
    } catch {
      // Symbol query failed — silently ignore
    }
  }, [clearSelection])

  const handleSymbolSelect = useCallback((sym: CodeSymbol) => {
    let relPath = sym.filePath
    if (codeRepoPath) {
      const prefix = codeRepoPath.endsWith('/') ? codeRepoPath : codeRepoPath + '/'
      if (sym.filePath.startsWith(prefix)) {
        relPath = sym.filePath.slice(prefix.length)
      }
    }

    const displayName = sym.parentName ? `${sym.parentName}.${sym.name}` : sym.name
    const refText = `@ref(${relPath}:${sym.startLine}:${displayName})`

    window.dispatchEvent(new CustomEvent('symbol-insert', { detail: refText }))
    setSymbolPickerOpen(false)
  }, [codeRepoPath])

  useEffect(() => {
    if (codeRepoPath) {
      window.electronAPI.getGitCommit(codeRepoPath).then(setGitCommit)
    }
  }, [codeRepoPath])

  const loadFileContent = useCallback(async (filePath: string) => {
    if (fileContents.has(filePath)) return
    try {
      const img = isImageFile(filePath)
      const content = img
        ? await window.electronAPI.readBinaryFile(filePath)
        : await window.electronAPI.readCodeFile(filePath)
      setFileContents((prev) => new Map(prev).set(filePath, content))
    } catch {
      setFileContents((prev) => new Map(prev).set(filePath, '// Error loading file'))
    }
  }, [fileContents])

  useEffect(() => {
    if (activeFile && !fileContents.has(activeFile.path)) {
      loadFileContent(activeFile.path)
    }
  }, [activeFile, fileContents, loadFileContent])

  // Scroll to line when pendingScroll is set
  useEffect(() => {
    if (!state.pendingScroll || !activeFile || !editorRef.current) return
    if (activeFile.path === state.pendingScroll.filePath) {
      editorRef.current.revealLineInCenter(state.pendingScroll.line)
      dispatch({ type: 'CLEAR_PENDING_SCROLL' })
    }
  }, [state.pendingScroll, activeFile, dispatch])

  const handleEditorMount = useCallback((editor: monaco.editor.IStandaloneCodeEditor) => {
    editorRef.current = editor

    // Scroll to pending line if applicable
    if (state.pendingScroll && activeFile && activeFile.path === state.pendingScroll.filePath) {
      editor.revealLineInCenter(state.pendingScroll.line)
      dispatch({ type: 'CLEAR_PENDING_SCROLL' })
    }

    // Double-click to select symbol for drag
    editor.onMouseDown(async (e) => {
      // Check for double-click (detail === 2)
      if (e.event.detail !== 2) {
        // Single click elsewhere clears selection
        if (selectedSymbolRef.current) {
          clearSelection()
        }
        return
      }
      if (!e.target.position) return
      await selectSymbolAtPosition(editor, e.target.position)
    })
  }, [state.pendingScroll, dispatch, clearSelection, selectSymbolAtPosition])

  useEffect(() => {
    if (!zoomedImage) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setZoomedImage(null)
        setZoomLevel(1)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [zoomedImage])

  const handleCloseTab = useCallback((index: number, e: React.MouseEvent) => {
    e.stopPropagation()
    dispatch({ type: 'CLOSE_CODE_FILE', index })
  }, [dispatch])

  const handleSelectTab = useCallback((index: number) => {
    dispatch({ type: 'SET_ACTIVE_CODE_FILE', index })
  }, [dispatch])

  if (!activeFile) {
    return (
      <div className="panel panel-code-viewport">
        <div className="panel-header">
          Code Viewport
          <button
            className="code-viewport-symbols-btn"
            onClick={() => setSymbolPickerOpen(true)}
          >
            Symbols
          </button>
        </div>
        <div className="code-viewport-placeholder">
          <p>No code file open</p>
        </div>
        <SymbolPicker
          isOpen={symbolPickerOpen}
          onClose={() => setSymbolPickerOpen(false)}
          onSelectSymbol={handleSymbolSelect}
        />
      </div>
    )
  }

  const content = fileContents.get(activeFile.path)
  const contentLoaded = fileContents.has(activeFile.path)

  return (
    <div className="panel panel-code-viewport">
      <div className="panel-header">
        Code Viewport
        <button
          className="code-viewport-symbols-btn"
          onClick={() => setSymbolPickerOpen(true)}
        >
          Symbols
        </button>
      </div>
      <div className="code-viewport">
        {/* Tab bar */}
        <div className="code-tab-bar">
          {openCodeFiles.map((file, index) => (
            <div
              key={file.path}
              className={`code-tab ${index === activeCodeFileIndex ? 'active' : ''}`}
              onClick={() => handleSelectTab(index)}
            >
              <span>{file.name}</span>
              <button
                className="code-tab-close"
                onClick={(e) => handleCloseTab(index, e)}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Git info */}
        <div className="code-git-info">
          <span>{activeFile.language}</span>
          {gitCommit && gitCommit.sha !== 'not available' && (
            <>
              <span className="code-git-sha">{gitCommit.sha.slice(0, 7)}</span>
              <span>{gitCommit.message.slice(0, 60)}</span>
            </>
          )}
          <span>{activeFile.name}</span>
        </div>

        {/* Editor or Image */}
        <div
          className="code-editor-container"
          ref={editorContainerRef}
          onDragStart={(e) => {
            const sym = selectedSymbolRef.current
            if (!sym || !activeFile) {
              e.preventDefault()
              return
            }
            let relPath = sym.filePath
            if (codeRepoPath) {
              const prefix = codeRepoPath.endsWith('/') ? codeRepoPath : codeRepoPath + '/'
              if (sym.filePath.startsWith(prefix)) {
                relPath = sym.filePath.slice(prefix.length)
              }
            }
            const displayName = sym.parentName ? `${sym.parentName}.${sym.name}` : sym.name
            const refText = `@ref(${relPath}:${sym.startLine}:${displayName})`
            e.dataTransfer.effectAllowed = 'copy'
            e.dataTransfer.setData('text/plain', refText)
          }}
        >
          {contentLoaded && activeFile && isImageFile(activeFile.path) ? (
            content === '// Error loading file' ? (
              <div style={{ padding: 16, color: 'var(--placeholder-color)' }}>Error loading image</div>
            ) : (
              <div className="image-container">
                <img
                  src={`data:${getMimeType(activeFile.path)};base64,${content || ''}`}
                  alt={activeFile.name}
                  className="image-preview"
                  onClick={() => setZoomedImage(content || '')}
                />
              </div>
            )
          ) : contentLoaded ? (
            <Editor
              height="100%"
              language={activeFile.language}
              value={content || ''}
              theme="vs-dark"
              options={{
                readOnly: true,
                minimap: { enabled: true },
                fontSize: 12,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                folding: true,
                renderLineHighlight: 'line',
                glyphMargin: true
              }}
              onMount={handleEditorMount}
            />
          ) : (
            <div style={{ padding: 16, color: 'var(--placeholder-color)' }}>Loading...</div>
          )}
        </div>

        {/* Zoom overlay */}
        {zoomedImage && activeFile && (
          <div
            className="image-zoom-overlay"
            onClick={() => { setZoomedImage(null); setZoomLevel(1) }}
          >
            <img
              src={`data:${getMimeType(activeFile.path)};base64,${zoomedImage}`}
              alt="zoom preview"
              className="image-zoom-content"
              style={{ transform: `scale(${zoomLevel})` }}
              onClick={(e) => e.stopPropagation()}
              onWheel={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setZoomLevel((prev) => {
                  const delta = e.deltaY > 0 ? -0.1 : 0.1
                  return Math.max(0.1, Math.min(5, prev + delta))
                })
              }}
            />
          </div>
        )}
      </div>
      <SymbolPicker
        isOpen={symbolPickerOpen}
        onClose={() => setSymbolPickerOpen(false)}
        onSelectSymbol={handleSymbolSelect}
        activeFilePath={activeFile?.path}
      />
    </div>
  )
}
