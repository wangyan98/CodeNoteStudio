export type { MindMapDocument, DerivationDocument, MindMapNode, DerivationNode, CodeMapping } from './schemas/note-types'

export interface CodeRepo {
  path: string
  commit: string
  lsp: {
    language: string
    command: string
  }
}

export interface NotebookConfig {
  name: string
  codeRepos: CodeRepo[]
}

export type NoteFileType = 'mind' | 'md' | 'derive'

export interface NoteListItem {
  name: string
  relativePath: string
  type: NoteFileType
}
