import { useCallback } from 'react'
import { useAppContext } from '../contexts/AppContext'
import type { NoteType } from '../types'

export function useNotes() {
  const { state, dispatch } = useAppContext()

  const refreshNotes = useCallback(async () => {
    const filterType = state.noteFilter === 'all' ? undefined : state.noteFilter
    const notes = await window.electronAPI.listNotes(filterType)
    dispatch({ type: 'SET_NOTES', notes })
  }, [state.noteFilter, dispatch])

  const selectNote = useCallback(async (relativePath: string, type: NoteType) => {
    dispatch({ type: 'SELECT_NOTE', noteId: relativePath })
    const content = await window.electronAPI.readNote(relativePath)
    dispatch({ type: 'SET_ACTIVE_NOTE_CONTENT', content, noteType: type })
  }, [dispatch])

  const createNote = useCallback(async (relativePath: string, type: NoteType) => {
    await window.electronAPI.createNote(relativePath, type)
    await refreshNotes()
    await selectNote(relativePath, type)
  }, [refreshNotes, selectNote])

  const deleteNote = useCallback(async (relativePath: string) => {
    await window.electronAPI.deleteNote(relativePath)
    if (state.selectedNoteId === relativePath) {
      dispatch({ type: 'SELECT_NOTE', noteId: null })
      dispatch({ type: 'SET_ACTIVE_NOTE_CONTENT', content: null, noteType: null })
    }
    await refreshNotes()
  }, [state.selectedNoteId, dispatch, refreshNotes])

  const renameNote = useCallback(async (oldPath: string, newPath: string) => {
    await window.electronAPI.renameNote(oldPath, newPath)
    if (state.selectedNoteId === oldPath) {
      dispatch({ type: 'SELECT_NOTE', noteId: newPath })
    }
    await refreshNotes()
  }, [state.selectedNoteId, dispatch, refreshNotes])

  const saveNote = useCallback(async (relativePath: string, content: unknown) => {
    await window.electronAPI.updateNote(relativePath, content)
  }, [])

  return { refreshNotes, selectNote, createNote, deleteNote, renameNote, saveNote }
}
