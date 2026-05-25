import { useState, useEffect, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { useAppContext } from '../contexts/AppContext'
import './CodeViewport.css'

export function CodeViewport() {
  const { state, dispatch } = useAppContext()
  const { openCodeFiles, activeCodeFileIndex, codeRepoPath } = state
  const [fileContents, setFileContents] = useState<Map<string, string>>(new Map())
  const [gitCommit, setGitCommit] = useState<string>('')

  const activeFile = activeCodeFileIndex >= 0 ? openCodeFiles[activeCodeFileIndex] : null

  useEffect(() => {
    if (codeRepoPath) {
      window.electronAPI.getGitCommit(codeRepoPath).then(setGitCommit)
    }
  }, [codeRepoPath])

  const loadFileContent = useCallback(async (filePath: string) => {
    if (fileContents.has(filePath)) return
    try {
      const content = await window.electronAPI.readCodeFile(filePath)
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
        <div className="panel-header">Code Viewport</div>
        <div className="code-viewport-placeholder">
          <p>No code file open</p>
        </div>
      </div>
    )
  }

  const content = fileContents.get(activeFile.path) || ''

  return (
    <div className="panel panel-code-viewport">
      <div className="panel-header">Code Viewport</div>
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
          {gitCommit && <span className="code-git-sha">{gitCommit.slice(0, 7)}</span>}
          <span>{activeFile.name}</span>
        </div>

        {/* Editor */}
        <div className="code-editor-container">
          {content ? (
            <Editor
              height="100%"
              language={activeFile.language}
              value={content}
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
            />
          ) : (
            <div style={{ padding: 16, color: 'var(--placeholder-color)' }}>Loading...</div>
          )}
        </div>
      </div>
    </div>
  )
}
