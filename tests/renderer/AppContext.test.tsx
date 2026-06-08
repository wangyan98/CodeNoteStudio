import { describe, it, expect } from 'vitest'
import { appReducer, initialState } from '../../src/renderer/src/contexts/AppContext'
import type { CodeFile } from '../../src/renderer/src/types'

describe('appReducer', () => {
  function makeFile(path: string): CodeFile {
    return { path, name: path.split('/').pop() || path, language: 'typescript' }
  }

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
    expect(state.recentlyClosedFile).toEqual(file1)
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

  it('SET_WORKSPACE_HISTORY updates workspace history', () => {
    const entries = [
      { path: '/a', name: 'A', lastOpened: 1000 },
      { path: '/b', name: 'B', lastOpened: 2000 },
    ]
    const state = appReducer(initialState, { type: 'SET_WORKSPACE_HISTORY', history: entries })
    expect(state.workspaceHistory).toEqual(entries)
  })

  it('CLOSE_CODE_FILE stores closed file in recentlyClosedFile', () => {
    const file = makeFile('/a.ts')
    let state = appReducer(initialState, { type: 'OPEN_CODE_FILE', file })
    state = appReducer(state, { type: 'CLOSE_CODE_FILE', index: 0 })
    expect(state.openCodeFiles).toHaveLength(0)
    expect(state.recentlyClosedFile).toEqual(file)
  })

  it('CLOSE_OTHER_CODE_FILES keeps only the clicked tab', () => {
    let state = initialState
    for (const f of [makeFile('/a.ts'), makeFile('/b.ts'), makeFile('/c.ts')]) {
      state = appReducer(state, { type: 'OPEN_CODE_FILE', file: f })
    }
    state = appReducer(state, { type: 'CLOSE_OTHER_CODE_FILES', index: 1 })
    expect(state.openCodeFiles).toHaveLength(1)
    expect(state.openCodeFiles[0].path).toBe('/b.ts')
    expect(state.activeCodeFileIndex).toBe(0)
    expect(state.recentlyClosedFile).toBeNull()
  })

  it('CLOSE_CODE_FILES_LEFT removes tabs before index', () => {
    let state = initialState
    for (const f of [makeFile('/a.ts'), makeFile('/b.ts'), makeFile('/c.ts')]) {
      state = appReducer(state, { type: 'OPEN_CODE_FILE', file: f })
    }
    state = appReducer(state, { type: 'CLOSE_CODE_FILES_LEFT', index: 1 })
    expect(state.openCodeFiles).toHaveLength(2)
    expect(state.openCodeFiles[0].path).toBe('/b.ts')
    expect(state.openCodeFiles[1].path).toBe('/c.ts')
    expect(state.activeCodeFileIndex).toBe(0)
  })

  it('CLOSE_CODE_FILES_RIGHT removes tabs after index', () => {
    let state = initialState
    for (const f of [makeFile('/a.ts'), makeFile('/b.ts'), makeFile('/c.ts')]) {
      state = appReducer(state, { type: 'OPEN_CODE_FILE', file: f })
    }
    state = appReducer(state, { type: 'CLOSE_CODE_FILES_RIGHT', index: 1 })
    expect(state.openCodeFiles).toHaveLength(2)
    expect(state.openCodeFiles[0].path).toBe('/a.ts')
    expect(state.openCodeFiles[1].path).toBe('/b.ts')
    expect(state.activeCodeFileIndex).toBe(1)
  })

  it('CLOSE_ALL_CODE_FILES clears all tabs and stores active file', () => {
    let state = initialState
    for (const f of [makeFile('/a.ts'), makeFile('/b.ts')]) {
      state = appReducer(state, { type: 'OPEN_CODE_FILE', file: f })
    }
    state = appReducer(state, { type: 'SET_ACTIVE_CODE_FILE', index: 0 })
    state = appReducer(state, { type: 'CLOSE_ALL_CODE_FILES' })
    expect(state.openCodeFiles).toHaveLength(0)
    expect(state.activeCodeFileIndex).toBe(-1)
    expect(state.recentlyClosedFile?.path).toBe('/a.ts')
  })

  it('REOPEN_CLOSED_CODE_FILE restores the last closed file', () => {
    const file = makeFile('/a.ts')
    let state = appReducer(initialState, { type: 'OPEN_CODE_FILE', file })
    state = appReducer(state, { type: 'CLOSE_CODE_FILE', index: 0 })
    state = appReducer(state, { type: 'REOPEN_CLOSED_CODE_FILE' })
    expect(state.openCodeFiles).toHaveLength(1)
    expect(state.openCodeFiles[0]).toEqual(file)
    expect(state.activeCodeFileIndex).toBe(0)
    expect(state.recentlyClosedFile).toBeNull()
  })

  it('REOPEN_CLOSED_CODE_FILE is no-op when recentlyClosedFile is null', () => {
    const state = appReducer(initialState, { type: 'REOPEN_CLOSED_CODE_FILE' })
    expect(state).toEqual(initialState)
  })

  it('REVEAL_FILE_IN_TREE sets revealFilePath', () => {
    const state = appReducer(initialState, { type: 'REVEAL_FILE_IN_TREE', filePath: '/x/y.ts' })
    expect(state.revealFilePath).toBe('/x/y.ts')
  })

  it('CLEAR_REVEAL_FILE_IN_TREE clears revealFilePath', () => {
    let state = appReducer(initialState, { type: 'REVEAL_FILE_IN_TREE', filePath: '/x/y.ts' })
    state = appReducer(state, { type: 'CLEAR_REVEAL_FILE_IN_TREE' })
    expect(state.revealFilePath).toBeNull()
  })

  it('CLOSE_OTHER_CODE_FILES with out-of-bounds index returns state unchanged', () => {
    const file = makeFile('/a.ts')
    let state = appReducer(initialState, { type: 'OPEN_CODE_FILE', file })
    const prev = state
    state = appReducer(state, { type: 'CLOSE_OTHER_CODE_FILES', index: -1 })
    expect(state).toEqual(prev)
    state = appReducer(state, { type: 'CLOSE_OTHER_CODE_FILES', index: 99 })
    expect(state).toEqual(prev)
  })

  it('CLOSE_CODE_FILES_LEFT with out-of-bounds index returns state unchanged', () => {
    const file = makeFile('/a.ts')
    let state = appReducer(initialState, { type: 'OPEN_CODE_FILE', file })
    const prev = state
    state = appReducer(state, { type: 'CLOSE_CODE_FILES_LEFT', index: -1 })
    expect(state).toEqual(prev)
    state = appReducer(state, { type: 'CLOSE_CODE_FILES_LEFT', index: 99 })
    expect(state).toEqual(prev)
  })

  it('CLOSE_ALL_CODE_FILES with no active file stores null', () => {
    const state = appReducer(initialState, { type: 'CLOSE_ALL_CODE_FILES' })
    expect(state.recentlyClosedFile).toBeNull()
  })
})
