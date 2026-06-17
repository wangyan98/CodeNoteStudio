import { useCallback } from 'react'
import { useAppContext } from '../contexts/AppContext'
import type { CodeFile } from '../types'

function useAppDispatch() {
  try {
    return useAppContext().dispatch
  } catch {
    return undefined
  }
}

function useAppState() {
  try {
    return useAppContext().state
  } catch {
    return undefined
  }
}

export function useCodeNavigation() {
  const dispatch = useAppDispatch()
  const appState = useAppState()

  const navigateToCode = useCallback((filePath: string, startLine: number, repoPath?: string) => {
    if (!dispatch) return

    // Resolve relative paths against configured code repos.
    // Derive codeMappings may store a repo-relative path that needs
    // the repo root prepended before we can open the file.
    let resolvedPath = filePath
    if (!filePath.startsWith('/') && appState) {
      for (const repo of appState.codeRepos) {
        const prefix = repo.path.endsWith('/') ? repo.path : repo.path + '/'
        const candidate = prefix + filePath
        // Pick the first repo whose path component actually appears
        // inside the relative filePath (greedy match), or fall back
        // to the first repo unconditionally.
        if (filePath.startsWith(repo.path.split('/').pop() + '/')) {
          resolvedPath = candidate
          break
        }
      }
      // If still relative, prepend the active or first repo path
      if (!resolvedPath.startsWith('/')) {
        const fallback = repoPath
          || appState.codeRepoPath
          || appState.codeRepos[0]?.path
        if (fallback) {
          resolvedPath = (fallback.endsWith('/') ? fallback : fallback + '/') + resolvedPath
        }
      }
    }

    const fileName = resolvedPath.split('/').pop() || resolvedPath
    const ext = resolvedPath.split('.').pop()?.toLowerCase() || ''
    const langMap: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
      py: 'python', rs: 'rust', go: 'go', cpp: 'cpp', c: 'c',
      css: 'css', html: 'html', json: 'json', md: 'markdown',
      png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
      webp: 'image', bmp: 'image', svg: 'image'
    }

    const codeFile: CodeFile = {
      path: resolvedPath,
      name: fileName,
      language: langMap[ext] || 'plaintext',
      repoPath: repoPath
    }

    // Determine repo and switch if needed so file tree reveals the right location
    let fileRepoPath = repoPath
    if (!fileRepoPath && appState) {
      for (const repo of appState.codeRepos) {
        const prefix = repo.path.endsWith('/') ? repo.path : repo.path + '/'
        if (resolvedPath.startsWith(prefix)) {
          fileRepoPath = repo.path
          break
        }
      }
    }
    if (fileRepoPath && fileRepoPath !== appState?.codeRepoPath) {
      dispatch({ type: 'SET_CODE_REPO', path: fileRepoPath })
    }

    dispatch({ type: 'REVEAL_FILE_IN_TREE', resolvedPath })
    dispatch({ type: 'OPEN_CODE_FILE', file: codeFile })
    dispatch({ type: 'SET_PENDING_SCROLL', resolvedPath, line: startLine })
  }, [dispatch, appState])

  return { navigateToCode }
}
