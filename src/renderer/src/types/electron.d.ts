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
    }
  }
}
