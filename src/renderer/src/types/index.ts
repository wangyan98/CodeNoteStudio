export type NoteType = 'mind' | 'md' | 'derive' | 'seq' | 'net'

export type NoteFilter = 'all' | NoteType

export interface NoteItem {
  name: string
  relativePath: string
  type: NoteType
}

export interface CodeFile {
  path: string
  name: string
  language: string
  repoPath?: string
}

export interface CodeRepo {
  path: string
  commit: string
}

export interface CodeSnippet {
  lines: string[]
  startLine: number
  highlightLine: number
}

export interface CodeMapping {
  raw: string
  functionName: string
  filePath: string
  startLine: number
  endLine: number
  codeSnippet?: CodeSnippet
}

export interface NotebookConfig {
  name: string
  notesPath: string
  codeRepos: CodeRepo[]
}

export interface PanelWidths {
  panel1: number
  panel2: number
  panel3: number
  panel4: number
}

export type AppAction =
  | { type: 'SELECT_NOTE'; noteId: string | null }
  | { type: 'SET_NOTE_FILTER'; filter: NoteFilter }
  | { type: 'SET_NOTE_SEARCH'; query: string }
  | { type: 'SET_NOTES'; notes: NoteItem[] }
  | { type: 'SET_ACTIVE_NOTE_CONTENT'; content: unknown; noteType: NoteType | null }
  | { type: 'OPEN_CODE_FILE'; file: CodeFile }
  | { type: 'CLOSE_CODE_FILE'; index: number }
  | { type: 'SET_ACTIVE_CODE_FILE'; index: number }
  | { type: 'SET_CODE_REPO'; path: string }
  | { type: 'SET_CODE_FILES'; files: CodeFile[] }
  | { type: 'SET_PANEL_WIDTHS'; widths: PanelWidths }
  | { type: 'SET_WORKSPACE'; path: string; name: string }
  | { type: 'CLEAR_WORKSPACE' }
  | { type: 'SET_CODE_MAPPINGS'; mappings: CodeMapping[] }
  | { type: 'SET_PENDING_SCROLL'; filePath: string; line: number }
  | { type: 'SET_CODE_REPOS'; repos: CodeRepo[] }
  | { type: 'CLEAR_PENDING_SCROLL' }

export interface AppState {
  notes: NoteItem[]
  selectedNoteId: string | null
  noteFilter: NoteFilter
  noteSearchQuery: string
  activeNoteContent: unknown
  activeNoteType: NoteType | null
  openCodeFiles: CodeFile[]
  activeCodeFileIndex: number
  codeRepoPath: string | null
  codeFiles: CodeFile[]
  panelWidths: PanelWidths
  workspacePath: string | null
  workspaceName: string
  codeMappings: CodeMapping[]
  pendingScroll: { filePath: string; line: number } | null
  codeRepos: CodeRepo[]
}
