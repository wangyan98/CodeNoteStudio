import type { NotebookConfig, NoteItem, NoteType } from './index'

declare global {
  interface Window {
    electronAPI: {
      platform: string
      getAppVersion: () => Promise<string>
      getProjectPath: () => Promise<string | null>
      loadConfig: () => Promise<NotebookConfig>
      saveConfig: (config: NotebookConfig) => Promise<void>
      listNotes: (filterType?: NoteType) => Promise<NoteItem[]>
      createNote: (relativePath: string, type: NoteType) => Promise<void>
      readNote: (relativePath: string) => Promise<string | object>
      updateNote: (relativePath: string, content: unknown) => Promise<void>
      deleteNote: (relativePath: string) => Promise<void>
      renameNote: (oldPath: string, newPath: string) => Promise<void>
      noteExists: (relativePath: string) => Promise<boolean>
      listRepoFiles: (repoPath: string) => Promise<Array<{
        name: string
        relativePath: string
        absolutePath: string
        isDirectory: boolean
      }>>
      readCodeFile: (absolutePath: string) => Promise<string>
      getGitCommit: (repoPath: string) => Promise<{ sha: string; message: string; author: string; date: string }>
      parseSymbols: (filePaths: string[]) => Promise<Array<{
        name: string
        kind: string
        filePath: string
        startLine: number
        endLine: number
        startColumn: number
        endColumn: number
        parentName?: string
      }>>
      indexSymbols: (repoPath: string) => Promise<{ indexed: number; totalFiles: number }>
      resolveRefs: (notePath: string, content: string) => Promise<Array<{
        functionName: string
        filePath: string
        startLine: number
        endLine: number
      }>>
      startServer: (port?: number) => Promise<{ running: boolean; port: number; url: string }>
      stopServer: () => Promise<void>
      getServerStatus: () => Promise<{ running: boolean; port: number; url: string }>
    }
  }
}
