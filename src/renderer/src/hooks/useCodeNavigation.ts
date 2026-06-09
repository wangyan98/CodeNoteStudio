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
    const fileName = filePath.split('/').pop() || filePath
    const ext = filePath.split('.').pop()?.toLowerCase() || ''
    const langMap: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
      py: 'python', rs: 'rust', go: 'go', cpp: 'cpp', c: 'c',
      css: 'css', html: 'html', json: 'json', md: 'markdown',
      png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
      webp: 'image', bmp: 'image', svg: 'image'
    }

    const codeFile: CodeFile = {
      path: filePath,
      name: fileName,
      language: langMap[ext] || 'plaintext',
      repoPath: repoPath
    }

    // Determine repo and switch if needed so file tree reveals the right location
    let fileRepoPath = repoPath
    if (!fileRepoPath && appState) {
      for (const repo of appState.codeRepos) {
        const prefix = repo.path.endsWith('/') ? repo.path : repo.path + '/'
        if (filePath.startsWith(prefix)) {
          fileRepoPath = repo.path
          break
        }
      }
    }
    if (fileRepoPath && fileRepoPath !== appState?.codeRepoPath) {
      dispatch({ type: 'SET_CODE_REPO', path: fileRepoPath })
    }

    dispatch({ type: 'REVEAL_FILE_IN_TREE', filePath })
    dispatch({ type: 'OPEN_CODE_FILE', file: codeFile })
    dispatch({ type: 'SET_PENDING_SCROLL', filePath, line: startLine })
  }, [dispatch, appState])

  return { navigateToCode }
}
