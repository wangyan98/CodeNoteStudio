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
    folder: expanded ? '▾' : '▸'
  }

  return (
    <>
      <div
        className={`tree-item ${isSelected ? 'selected' : ''} ${isFolder ? 'tree-item-folder' : ''}`}
        style={{ '--depth': depth } as React.CSSProperties}
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
    { label: 'Derive', value: 'derive' }
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

  const handleNewNote = useCallback(async () => {
    const name = prompt('Note name (include extension: .md, .mind.json, .derive.json):')
    if (!name) return

    let type: NoteType = 'md'
    if (name.endsWith('.mind.json')) type = 'mind'
    else if (name.endsWith('.derive.json')) type = 'derive'

    await createNote(name, type)
  }, [createNote])

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
          <div style={{ padding: '4px 8px' }}>
            <button className="new-note-btn" onClick={handleNewNote}>
              + New Note
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
