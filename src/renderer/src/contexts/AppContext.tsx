import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import type { AppState, AppAction, NoteItem, CodeFile, PanelWidths } from '../types'

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
  panelWidths: { panel1: 18, panel2: 32, panel3: 32, panel4: 18 }
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SELECT_NOTE':
      return { ...state, selectedNoteId: action.noteId }

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
        activeCodeFileIndex: state.openCodeFiles.length
      }
    }

    case 'CLOSE_CODE_FILE': {
      const updated = state.openCodeFiles.filter((_, i) => i !== action.index)
      const newIndex = Math.min(state.activeCodeFileIndex, updated.length - 1)
      return {
        ...state,
        openCodeFiles: updated,
        activeCodeFileIndex: updated.length === 0 ? -1 : newIndex
      }
    }

    case 'SET_ACTIVE_CODE_FILE':
      return { ...state, activeCodeFileIndex: action.index }

    case 'SET_CODE_REPO':
      return { ...state, codeRepoPath: action.path }

    case 'SET_CODE_FILES':
      return { ...state, codeFiles: action.files }

    case 'SET_PANEL_WIDTHS':
      return { ...state, panelWidths: action.widths }

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
