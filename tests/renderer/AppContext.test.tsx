import { describe, it, expect } from 'vitest'
import { appReducer, initialState } from '../../src/renderer/src/contexts/AppContext'

describe('appReducer', () => {
  it('SELECT_NOTE sets selectedNoteId', () => {
    const state = appReducer(initialState, { type: 'SELECT_NOTE', noteId: 'note-1' })
    expect(state.selectedNoteId).toBe('note-1')
  })

  it('SELECT_NOTE with null deselects note', () => {
    const withSelection = { ...initialState, selectedNoteId: 'note-1' }
    const state = appReducer(withSelection, { type: 'SELECT_NOTE', noteId: null })
    expect(state.selectedNoteId).toBeNull()
  })

  it('SET_NOTE_FILTER changes the filter', () => {
    const state = appReducer(initialState, { type: 'SET_NOTE_FILTER', filter: 'md' })
    expect(state.noteFilter).toBe('md')
  })

  it('SET_NOTE_SEARCH updates search query', () => {
    const state = appReducer(initialState, { type: 'SET_NOTE_SEARCH', query: 'sort' })
    expect(state.noteSearchQuery).toBe('sort')
  })

  it('OPEN_CODE_FILE adds file and sets it active', () => {
    const file = { path: '/repo/src/main.ts', name: 'main.ts', language: 'typescript' }
    const state = appReducer(initialState, { type: 'OPEN_CODE_FILE', file })
    expect(state.openCodeFiles).toHaveLength(1)
    expect(state.openCodeFiles[0]).toEqual(file)
    expect(state.activeCodeFileIndex).toBe(0)
  })

  it('OPEN_CODE_FILE does not duplicate existing file', () => {
    const file = { path: '/repo/src/main.ts', name: 'main.ts', language: 'typescript' }
    const withFile = appReducer(initialState, { type: 'OPEN_CODE_FILE', file })
    const state = appReducer(withFile, { type: 'OPEN_CODE_FILE', file })
    expect(state.openCodeFiles).toHaveLength(1)
    expect(state.activeCodeFileIndex).toBe(0)
  })

  it('CLOSE_CODE_FILE removes the file at index', () => {
    const file1 = { path: '/a.ts', name: 'a.ts', language: 'typescript' }
    const file2 = { path: '/b.ts', name: 'b.ts', language: 'typescript' }
    let state = appReducer(initialState, { type: 'OPEN_CODE_FILE', file: file1 })
    state = appReducer(state, { type: 'OPEN_CODE_FILE', file: file2 })
    state = appReducer(state, { type: 'CLOSE_CODE_FILE', index: 0 })
    expect(state.openCodeFiles).toHaveLength(1)
    expect(state.openCodeFiles[0]).toEqual(file2)
  })

  it('SET_ACTIVE_CODE_FILE changes active index', () => {
    const file1 = { path: '/a.ts', name: 'a.ts', language: 'typescript' }
    const file2 = { path: '/b.ts', name: 'b.ts', language: 'typescript' }
    let state = appReducer(initialState, { type: 'OPEN_CODE_FILE', file: file1 })
    state = appReducer(state, { type: 'OPEN_CODE_FILE', file: file2 })
    state = appReducer(state, { type: 'SET_ACTIVE_CODE_FILE', index: 0 })
    expect(state.activeCodeFileIndex).toBe(0)
  })

  it('SET_PANEL_WIDTHS updates panel widths', () => {
    const widths = { panel1: 20, panel2: 30, panel3: 30, panel4: 20 }
    const state = appReducer(initialState, { type: 'SET_PANEL_WIDTHS', widths })
    expect(state.panelWidths).toEqual(widths)
  })
})
