import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppContext } from '../contexts/AppContext'
import type { WorkspaceHistoryEntry } from '../types'
import { NodeContextMenu } from './editors/NodeContextMenu'
import type { MenuEntry } from './editors/NodeContextMenu'
import './WorkspaceToolbar.css'

const REPO_COLORS = ['#e06c75', '#61afef', '#98c379', '#d19a66', '#c678dd', '#56b6c2', '#e5c07b', '#abb2bf']

function getRepoColor(repo: { path: string; commit: string; color?: string }, index: number): string {
  return repo.color || REPO_COLORS[index % REPO_COLORS.length]
}

export function WorkspaceToolbar() {
  const { state, dispatch } = useAppContext()
  const { workspacePath, workspaceName, workspaceHistory } = state
  const [codeRepos, setCodeRepos] = useState<Array<{ path: string; commit: string; color?: string }>>([])
  const restoringRef = useRef(false)
  const loadingRef = useRef(false)
  const [repoContextMenu, setRepoContextMenu] = useState<{
    x: number
    y: number
    repoPath: string
    repoIndex: number
  } | null>(null)
  const [colorSubmenuRepo, setColorSubmenuRepo] = useState<string | null>(null)
  const [remoteUrls, setRemoteUrls] = useState<Map<string, string | null>>(new Map())
  const [detailRepo, setDetailRepo] = useState<{
    path: string
    remoteUrl: string | null
    commit: { sha: string; message: string; author: string; date: string } | null
    fileCount: number
    dirCount: number
    recentCommits: Array<{ sha: string; message: string; date: string }>
  } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

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
    // Reset agent conversation so old messages don't carry over
    window.electronAPI.resetAgentConversation().catch(() => {})
    try {
      const config = await window.electronAPI.openWorkspace(wsPath)
      dispatch({ type: 'SET_WORKSPACE', path: wsPath, name: config.name || wsPath })
      setCodeRepos(config.codeRepos || [])
      dispatch({ type: 'SET_CODE_REPOS', repos: config.codeRepos || [] })
      const notes = await window.electronAPI.listNotes()
      dispatch({ type: 'SET_NOTES', notes })
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

  const persistRepos = useCallback(async (repos: Array<{ path: string; commit: string; color?: string }>) => {
    setCodeRepos(repos)
    dispatch({ type: 'SET_CODE_REPOS', repos })
    const config = await window.electronAPI.loadConfig()
    await window.electronAPI.saveConfig({ ...config, codeRepos: repos })
  }, [dispatch])

  const handleMoveToFront = useCallback((repoPath: string) => {
    const idx = codeRepos.findIndex((r) => r.path === repoPath)
    if (idx <= 0) return
    const newRepos = [...codeRepos]
    const [item] = newRepos.splice(idx, 1)
    newRepos.unshift(item)
    persistRepos(newRepos)
  }, [codeRepos, persistRepos])

  const handleMoveToBack = useCallback((repoPath: string) => {
    const idx = codeRepos.findIndex((r) => r.path === repoPath)
    if (idx < 0 || idx >= codeRepos.length - 1) return
    const newRepos = [...codeRepos]
    const [item] = newRepos.splice(idx, 1)
    newRepos.push(item)
    persistRepos(newRepos)
  }, [codeRepos, persistRepos])

  const handleMoveUp = useCallback((repoPath: string) => {
    const idx = codeRepos.findIndex((r) => r.path === repoPath)
    if (idx <= 0) return
    const newRepos = [...codeRepos]
    ;[newRepos[idx - 1], newRepos[idx]] = [newRepos[idx], newRepos[idx - 1]]
    persistRepos(newRepos)
  }, [codeRepos, persistRepos])

  const handleMoveDown = useCallback((repoPath: string) => {
    const idx = codeRepos.findIndex((r) => r.path === repoPath)
    if (idx < 0 || idx >= codeRepos.length - 1) return
    const newRepos = [...codeRepos]
    ;[newRepos[idx], newRepos[idx + 1]] = [newRepos[idx + 1], newRepos[idx]]
    persistRepos(newRepos)
  }, [codeRepos, persistRepos])

  const openRepoDetail = useCallback(async (repoPath: string) => {
    setDetailLoading(true)
    setRepoContextMenu(null)
    try {
      const [remoteUrl, commit, files, recentCommits] = await Promise.all([
        window.electronAPI.getRemoteUrl(repoPath),
        window.electronAPI.getGitCommit(repoPath),
        window.electronAPI.listRepoFiles(repoPath),
        window.electronAPI.getRecentCommits(repoPath, 10),
      ])

      const fileCount = files.filter((f: any) => !f.isDirectory).length
      const dirCount = files.filter((f: any) => f.isDirectory).length

      setDetailRepo({ path: repoPath, remoteUrl, commit, fileCount, dirCount, recentCommits })
    } catch {
      // ignore errors
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const buildRepoContextMenu = useCallback((repoPath: string, repoIndex: number): MenuEntry[] => {
    const isFirst = repoIndex === 0
    const isLast = repoIndex === codeRepos.length - 1

    const items: MenuEntry[] = [
      {
        label: 'Copy Repo Path',
        action: () => { navigator.clipboard.writeText(repoPath) }
      },
      {
        label: 'Open in Finder',
        action: () => { window.electronAPI.openPath(repoPath) }
      },
      { separator: true },
      {
        label: 'Re-index Symbols',
        action: async () => {
          const repoName = repoPath.split('/').pop() || repoPath
          if (!confirm(`Re-index "${repoName}"?\nThis will re-parse all source files in this repo.`)) return
          await window.electronAPI.indexSymbols(repoPath)
        }
      },
      {
        label: 'Change Color',
        action: () => { setColorSubmenuRepo(repoPath) },
        disableAutoClose: true
      },
      { separator: true },
      {
        label: 'Move to Front',
        action: () => handleMoveToFront(repoPath),
        disabled: isFirst
      },
      {
        label: 'Move to Back',
        action: () => handleMoveToBack(repoPath),
        disabled: isLast
      },
      {
        label: 'Move Up',
        action: () => handleMoveUp(repoPath),
        disabled: isFirst
      },
      {
        label: 'Move Down',
        action: () => handleMoveDown(repoPath),
        disabled: isLast
      },
      { separator: true },
    ]

    const remoteUrl = remoteUrls.get(repoPath)
    if (remoteUrl) {
      items.push({
        label: 'Open in Website',
        action: () => { window.electronAPI.openExternal(remoteUrl) }
      })
      items.push({ separator: true })
    }

    items.push(
      {
        label: 'View Details',
        action: () => { openRepoDetail(repoPath) }
      },
      { separator: true },
      {
        label: 'Remove Repo',
        action: () => handleRemoveRepo(repoPath),
        danger: true
      }
    )

    return items
  }, [codeRepos, remoteUrls, handleRemoveRepo, handleMoveToFront, handleMoveToBack, handleMoveUp, handleMoveDown, openRepoDetail])

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
              setRepoContextMenu({ x: e.clientX, y: e.clientY, repoPath: repo.path, repoIndex: index })
              if (!remoteUrls.has(repo.path)) {
                window.electronAPI.getRemoteUrl(repo.path).then((url) => {
                  setRemoteUrls((prev) => new Map(prev).set(repo.path, url))
                })
              }
            }}
          >
            <span
              className="repo-chip-dot"
              style={{ backgroundColor: getRepoColor(repo, index) }}
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
      {repoContextMenu && !colorSubmenuRepo && (
        <NodeContextMenu
          x={repoContextMenu.x}
          y={repoContextMenu.y}
          items={buildRepoContextMenu(repoContextMenu.repoPath, repoContextMenu.repoIndex)}
          onClose={() => setRepoContextMenu(null)}
        />
      )}
      {colorSubmenuRepo && repoContextMenu && (
        <NodeContextMenu
          x={repoContextMenu.x + 160}
          y={repoContextMenu.y}
          items={[
            ...REPO_COLORS.map((color) => ({
              label: color,
              color: color,
              action: async () => {
                const newRepos = codeRepos.map((r) =>
                  r.path === colorSubmenuRepo ? { ...r, color } : r
                )
                setCodeRepos(newRepos)
                dispatch({ type: 'SET_CODE_REPOS', repos: newRepos })
                const config = await window.electronAPI.loadConfig()
                await window.electronAPI.saveConfig({ ...config, codeRepos: newRepos })
                setColorSubmenuRepo(null)
                setRepoContextMenu(null)
              }
            })),
            { separator: true },
            {
              label: 'Reset to Default',
              action: async () => {
                const newRepos = codeRepos.map((r) => {
                  if (r.path === colorSubmenuRepo) {
                    const { color, ...rest } = r
                    return rest
                  }
                  return r
                })
                setCodeRepos(newRepos)
                dispatch({ type: 'SET_CODE_REPOS', repos: newRepos })
                const config = await window.electronAPI.loadConfig()
                await window.electronAPI.saveConfig({ ...config, codeRepos: newRepos })
                setColorSubmenuRepo(null)
                setRepoContextMenu(null)
              }
            }
          ]}
          onClose={() => setColorSubmenuRepo(null)}
        />
      )}
      {detailRepo && (
        <div className="repo-detail-overlay" onClick={() => setDetailRepo(null)}>
          <div className="repo-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="repo-detail-header">
              <h3>{detailRepo.path.split('/').pop() || detailRepo.path}</h3>
              <button className="repo-detail-close" onClick={() => setDetailRepo(null)}>&times;</button>
            </div>
            <div className="repo-detail-body">
              <div className="repo-detail-section">
                <div className="repo-detail-row">
                  <span className="repo-detail-label">Path:</span>
                  <span className="repo-detail-value">{detailRepo.path}</span>
                </div>
                <div className="repo-detail-row">
                  <span className="repo-detail-label">Remote:</span>
                  <span className="repo-detail-value">{detailRepo.remoteUrl || 'N/A'}</span>
                </div>
              </div>

              {detailRepo.commit && detailRepo.commit.sha !== 'not available' && (
                <div className="repo-detail-section">
                  <div className="repo-detail-section-title">Git Info</div>
                  <div className="repo-detail-row">
                    <span className="repo-detail-label">Latest Commit:</span>
                    <span className="repo-detail-value">{detailRepo.commit.sha.substring(0, 8)}</span>
                  </div>
                  <div className="repo-detail-row">
                    <span className="repo-detail-label">Message:</span>
                    <span className="repo-detail-value">{detailRepo.commit.message}</span>
                  </div>
                  <div className="repo-detail-row">
                    <span className="repo-detail-label">Author:</span>
                    <span className="repo-detail-value">{detailRepo.commit.author}</span>
                  </div>
                  <div className="repo-detail-row">
                    <span className="repo-detail-label">Date:</span>
                    <span className="repo-detail-value">{detailRepo.commit.date}</span>
                  </div>
                </div>
              )}

              <div className="repo-detail-section">
                <div className="repo-detail-section-title">Repository</div>
                <div className="repo-detail-row">
                  <span className="repo-detail-label">Files:</span>
                  <span className="repo-detail-value">{detailRepo.fileCount}</span>
                </div>
                <div className="repo-detail-row">
                  <span className="repo-detail-label">Directories:</span>
                  <span className="repo-detail-value">{detailRepo.dirCount}</span>
                </div>
              </div>

              {detailRepo.recentCommits.length > 0 && (
                <div className="repo-detail-section">
                  <div className="repo-detail-section-title">Recent Commits</div>
                  <div className="repo-detail-commits">
                    {detailRepo.recentCommits.map((c) => (
                      <div key={c.sha} className="repo-detail-commit">
                        <span className="repo-detail-commit-sha">{c.sha.substring(0, 8)}</span>
                        <span className="repo-detail-commit-msg">{c.message}</span>
                        <span className="repo-detail-commit-date">{c.date}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="repo-detail-footer">
              <button className="workspace-toolbar-btn" onClick={() => setDetailRepo(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
