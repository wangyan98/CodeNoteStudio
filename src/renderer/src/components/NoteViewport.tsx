import { useAppContext } from '../contexts/AppContext'
import { useNotes } from '../hooks/useNotes'
import { MdEditor } from './editors/MdEditor'
import { MindMapRenderer } from './editors/MindMapRenderer'
import { DerivationRenderer } from './editors/DerivationRenderer'
import type { MindMapDocument, DerivationDocument } from '../../../main/schemas/note-types'
import './NoteViewport.css'

export function NoteViewport() {
  const { state } = useAppContext()
  const { saveNote } = useNotes()

  const { activeNoteContent, activeNoteType, selectedNoteId } = state

  if (!selectedNoteId || !activeNoteContent) {
    return (
      <div className="panel panel-note-viewport">
        <div className="panel-header">Note Viewport</div>
        <div className="note-viewport-placeholder">
          <p>Select a note to view</p>
        </div>
      </div>
    )
  }

  const renderEditor = () => {
    switch (activeNoteType) {
      case 'md':
        return (
          <MdEditor
            content={activeNoteContent as string}
            notePath={selectedNoteId}
            onSave={async (content: string) => {
              await saveNote(selectedNoteId, content)
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
    </div>
  )
}
