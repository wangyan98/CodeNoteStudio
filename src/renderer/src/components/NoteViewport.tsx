import { useEffect, useState, useRef, useCallback } from 'react'
import { useAppContext } from '../contexts/AppContext'
import { useNotes } from '../hooks/useNotes'
import { useCodeNavigation } from '../hooks/useCodeNavigation'
import { MdEditor } from './editors/MdEditor'
import type { MdEditorHandle } from './editors/MdEditor'
import { MindMapEditor } from './editors/MindMapEditor'
import { DerivationEditor } from './editors/DerivationEditor'
import { SequenceEditor } from './editors/SequenceEditor'
import { CodeMappingsPanel } from './CodeMappingsPanel'
import type { MindMapDocument, DerivationDocument } from '../../../main/schemas/note-types'
import type { CodeMapping } from '../types'
import './NoteViewport.css'

export function NoteViewport() {
  const { state } = useAppContext()
  const { saveNote, selectNote } = useNotes()
  const { navigateToCode } = useCodeNavigation()

  const { activeNoteContent, activeNoteType, selectedNoteId } = state

  const mdEditorRef = useRef<MdEditorHandle>(null)
  const [codeMappings, setCodeMappings] = useState<CodeMapping[]>([])
  const [dragOver, setDragOver] = useState(false)

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
    window.electronAPI.resolveRefs(selectedNoteId, contentStr, state.codeRepoPath ?? undefined)
      .then((mappings: CodeMapping[]) => {
        setCodeMappings(mappings)
      })
      .catch(() => {
        setCodeMappings([])
      })
  }, [activeNoteContent, selectedNoteId])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false)
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)

    const isImage = e.dataTransfer.getData('application/x-image-drag') === 'true'
    const noteEmbedPath = e.dataTransfer.getData('application/x-note-embed')
    const plainText = e.dataTransfer.getData('text/plain')

    if (!plainText) return

    if (noteEmbedPath && state.activeNoteType === 'md' && mdEditorRef.current) {
      mdEditorRef.current.switchToEdit()
      mdEditorRef.current.insertAtCursor(`![[${noteEmbedPath}]]`)
      return
    }

    if (isImage) {
      const sourcePath = e.dataTransfer.getData('application/x-source-path')
      if (sourcePath && mdEditorRef.current) {
        const fileName = sourcePath.split('/').pop() || sourcePath.split('\\').pop() || 'image'
        try {
          const result = await window.electronAPI.copyFileToAssets(sourcePath)
          mdEditorRef.current.insertAtPosition(
            `![${fileName}](wsfile://${result.absolutePath})`,
            e.clientX, e.clientY
          )
        } catch {
          mdEditorRef.current.insertAtPosition(
            `![${fileName}](wsfile://${sourcePath})`,
            e.clientX, e.clientY
          )
        }
      }
    } else {
      if (mdEditorRef.current) {
        mdEditorRef.current.insertAtPosition(plainText, e.clientX, e.clientY)
      }
    }
  }, [state.activeNoteType])

  if (!selectedNoteId || activeNoteContent === null) {
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
            workspacePath={state.workspacePath}
            codeRepoPath={state.codeRepoPath}
            codeMappings={codeMappings}
            onSave={async (content: string) => {
              await saveNote(selectedNoteId, content)
            }}
            onRefClick={async (refName: string) => {
              const mappings = await window.electronAPI.resolveRefs(selectedNoteId, `@ref(${refName})`, state.codeRepoPath ?? undefined)
              if (mappings.length > 0) {
                navigateToCode(mappings[0].filePath, mappings[0].startLine)
              }
            }}
            onEmbedClick={(notePath, noteType) => {
              selectNote(notePath, noteType)
            }}
          />
        )

      case 'mind':
        return (
          <MindMapEditor
            document={activeNoteContent as MindMapDocument}
            notePath={selectedNoteId}
            onSave={async (doc: MindMapDocument) => {
              await saveNote(selectedNoteId, doc)
            }}
            onNavigateToCode={(filePath: string, line: number) => {
              navigateToCode(filePath, line)
            }}
          />
        )

      case 'derive':
        return (
          <DerivationEditor
            document={activeNoteContent as DerivationDocument}
            onSave={async (doc: DerivationDocument) => {
              await saveNote(selectedNoteId, doc)
            }}
            codeRepoPath={state.codeRepoPath}
          />
        )

      case 'seq':
        return (
          <SequenceEditor
            content={activeNoteContent as string}
            notePath={selectedNoteId}
            onSave={async (content: string) => {
              await saveNote(selectedNoteId, content)
            }}
          />
        )

      default:
        return <p>Unknown note type: {activeNoteType}</p>
    }
  }

  const typeLabels: Record<string, string> = {
    md: 'MD',
    mind: 'Mind',
    derive: 'Derive',
    seq: 'Seq'
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
      <div
        className={`note-viewport${dragOver ? ' note-viewport-drag-over' : ''}`}
        onDragOverCapture={handleDragOver}
        onDragLeave={handleDragLeave}
        onDropCapture={handleDrop}
      >
        {renderEditor()}
      </div>
      <CodeMappingsPanel mappings={codeMappings} />
    </div>
  )
}
