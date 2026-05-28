import { useEffect, useState, useRef } from 'react'
import { useAppContext } from '../contexts/AppContext'
import { useNotes } from '../hooks/useNotes'
import { useCodeNavigation } from '../hooks/useCodeNavigation'
import { MdEditor } from './editors/MdEditor'
import type { MdEditorHandle } from './editors/MdEditor'
import { MindMapRenderer } from './editors/MindMapRenderer'
import { DerivationRenderer } from './editors/DerivationRenderer'
import { CodeMappingsPanel } from './CodeMappingsPanel'
import type { MindMapDocument, DerivationDocument } from '../../../main/schemas/note-types'
import type { CodeMapping } from '../types'
import './NoteViewport.css'

export function NoteViewport() {
  const { state } = useAppContext()
  const { saveNote } = useNotes()
  const { navigateToCode } = useCodeNavigation()

  const { activeNoteContent, activeNoteType, selectedNoteId } = state

  const mdEditorRef = useRef<MdEditorHandle>(null)
  const [codeMappings, setCodeMappings] = useState<CodeMapping[]>([])
  const [matchedRaws, setMatchedRaws] = useState<string[]>([])

  // Listen for symbol-insert events from CodeViewport's SymbolPicker
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent<string>).detail
      if (mdEditorRef.current) {
        mdEditorRef.current.insertAtCursor(text)
      }
    }
    window.addEventListener('symbol-insert', handler)
    return () => window.removeEventListener('symbol-insert', handler)
  }, [])

  useEffect(() => {
    if (!activeNoteContent || !selectedNoteId) {
      setCodeMappings([])
      return
    }
    const contentStr = typeof activeNoteContent === 'string'
      ? activeNoteContent
      : JSON.stringify(activeNoteContent)
    window.electronAPI.resolveRefs(selectedNoteId, contentStr)
      .then((mappings: CodeMapping[]) => {
        setCodeMappings(mappings)
        setMatchedRaws(mappings.map((m) => m.raw))
      })
      .catch(() => {
        setCodeMappings([])
        setMatchedRaws([])
      })
  }, [activeNoteContent, selectedNoteId])

  if (!selectedNoteId || !activeNoteContent) {
    return (
      <div className="panel panel-note-viewport">
        <div className="panel-header">Note Viewport</div>
        <div className="note-viewport-placeholder">
          <p>{state.notes.length === 0 ? 'Create a note to get started' : 'Select a note to view'}</p>
        </div>
      </div>
    )
  }

  const renderEditor = () => {
    switch (activeNoteType) {
      case 'md':
        return (
          <MdEditor
            ref={mdEditorRef}
            content={activeNoteContent as string}
            notePath={selectedNoteId}
            matchedRaws={matchedRaws}
            onSave={async (content: string) => {
              await saveNote(selectedNoteId, content)
            }}
            onRefClick={async (refName: string) => {
              const mappings = await window.electronAPI.resolveRefs(selectedNoteId, `@ref(${refName})`)
              if (mappings.length > 0) {
                navigateToCode(mappings[0].filePath, mappings[0].startLine)
              }
            }}
          />
        )

      case 'mind':
        return (
          <MindMapRenderer
            document={activeNoteContent as MindMapDocument}
            onSave={async (doc: MindMapDocument) => {
              await saveNote(selectedNoteId, doc)
            }}
          />
        )

      case 'derive':
        return (
          <DerivationRenderer
            document={activeNoteContent as DerivationDocument}
          />
        )

      default:
        return <p>Unknown note type: {activeNoteType}</p>
    }
  }

  const typeLabels: Record<string, string> = {
    md: 'MD',
    mind: 'Mind',
    derive: 'Derive'
  }

  return (
    <div className="panel panel-note-viewport">
      <div className="panel-header">
        Note Viewport
        {activeNoteType && (
          <>
            <span className="note-viewport-type-badge" style={{ marginLeft: 8 }}>
              {typeLabels[activeNoteType]}
            </span>
            <span className="note-viewport-title" style={{ marginLeft: 8 }}>
              {selectedNoteId}
            </span>
          </>
        )}
      </div>
      <div className="note-viewport">
        {renderEditor()}
      </div>
      <CodeMappingsPanel mappings={codeMappings} />
    </div>
  )
}
