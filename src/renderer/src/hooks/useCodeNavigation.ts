import { useCallback } from 'react'
import { useAppContext } from '../contexts/AppContext'
import type { CodeFile } from '../types'

export function useCodeNavigation() {
  const { dispatch } = useAppContext()

  const navigateToCode = useCallback((filePath: string, startLine: number) => {
    const fileName = filePath.split('/').pop() || filePath
    const ext = filePath.split('.').pop()?.toLowerCase() || ''
    const langMap: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
      py: 'python', rs: 'rust', go: 'go', cpp: 'cpp', c: 'c',
      css: 'css', html: 'html', json: 'json', md: 'markdown'
    }

    const codeFile: CodeFile = {
      path: filePath,
      name: fileName,
      language: langMap[ext] || 'plaintext'
    }

    dispatch({ type: 'OPEN_CODE_FILE', file: codeFile })
    dispatch({ type: 'SET_PENDING_SCROLL', filePath, line: startLine })
  }, [dispatch])

  return { navigateToCode }
}
