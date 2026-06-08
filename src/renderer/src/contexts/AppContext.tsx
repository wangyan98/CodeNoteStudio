import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import type { AppState, AppAction, NoteItem, CodeFile, PanelWidths, WorkspaceHistoryEntry } from '../types'

export const initialState: AppState = {
  notes: [],
  selectedNoteId: null,
  noteFilter: 'all',
  noteSearchQuery: '',
  activeNoteContent: null,
  activeNoteType: null,
  openCodeFiles: [],
  activeCodeFileIndex: -1,
  codeRepoPath: null,
  codeFiles: [],
  panelWidths: { panel1: 18, panel2: 32, panel3: 32, panel4: 18 },
  workspacePath: null,
  workspaceName: '',
  codeMappings: [],
  pendingScroll: null,
  codeRepos: [],
  workspaceHistory: [],
  recentlyClosedFile: null,
  revealFilePath: null,
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SELECT_NOTE':
      return { ...state, selectedNoteId: action.noteId, activeNoteContent: null, activeNoteType: null }

    case 'SET_NOTE_FILTER':
      return { ...state, noteFilter: action.filter }

    case 'SET_NOTE_SEARCH':
      return { ...state, noteSearchQuery: action.query }

    case 'SET_NOTES':
      return { ...state, notes: action.notes }

    case 'OPEN_CODE_FILE': {
      const existingIndex = state.openCodeFiles.findIndex(
        (f) => f.path === action.file.path
      )
      if (existingIndex >= 0) {
        return { ...state, activeCodeFileIndex: existingIndex }
      }
      return {
        ...state,
        openCodeFiles: [...state.openCodeFiles, action.file],
        activeCodeFileIndex: state.openCodeFiles.length,
        recentlyClosedFile:
          action.file.path === state.recentlyClosedFile?.path
            ? null
            : state.recentlyClosedFile
      }
    }

    case 'CLOSE_CODE_FILE': {
      const closedFile = state.openCodeFiles[action.index]
      const updated = state.openCodeFiles.filter((_, i) => i !== action.index)
      const newIndex = Math.min(state.activeCodeFileIndex, updated.length - 1)
      return {
        ...state,
        openCodeFiles: updated,
        activeCodeFileIndex: updated.length === 0 ? -1 : newIndex,
        recentlyClosedFile: closedFile || null
      }
    }

    case 'CLOSE_OTHER_CODE_FILES': {
      if (action.index < 0 || action.index >= state.openCodeFiles.length) return state
      return {
        ...state,
        openCodeFiles: [state.openCodeFiles[action.index]],
        activeCodeFileIndex: 0,
        recentlyClosedFile: null
      }
    }

    case 'CLOSE_CODE_FILES_LEFT': {
      if (action.index < 0 || action.index >= state.openCodeFiles.length) return state
      const updated = state.openCodeFiles.slice(action.index)
      return {
        ...state,
        openCodeFiles: updated,
        activeCodeFileIndex: updated.length === 0 ? -1 : 0,
        recentlyClosedFile: null
      }
    }

    case 'CLOSE_CODE_FILES_RIGHT': {
      const updated = state.openCodeFiles.slice(0, action.index + 1)
      return {
        ...state,
        openCodeFiles: updated,
        activeCodeFileIndex: Math.min(state.activeCodeFileIndex, updated.length - 1),
        recentlyClosedFile: null
      }
    }

    case 'CLOSE_ALL_CODE_FILES': {
      const activeFile = state.activeCodeFileIndex >= 0
        ? state.openCodeFiles[state.activeCodeFileIndex]
        : null
      return {
        ...state,
        openCodeFiles: [],
        activeCodeFileIndex: -1,
        recentlyClosedFile: activeFile || null
      }
    }

    case 'REOPEN_CLOSED_CODE_FILE': {
      if (!state.recentlyClosedFile) return state
      return {
        ...state,
        openCodeFiles: [...state.openCodeFiles, state.recentlyClosedFile],
        activeCodeFileIndex: state.openCodeFiles.length,
        recentlyClosedFile: null
      }
    }

    case 'REVEAL_FILE_IN_TREE':
      return { ...state, revealFilePath: action.filePath }

    case 'CLEAR_REVEAL_FILE_IN_TREE':
      return { ...state, revealFilePath: null }

    case 'SET_ACTIVE_CODE_FILE':
      return { ...state, activeCodeFileIndex: action.index }

    case 'SET_CODE_REPO':
      return { ...state, codeRepoPath: action.path }

    case 'SET_CODE_REPOS':
      return { ...state, codeRepos: action.repos }

    case 'SET_CODE_FILES':
      return { ...state, codeFiles: action.files }

    case 'SET_PANEL_WIDTHS':
      return { ...state, panelWidths: action.widths }

    case 'SET_WORKSPACE':
      return { ...state, workspacePath: action.path, workspaceName: action.name }

    case 'CLEAR_WORKSPACE':
      return { ...state, workspacePath: null, workspaceName: '' }

    case 'RESET_WORKSPACE_STATE':
      return {
        ...state,
        notes: [],
        selectedNoteId: null,
        activeNoteContent: null,
        activeNoteType: null,
        openCodeFiles: [],
        activeCodeFileIndex: -1,
        codeRepoPath: null,
        codeFiles: [],
        codeRepos: [],
        codeMappings: [],
        pendingScroll: null,
        recentlyClosedFile: null,
        revealFilePath: null
      }

    case 'SET_WORKSPACE_HISTORY':
      return { ...state, workspaceHistory: action.history }

    case 'SET_CODE_MAPPINGS':
      return { ...state, codeMappings: action.mappings }

    case 'SET_PENDING_SCROLL':
      return { ...state, pendingScroll: { filePath: action.filePath, line: action.line } }

    case 'CLEAR_PENDING_SCROLL':
      return { ...state, pendingScroll: null }

    case 'SET_ACTIVE_NOTE_CONTENT':
      return {
        ...state,
        activeNoteContent: action.content,
        activeNoteType: action.noteType
      }

    default:
      return state
  }
}

interface AppContextValue {
  state: AppState
  dispatch: Dispatch<AppAction>
  isReadOnly: boolean
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({
  children,
  initialStateOverride,
  isReadOnly = false
}: {
  children: ReactNode
  initialStateOverride?: AppState
  isReadOnly?: boolean
}) {
  const [state, dispatch] = useReducer(appReducer, initialStateOverride || initialState)
  return (
    <AppContext.Provider value={{ state, dispatch, isReadOnly }}>
      {children}
    </AppContext.Provider>
  )
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) {
    throw new Error('useAppContext must be used within AppProvider')
  }
  return ctx
}
