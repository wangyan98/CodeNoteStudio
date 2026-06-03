import { useEffect, useState, useCallback } from 'react'
import { useAppContext } from '../contexts/AppContext'
import { useNotes } from '../hooks/useNotes'
import type { NoteItem, NoteFilter, NoteType } from '../types'
import './NoteDirectory.css'

interface TreeNode {
  name: string
  path: string
  type: 'folder' | NoteType
  children: TreeNode[]
}

function buildTree(notes: NoteItem[]): TreeNode[] {
  const root: TreeNode[] = []

  for (const note of notes) {
    const parts = note.relativePath.split('/')
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1
      const partName = parts[i]
      let node = current.find((n) => n.name === partName)

      if (!node) {
        node = {
          name: partName,
          path: parts.slice(0, i + 1).join('/'),
          type: isLast ? note.type : 'folder',
          children: []
        }
        current.push(node)
      }
      current = node.children
    }
  }

  return root
}

function TreeItem({
  node,
  depth,
  selectedPath,
  onSelect,
  onDelete,
  onRename
}: {
  node: TreeNode
  depth: number
  selectedPath: string | null
  onSelect: (node: TreeNode) => void
  onDelete: (node: TreeNode) => void
  onRename: (node: TreeNode) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const isFolder = node.type === 'folder'
  const isSelected = selectedPath === node.path && !isFolder
  const isNote = node.type !== 'folder'

  const icons: Record<string, string> = {
    mind: '🧠',
    md: '📝',
    derive: '∑',
    seq: '⚡',
    net: '🔗',
    folder: expanded ? '▾' : '▸'
  }

  const isEmbeddable = node.type === 'derive' || node.type === 'mind' || node.type === 'seq' || node.type === 'net'

  return (
    <>
      <div
        className={`tree-item ${isSelected ? 'selected' : ''} ${isFolder ? 'tree-item-folder' : ''}`}
        style={{ '--depth': depth } as React.CSSProperties}
        draggable={isEmbeddable}
        onDragStart={(e) => {
          if (!isEmbeddable) return
          const embedText = `![[${node.path}]]`
          e.dataTransfer.setData('text/plain', embedText)
          e.dataTransfer.setData('application/x-note-embed', node.path)
          e.dataTransfer.effectAllowed = 'copy'
        }}
        onClick={() => {
          if (isFolder) {
            setExpanded(!expanded)
          } else {
            onSelect(node)
          }
        }}
      >
        <span className="tree-item-icon">{icons[node.type]}</span>
        <span>{node.name}</span>
        {isNote && (
          <span className="note-actions">
            <button
              className="note-action-btn"
              onClick={(e) => {
                e.stopPropagation()
                onRename(node)
              }}
              title="Rename"
            >
              {'✎'}
            </button>
            <button
              className="note-action-btn delete"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(node)
              }}
              title="Delete"
            >
              {'✕'}
            </button>
          </span>
        )}
      </div>
      {isFolder && expanded && node.children.map((child) => (
        <TreeItem
          key={child.path}
          node={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onDelete={onDelete}
          onRename={onRename}
        />
      ))}
    </>
  )
}

export function NoteDirectory() {
  const { state, dispatch } = useAppContext()
  const { refreshNotes, selectNote, createNote, deleteNote, renameNote } = useNotes()
  const [tree, setTree] = useState<TreeNode[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  const filters: { label: string; value: NoteFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'MD', value: 'md' },
    { label: 'Mind', value: 'mind' },
    { label: 'Derive', value: 'derive' },
    { label: 'Seq', value: 'seq' },
    { label: 'Net', value: 'net' }
  ]

  useEffect(() => {
    refreshNotes()
  }, [state.noteFilter])

  useEffect(() => {
    setTree(buildTree(state.notes))
  }, [state.notes])

  const handleSelect = useCallback((node: TreeNode) => {
    if (node.type !== 'folder') {
      selectNote(node.path, node.type as NoteType)
    }
  }, [selectNote])

  const handleDelete = useCallback(async (node: TreeNode) => {
    if (node.type !== 'folder' && confirm(`Delete "${node.name}"?`)) {
      await deleteNote(node.path)
    }
  }, [deleteNote])

  const handleRename = useCallback(async (node: TreeNode) => {
    if (node.type === 'folder') return
    const newName = prompt('New name:', node.name)
    if (newName && newName !== node.name) {
      const parts = node.path.split('/')
      parts[parts.length - 1] = newName
      await renameNote(node.path, parts.join('/'))
    }
  }, [renameNote])

  const [showNewNoteInput, setShowNewNoteInput] = useState(false)
  const [newNoteName, setNewNoteName] = useState('')
  const [newNoteType, setNewNoteType] = useState<NoteType>('md')
  const [showNewFolderInput, setShowNewFolderInput] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  const typeOptions: { label: string; value: NoteType; suffix: string }[] = [
    { label: '.md', value: 'md', suffix: '.md' },
    { label: '.mind.json', value: 'mind', suffix: '.mind.json' },
    { label: '.derive.json', value: 'derive', suffix: '.derive.json' },
    { label: '.seq.mermaid', value: 'seq', suffix: '.seq.mermaid' },
    { label: '.net.json', value: 'net', suffix: '.net.json' }
  ]

  const handleNewNote = useCallback(() => {
    setShowNewNoteInput(true)
    setNewNoteName('')
    setNewNoteType('md')
  }, [])

  const handleSubmitNewNote = useCallback(async () => {
    const baseName = newNoteName.trim()
    if (!baseName) {
      setShowNewNoteInput(false)
      return
    }
    try {
      const suffix = typeOptions.find((o) => o.value === newNoteType)?.suffix ?? '.md'
      const fullName = baseName + suffix
      await createNote(fullName, newNoteType)
      setShowNewNoteInput(false)
      setNewNoteName('')
    } catch (err) {
      console.error('Failed to create note:', err)
    }
  }, [newNoteName, newNoteType, createNote])

  const handleNewFolder = useCallback(() => {
    setShowNewFolderInput(true)
    setNewFolderName('')
  }, [])

  const handleSubmitNewFolder = useCallback(async () => {
    const folderName = newFolderName.trim()
    if (!folderName) {
      setShowNewFolderInput(false)
      return
    }
    try {
      await window.electronAPI.createFolder(folderName)
      await refreshNotes()
      setShowNewFolderInput(false)
      setNewFolderName('')
    } catch (err) {
      console.error('Failed to create folder:', err)
    }
  }, [newFolderName, refreshNotes])

  const filteredTree = searchQuery
    ? tree.filter((node) =>
        node.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : tree

  return (
    <div className="panel panel-note-directory">
      <div className="panel-header">Notes</div>
      <div className="note-directory">
        <div className="note-directory-toolbar">
          {filters.map((f) => (
            <button
              key={f.value}
              className={`filter-btn ${state.noteFilter === f.value ? 'active' : ''}`}
              onClick={() => dispatch({ type: 'SET_NOTE_FILTER', filter: f.value })}
            >
              {f.label}
            </button>
          ))}
          <input
            className="note-directory-search"
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="note-directory-toolbar-buttons">
            {showNewNoteInput ? (
              <div className="new-note-input-group">
                <div className="new-note-input-row">
                  <input
                    className="new-note-name-input"
                    type="text"
                    placeholder="filename"
                    value={newNoteName}
                    onChange={(e) => setNewNoteName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSubmitNewNote()
                      if (e.key === 'Escape') setShowNewNoteInput(false)
                    }}
                    autoFocus
                  />
                  <select
                    className="new-note-type-select"
                    value={newNoteType}
                    onChange={(e) => setNewNoteType(e.target.value as NoteType)}
                  >
                    {typeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="new-note-actions">
                  <button className="new-note-submit-btn" onClick={handleSubmitNewNote}>
                    OK
                  </button>
                  <button className="new-note-cancel-btn" onClick={() => setShowNewNoteInput(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button className="new-note-btn" onClick={handleNewNote} title="New Note">
                📝+
              </button>
            )}
            {showNewFolderInput ? (
              <div className="new-note-input-group">
                <div className="new-note-input-row">
                  <input
                    className="new-note-name-input"
                    type="text"
                    placeholder="folder name"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSubmitNewFolder()
                      if (e.key === 'Escape') setShowNewFolderInput(false)
                    }}
                    autoFocus
                  />
                </div>
                <div className="new-note-actions">
                  <button className="new-note-submit-btn" onClick={handleSubmitNewFolder}>
                    OK
                  </button>
                  <button className="new-note-cancel-btn" onClick={() => setShowNewFolderInput(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button className="new-note-btn" onClick={handleNewFolder} title="New Folder">
                📁+
              </button>
            )}
          </div>
        </div>
        <div className="note-tree">
          {filteredTree.map((node) => (
            <TreeItem
              key={node.path}
              node={node}
              depth={0}
              selectedPath={state.selectedNoteId}
              onSelect={handleSelect}
              onDelete={handleDelete}
              onRename={handleRename}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
