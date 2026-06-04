import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppContext } from '../contexts/AppContext'
import type { WorkspaceHistoryEntry } from '../types'
import './WorkspaceToolbar.css'

const REPO_COLORS = ['#e06c75', '#61afef', '#98c379', '#d19a66', '#c678dd', '#56b6c2', '#e5c07b', '#abb2bf']

function getRepoColor(index: number): string {
  return REPO_COLORS[index % REPO_COLORS.length]
}

export function WorkspaceToolbar() {
  const { state, dispatch } = useAppContext()
  const { workspacePath, workspaceName, workspaceHistory } = state
  const [codeRepos, setCodeRepos] = useState<Array<{ path: string; commit: string }>>([])
  const restoringRef = useRef(false)
  const loadingRef = useRef(false)

  // Load history on mount
  useEffect(() => {
    window.electronAPI.getWorkspaceHistory().then((history) => {
      dispatch({ type: 'SET_WORKSPACE_HISTORY', history })
    })
  }, [dispatch])

  const restoreUiState = useCallback(async () => {
    const saved = await window.electronAPI.loadUiState()
    if (!saved) return

    restoringRef.current = true

    if (saved.selectedNoteId) {
      const notes = await window.electronAPI.listNotes()
      dispatch({ type: 'SET_NOTES', notes })
      const note = notes.find((n) => n.relativePath === saved.selectedNoteId)
      if (note) {
        dispatch({ type: 'SELECT_NOTE', noteId: saved.selectedNoteId })
        const content = await window.electronAPI.readNote(saved.selectedNoteId)
        dispatch({ type: 'SET_ACTIVE_NOTE_CONTENT', content, noteType: note.type })
      }
    }

    if (saved.codeRepoPath) {
      dispatch({ type: 'SET_CODE_REPO', path: saved.codeRepoPath })
    }

    if (saved.openCodeFiles && saved.openCodeFiles.length > 0) {
      for (const file of saved.openCodeFiles) {
        dispatch({ type: 'OPEN_CODE_FILE', file })
      }
      if (saved.activeCodeFileIndex >= 0) {
        dispatch({ type: 'SET_ACTIVE_CODE_FILE', index: saved.activeCodeFileIndex })
      }
    }

    restoringRef.current = false
  }, [dispatch])

  useEffect(() => {
    window.electronAPI.getWorkspacePath().then((savedPath) => {
      if (savedPath) {
        window.electronAPI.loadConfig().then((config) => {
          dispatch({ type: 'SET_WORKSPACE', path: savedPath, name: config.name || savedPath })
          setCodeRepos(config.codeRepos || [])
          dispatch({ type: 'SET_CODE_REPOS', repos: config.codeRepos || [] })
          restoreUiState()
        })
      }
    })
  }, [])

  const openWorkspaceByPath = useCallback(async (wsPath: string) => {
    if (loadingRef.current) return
    loadingRef.current = true
    // Clear all state from previous workspace
    dispatch({ type: 'RESET_WORKSPACE_STATE' })
    try {
      const config = await window.electronAPI.openWorkspace(wsPath)
      dispatch({ type: 'SET_WORKSPACE', path: wsPath, name: config.name || wsPath })
      setCodeRepos(config.codeRepos || [])
      dispatch({ type: 'SET_CODE_REPOS', repos: config.codeRepos || [] })
      const notes = await window.electronAPI.listNotes()
      dispatch({ type: 'SET_NOTES', notes })
      for (const repo of config.codeRepos || []) {
        window.electronAPI.indexSymbols(repo.path).catch((err) => {
          console.error('Failed to index symbols for repo:', repo.path, err)
        })
      }
      // Refresh history after opening
      const history = await window.electronAPI.getWorkspaceHistory()
      dispatch({ type: 'SET_WORKSPACE_HISTORY', history })
      restoreUiState()
    } catch (err: any) {
      alert(err.message || 'Failed to open workspace')
      // Remove invalid entry from history
      await window.electronAPI.removeFromWorkspaceHistory(wsPath)
      const history = await window.electronAPI.getWorkspaceHistory()
      dispatch({ type: 'SET_WORKSPACE_HISTORY', history })
    } finally {
      loadingRef.current = false
    }
  }, [dispatch, restoreUiState])

  const handleNewWorkspace = useCallback(async () => {
    const dirPath = await window.electronAPI.selectFolder()
    if (!dirPath) return
    try {
      await window.electronAPI.createWorkspace(dirPath)
      await openWorkspaceByPath(dirPath)
    } catch (err: any) {
      alert(err.message || 'Failed to create workspace')
    }
  }, [openWorkspaceByPath])

  const handleOpenWorkspace = useCallback(async () => {
    const folderPath = await window.electronAPI.selectFolder()
    if (!folderPath) return
    await openWorkspaceByPath(folderPath)
  }, [openWorkspaceByPath])

  const handleHistoryItemClick = useCallback(async (entry: WorkspaceHistoryEntry) => {
    await openWorkspaceByPath(entry.path)
  }, [openWorkspaceByPath])

  const handleRemoveHistory = useCallback(async (e: React.MouseEvent, entryPath: string) => {
    e.stopPropagation()
    await window.electronAPI.removeFromWorkspaceHistory(entryPath)
    const history = await window.electronAPI.getWorkspaceHistory()
    dispatch({ type: 'SET_WORKSPACE_HISTORY', history })
  }, [dispatch])

  const handleWorkspaceNameClick = useCallback(async () => {
    await window.electronAPI.clearWorkspace()
    dispatch({ type: 'CLEAR_WORKSPACE' })
    const history = await window.electronAPI.getWorkspaceHistory()
    dispatch({ type: 'SET_WORKSPACE_HISTORY', history })
  }, [dispatch])

  const handleAddRepo = useCallback(async () => {
    const repoPath = await window.electronAPI.selectFolder()
    if (!repoPath) return
    const newRepos = [...codeRepos, { path: repoPath, commit: '' }]
    setCodeRepos(newRepos)
    dispatch({ type: 'SET_CODE_REPOS', repos: newRepos })
    const config = await window.electronAPI.loadConfig()
    await window.electronAPI.saveConfig({ ...config, codeRepos: newRepos })
    dispatch({ type: 'SET_CODE_REPO', path: repoPath })
    window.electronAPI.indexSymbols(repoPath).catch((err) => {
      console.error('Failed to index symbols for repo:', repoPath, err)
    })
  }, [codeRepos, dispatch])

  const handleRemoveRepo = useCallback(async (repoPath: string) => {
    const repoName = repoPath.split('/').pop() || repoPath.split('\\').pop() || repoPath
    if (!confirm(`Remove code repository "${repoName}"?`)) return
    const newRepos = codeRepos.filter((r) => r.path !== repoPath)
    setCodeRepos(newRepos)
    dispatch({ type: 'SET_CODE_REPOS', repos: newRepos })
    if (state.codeRepoPath === repoPath) {
      dispatch({ type: 'SET_CODE_REPO', path: '' })
    }
    const config = await window.electronAPI.loadConfig()
    await window.electronAPI.saveConfig({ ...config, codeRepos: newRepos })
  }, [codeRepos, state.codeRepoPath, dispatch])

  // Persist UI state on changes
  useEffect(() => {
    if (!workspacePath || restoringRef.current) return
    const currentPath = workspacePath
    const timer = setTimeout(() => {
      window.electronAPI.saveUiState(currentPath, {
        selectedNoteId: state.selectedNoteId,
        codeRepoPath: state.codeRepoPath,
        openCodeFiles: state.openCodeFiles,
        activeCodeFileIndex: state.activeCodeFileIndex
      })
    }, 500)
    return () => clearTimeout(timer)
  }, [workspacePath, state.selectedNoteId, state.codeRepoPath, state.openCodeFiles, state.activeCodeFileIndex])

  // Landing page: no workspace open
  if (!workspacePath) {
    return (
      <div className="workspace-landing">
        <div className="workspace-landing-icon">📝</div>
        <div className="workspace-landing-title">Code Note Studio</div>
        <div className="workspace-landing-subtitle">
          Create a new workspace or open an existing one to get started.
        </div>
        <div className="workspace-landing-actions">
          <button className="workspace-landing-btn primary" onClick={handleNewWorkspace}>
            New Workspace
          </button>
          <button className="workspace-landing-btn" onClick={handleOpenWorkspace}>
            Open Workspace
          </button>
        </div>

        {workspaceHistory.length > 0 && (
          <>
            <div className="workspace-history-divider">
              <span className="workspace-history-divider-line" />
              <span className="workspace-history-divider-label">Recent Workspaces</span>
              <span className="workspace-history-divider-line" />
            </div>
            <div className="workspace-history-list">
              {workspaceHistory.map((entry) => (
                <div
                  key={entry.path}
                  className="workspace-history-item"
                  onClick={() => handleHistoryItemClick(entry)}
                >
                  <span className="workspace-history-item-icon">📁</span>
                  <div className="workspace-history-item-info">
                    <span className="workspace-history-item-name">{entry.name}</span>
                    <span className="workspace-history-item-path">{entry.path}</span>
                  </div>
                  <button
                    className="workspace-history-item-remove"
                    onClick={(e) => handleRemoveHistory(e, entry.path)}
                    title="Remove from history"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  // Normal toolbar
  return (
    <div className="workspace-toolbar">
      <span
        className="workspace-toolbar-name workspace-toolbar-name-clickable"
        onClick={handleWorkspaceNameClick}
        title="Back to home"
      >
        📁 {workspaceName}
      </span>
      <span className="workspace-toolbar-separator">|</span>
      <button className="workspace-toolbar-btn" onClick={handleOpenWorkspace}>
        Open Workspace
      </button>
      <div className="workspace-toolbar-spacer" />
      <span className="workspace-toolbar-label">Repos:</span>
      <div className="workspace-toolbar-repos">
        {codeRepos.map((repo, index) => (
          <span
            key={repo.path}
            className={`workspace-toolbar-repo-chip${state.codeRepoPath === repo.path ? ' active' : ''}`}
            title={repo.path}
            onClick={() => {
              dispatch({ type: 'SET_CODE_REPO', path: repo.path })
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              handleRemoveRepo(repo.path)
            }}
          >
            <span
              className="repo-chip-dot"
              style={{ backgroundColor: getRepoColor(index) }}
            />
            {repo.path.split('/').pop() || repo.path}
            <button
              className="repo-chip-reindex"
              title={`Re-index ${repo.path.split('/').pop()}`}
              onClick={(e) => {
                e.stopPropagation()
                const repoName = repo.path.split('/').pop() || repo.path
                if (!confirm(`Re-index "${repoName}"?\nThis will re-parse all source files in this repo.`)) return
                window.electronAPI.indexSymbols(repo.path).then((result) => {
                  console.log(`Indexed ${result.indexed} symbols in ${repo.path}`)
                }).catch((err) => {
                  console.error('Failed to re-index symbols:', err)
                })
              }}
            >
              &#x21bb;
            </button>
          </span>
        ))}
        <button
          className="workspace-toolbar-btn workspace-toolbar-action"
          onClick={handleAddRepo}
        >
          + Add Repo
        </button>
      </div>
    </div>
  )
}
