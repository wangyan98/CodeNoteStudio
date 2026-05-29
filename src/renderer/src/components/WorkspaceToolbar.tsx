import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppContext } from '../contexts/AppContext'
import './WorkspaceToolbar.css'

const REPO_COLORS = ['#e06c75', '#61afef', '#98c379', '#d19a66', '#c678dd', '#56b6c2', '#e5c07b', '#abb2bf']

function getRepoColor(index: number): string {
  return REPO_COLORS[index % REPO_COLORS.length]
}

export function WorkspaceToolbar() {
  const { state, dispatch } = useAppContext()
  const { workspacePath, workspaceName } = state
  const [codeRepos, setCodeRepos] = useState<Array<{ path: string; commit: string }>>([])
  const restoringRef = useRef(false)

  const restoreUiState = useCallback(async () => {
    const saved = await window.electronAPI.loadUiState()
    if (!saved) return

    restoringRef.current = true

    // Restore selected note
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

    // Restore code repo
    if (saved.codeRepoPath) {
      dispatch({ type: 'SET_CODE_REPO', path: saved.codeRepoPath })
    }

    // Restore open code files
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

  const handleNewWorkspace = useCallback(async () => {
    const parentDir = await window.electronAPI.selectFolder()
    if (!parentDir) return
    const name = window.prompt('Workspace name:')
    if (!name) return
    try {
      const newPath = await window.electronAPI.createWorkspace(parentDir, name)
      const config = await window.electronAPI.openWorkspace(newPath)
      dispatch({ type: 'SET_WORKSPACE', path: newPath, name: config.name || name })
      setCodeRepos(config.codeRepos || [])
      const notes = await window.electronAPI.listNotes()
      dispatch({ type: 'SET_NOTES', notes })
      for (const repo of config.codeRepos || []) {
        window.electronAPI.indexSymbols(repo.path).catch((err) => {
          console.error('Failed to index symbols for repo:', repo.path, err)
        })
      }
      restoreUiState()
    } catch (err) {
      console.error('Failed to create workspace:', err)
    }
  }, [dispatch, restoreUiState])

  const handleOpenFolder = useCallback(async () => {
    const folderPath = await window.electronAPI.selectFolder()
    if (!folderPath) return
    try {
      const config = await window.electronAPI.openWorkspace(folderPath)
      dispatch({ type: 'SET_WORKSPACE', path: folderPath, name: config.name || folderPath })
      setCodeRepos(config.codeRepos || [])
      const notes = await window.electronAPI.listNotes()
      dispatch({ type: 'SET_NOTES', notes })
      for (const repo of config.codeRepos || []) {
        window.electronAPI.indexSymbols(repo.path).catch((err) => {
          console.error('Failed to index symbols for repo:', repo.path, err)
        })
      }
      restoreUiState()
    } catch (err) {
      console.error('Failed to open workspace:', err)
    }
  }, [dispatch, restoreUiState])

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
    const timer = setTimeout(() => {
      window.electronAPI.saveUiState({
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
          <button className="workspace-landing-btn" onClick={handleOpenFolder}>
            Open Folder
          </button>
        </div>
      </div>
    )
  }

  // Normal toolbar
  return (
    <div className="workspace-toolbar">
      <span className="workspace-toolbar-name">📁 {workspaceName}</span>
      <span className="workspace-toolbar-separator">|</span>
      <button className="workspace-toolbar-btn" onClick={handleOpenFolder}>
        Open Folder
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
