import { useCallback, useEffect, useState } from 'react'
import { useAppContext } from '../contexts/AppContext'
import './WorkspaceToolbar.css'

export function WorkspaceToolbar() {
  const { state, dispatch } = useAppContext()
  const { workspacePath, workspaceName } = state
  const [codeRepos, setCodeRepos] = useState<Array<{ path: string; commit: string }>>([])

  useEffect(() => {
    window.electronAPI.getWorkspacePath().then((savedPath) => {
      if (savedPath) {
        window.electronAPI.loadConfig().then((config) => {
          dispatch({ type: 'SET_WORKSPACE', path: savedPath, name: config.name || savedPath })
          setCodeRepos(config.codeRepos || [])
        })
      }
    })
  }, [])

  const handleOpenFolder = useCallback(async () => {
    const folderPath = await window.electronAPI.selectFolder()
    if (!folderPath) return
    try {
      const config = await window.electronAPI.openWorkspace(folderPath)
      dispatch({ type: 'SET_WORKSPACE', path: folderPath, name: config.name || folderPath })
      setCodeRepos(config.codeRepos || [])
      const notes = await window.electronAPI.listNotes()
      dispatch({ type: 'SET_NOTES', notes })
    } catch (err) {
      console.error('Failed to open workspace:', err)
    }
  }, [dispatch])

  const handleAddRepo = useCallback(async () => {
    const repoPath = await window.electronAPI.selectFolder()
    if (!repoPath) return
    const newRepos = [...codeRepos, { path: repoPath, commit: '' }]
    setCodeRepos(newRepos)
    const config = await window.electronAPI.loadConfig()
    await window.electronAPI.saveConfig({ ...config, codeRepos: newRepos })
    dispatch({ type: 'SET_CODE_REPO', path: repoPath })
  }, [codeRepos, dispatch])

  const handleRemoveRepo = useCallback(async (repoPath: string) => {
    const newRepos = codeRepos.filter((r) => r.path !== repoPath)
    setCodeRepos(newRepos)
    const config = await window.electronAPI.loadConfig()
    await window.electronAPI.saveConfig({ ...config, codeRepos: newRepos })
  }, [codeRepos])

  // Landing page: no workspace open
  if (!workspacePath) {
    return (
      <div className="workspace-landing">
        <div className="workspace-landing-icon">📝</div>
        <div className="workspace-landing-title">Code Note Studio</div>
        <div className="workspace-landing-subtitle">
          Open a folder to get started — your notes and linked code repos live there.
        </div>
        <button className="workspace-landing-btn" onClick={handleOpenFolder}>
          Open Folder
        </button>
      </div>
    )
  }

  // Normal toolbar
  return (
    <div className="workspace-toolbar">
      <span className="workspace-toolbar-name">📁 {workspaceName}</span>
      <span className="workspace-toolbar-separator">|</span>
      <span className="workspace-toolbar-label">Repos:</span>
      <div className="workspace-toolbar-repos">
        {codeRepos.map((repo) => (
          <span
            key={repo.path}
            className="workspace-toolbar-repo-chip"
            title={repo.path}
            onClick={() => {
              dispatch({ type: 'SET_CODE_REPO', path: repo.path })
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              handleRemoveRepo(repo.path)
            }}
          >
            {repo.path.split('/').pop() || repo.path}
          </span>
        ))}
        <button className="workspace-toolbar-btn" onClick={handleAddRepo}>
          + Add Repo
        </button>
      </div>
      <div className="workspace-toolbar-spacer" />
      <button className="workspace-toolbar-btn" onClick={handleOpenFolder}>
        Open Folder
      </button>
    </div>
  )
}
