import { useEffect, useState, useRef, useCallback } from 'react'
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
    window.electronAPI.resolveRefs(selectedNoteId, contentStr)
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
    const plainText = e.dataTransfer.getData('text/plain')

    if (!plainText) return

    if (isImage) {
      const sourcePath = e.dataTransfer.getData('application/x-source-path')
      if (sourcePath && mdEditorRef.current) {
        const fileName = sourcePath.split('/').pop() || sourcePath.split('\\').pop() || 'image'
        const ext = fileName.split('.').pop()?.toLowerCase() || 'png'
        const mimeMap: Record<string, string> = {
          png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
          gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml'
        }
        const mime = mimeMap[ext] || 'image/png'
        try {
          const result = await window.electronAPI.copyFileToAssets(sourcePath)
          const base64 = await window.electronAPI.readBinaryFile(result.absolutePath)
          mdEditorRef.current.insertAtPosition(`![${fileName}](data:${mime};base64,${base64})`, e.clientX, e.clientY)
        } catch {
          const base64 = await window.electronAPI.readBinaryFile(sourcePath)
          mdEditorRef.current.insertAtPosition(`![${fileName}](data:${mime};base64,${base64})`, e.clientX, e.clientY)
        }
      }
    } else {
      if (mdEditorRef.current) {
        mdEditorRef.current.insertAtPosition(plainText, e.clientX, e.clientY)
      }
    }
  }, [])

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
            codeMappings={codeMappings}
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
