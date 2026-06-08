import { useEffect, useState, useCallback, useRef } from 'react'
import { useAppContext } from '../contexts/AppContext'
import { useNotes } from '../hooks/useNotes'
import type { NoteItem, NoteFilter, NoteType } from '../types'
import { NodeContextMenu } from './editors/NodeContextMenu'
import type { MenuEntry } from './editors/NodeContextMenu'
import { getClipboardFile, setClipboardFile, clearClipboardFile } from '../services/clipboard'
import './NoteDirectory.css'
import './ContextMenu.css'

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
        const isDir = note.isDirectory || !isLast
        node = {
          name: partName,
          path: parts.slice(0, i + 1).join('/'),
          type: isDir ? 'folder' : note.type,
          children: []
        }
        current.push(node)
      }

      // Directory entries always have type 'folder'
      if (isLast && note.isDirectory) {
        node.type = 'folder'
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
  onRename,
  onContextMenu,
  renamingPath,
  renameValue,
  onRenameValueChange,
  onRenameSubmit,
  onRenameCancel,
  creatingIn,
  creatingType,
  creatingValue,
  onCreatingValueChange,
  onCreateSubmit,
  onCreateCancel
}: {
  node: TreeNode
  depth: number
  selectedPath: string | null
  onSelect: (node: TreeNode) => void
  onDelete: (node: TreeNode) => void
  onRename: (node: TreeNode) => void
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void
  renamingPath: string | null
  renameValue: string
  onRenameValueChange: (v: string) => void
  onRenameSubmit: () => void
  onRenameCancel: () => void
  creatingIn: string | null
  creatingType: NoteType | 'folder'
  creatingValue: string
  onCreatingValueChange: (v: string) => void
  onCreateSubmit: () => void
  onCreateCancel: () => void
}) {
  const [expanded, setExpanded] = useState(true)
  const isFolder = node.type === 'folder'
  const isSelected = selectedPath === node.path && !isFolder
  const isNote = node.type !== 'folder'
  const isRenaming = renamingPath === node.path
  const renameInputRef = useRef<HTMLInputElement>(null)
  const createInputRef = useRef<HTMLInputElement>(null)

  const icons: Record<string, string> = {
    mind: '🧠',
    md: '📝',
    derive: '∑',
    seq: '⚡',
    net: '🔗',
    folder: expanded ? '▾' : '▸'
  }

  const isEmbeddable = node.type === 'derive' || node.type === 'mind' || node.type === 'seq' || node.type === 'net'

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [isRenaming])

  useEffect(() => {
    if (creatingIn === node.path) {
      setExpanded(true)
    }
  }, [creatingIn, node.path])

  useEffect(() => {
    if (creatingIn === node.path && expanded && createInputRef.current) {
      const input = createInputRef.current
      input.focus()
      if (creatingType !== 'folder') {
        input.setSelectionRange(0, 0)
      }
    }
  }, [creatingIn, node.path, creatingType, expanded])

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
        onContextMenu={(e) => onContextMenu(e, node)}
      >
        <span className="tree-item-icon">{icons[node.type]}</span>
        {isRenaming ? (
          <input
            ref={renameInputRef}
            className="tree-item-inline-input"
            value={renameValue}
            onChange={(e) => onRenameValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameSubmit()
              if (e.key === 'Escape') onRenameCancel()
            }}
            onBlur={onRenameCancel}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span>{node.name}</span>
        )}
      </div>
      {isFolder && expanded && (
        <>
          {node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onDelete={onDelete}
              onRename={onRename}
              onContextMenu={onContextMenu}
              renamingPath={renamingPath}
              renameValue={renameValue}
              onRenameValueChange={onRenameValueChange}
              onRenameSubmit={onRenameSubmit}
              onRenameCancel={onRenameCancel}
              creatingIn={creatingIn}
              creatingType={creatingType}
              creatingValue={creatingValue}
              onCreatingValueChange={onCreatingValueChange}
              onCreateSubmit={onCreateSubmit}
              onCreateCancel={onCreateCancel}
            />
          ))}
          {creatingIn === node.path && (
            <div className="tree-item tree-item-create" style={{ '--depth': depth + 1 } as React.CSSProperties}>
              <span className="tree-item-icon">{creatingType === 'folder' ? '📁' : icons[creatingType]}</span>
              <input
                ref={createInputRef}
                className="tree-item-inline-input"
                value={creatingValue}
                placeholder={creatingType === 'folder' ? 'folder name' : 'file name'}
                onChange={(e) => onCreatingValueChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onCreateSubmit()
                  if (e.key === 'Escape') onCreateCancel()
                }}
                onBlur={onCreateCancel}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
        </>
      )}
    </>
  )
}

export function NoteDirectory() {
  const { state, dispatch } = useAppContext()
  const { refreshNotes, selectNote, createNote, deleteNote, renameNote } = useNotes()
  const [tree, setTree] = useState<TreeNode[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  // Inline rename state
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Inline create state
  const [creatingIn, setCreatingIn] = useState<string | null>(null)
  const [creatingType, setCreatingType] = useState<NoteType | 'folder'>('md')
  const [creatingValue, setCreatingValue] = useState('')

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
    const cleanup = window.electronAPI.onNotesChanged(() => {
      refreshNotes()
    })
    return cleanup
  }, [refreshNotes])

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

  const handleRename = useCallback((node: TreeNode) => {
    if (node.type === 'folder') return
    setRenamingPath(node.path)
    setRenameValue(node.name)
  }, [])

  const handleRenameSubmit = useCallback(async () => {
    if (!renamingPath || !renameValue.trim() || renameValue === renamingPath.split('/').pop()) {
      setRenamingPath(null)
      setRenameValue('')
      return
    }
    const parts = renamingPath.split('/')
    parts[parts.length - 1] = renameValue.trim()
    await renameNote(renamingPath, parts.join('/'))
    setRenamingPath(null)
    setRenameValue('')
  }, [renamingPath, renameValue, renameNote])

  const handleRenameCancel = useCallback(() => {
    setRenamingPath(null)
    setRenameValue('')
  }, [])

  const handleCreateSubmit = useCallback(async () => {
    if (!creatingValue.trim()) {
      setCreatingIn(null)
      setCreatingValue('')
      return
    }
    const name = creatingValue.trim()
    const parentPath = creatingIn || ''
    try {
      if (creatingType === 'folder') {
        const relPath = parentPath ? `${parentPath}/${name}` : name
        await window.electronAPI.createFolder(relPath)
      } else {
        const relPath = parentPath ? `${parentPath}/${name}` : name
        await createNote(relPath, creatingType as NoteType)
      }
      await refreshNotes()
    } catch (err) {
      console.error('Failed to create:', err)
    }
    setCreatingIn(null)
    setCreatingValue('')
  }, [creatingValue, creatingIn, creatingType, createNote, refreshNotes])

  const handleCreateCancel = useCallback(() => {
    setCreatingIn(null)
    setCreatingValue('')
  }, [])

  const [showNewNoteInput, setShowNewNoteInput] = useState(false)
  const [newNoteName, setNewNoteName] = useState('')
  const [newNoteType, setNewNoteType] = useState<NoteType>('md')
  const [showNewFolderInput, setShowNewFolderInput] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    node: TreeNode | null
  } | null>(null)

  const noteTypeIcons: Record<NoteType, string> = {
    md: '📝',
    mind: '🧠',
    derive: '∑',
    seq: '⚡',
    net: '🔗'
  }

  const typeOptions: { label: string; value: NoteType; suffix: string; displayName: string }[] = [
    { label: '.md', value: 'md', suffix: '.md', displayName: 'Markdown' },
    { label: '.mind.json', value: 'mind', suffix: '.mind.json', displayName: 'Mindmap' },
    { label: '.derive.json', value: 'derive', suffix: '.derive.json', displayName: 'Derive' },
    { label: '.seq.mermaid', value: 'seq', suffix: '.seq.mermaid', displayName: 'Sequence' },
    { label: '.net.json', value: 'net', suffix: '.net.json', displayName: 'Network' }
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

  const newNoteMenuEntries = useCallback((parentPath: string): MenuEntry[] => {
    return typeOptions.map((opt) => ({
      label: `New ${opt.displayName}`,
      action: () => {
        setCreatingIn(parentPath)
        setCreatingType(opt.value)
        setCreatingValue(opt.suffix)
      }
    }))
  }, [])

  const buildFileContextMenu = useCallback((node: TreeNode): MenuEntry[] => {
    const parentDir = node.path.includes('/')
      ? node.path.substring(0, node.path.lastIndexOf('/'))
      : ''
    const absolutePath = state.workspacePath
      ? state.workspacePath.replace(/\/?$/, '/') + node.path
      : node.path

    return [
      {
        label: 'Copy File',
        action: () => { setClipboardFile(absolutePath) }
      },
      ...(getClipboardFile() ? [{
        label: 'Paste File',
        action: async () => {
          const cf = getClipboardFile()!
          await window.electronAPI.copyFile(cf.sourcePath, parentDir)
          clearClipboardFile()
          await refreshNotes()
        }
      }] : []),
      {
        label: 'Rename',
        action: () => {
          setRenamingPath(node.path)
          setRenameValue(node.name)
        }
      },
      { separator: true },
      {
        label: 'Copy Relative Path',
        action: () => { navigator.clipboard.writeText(node.path) }
      },
      {
        label: 'Copy Absolute Path',
        action: () => { navigator.clipboard.writeText(absolutePath) }
      },
      { separator: true },
      {
        label: 'Delete',
        danger: true,
        action: async () => {
          if (confirm(`Delete "${node.name}"?`)) {
            await deleteNote(node.path)
          }
        }
      }
    ]
  }, [state.workspacePath, deleteNote, refreshNotes])

  const buildFolderContextMenu = useCallback((node: TreeNode): MenuEntry[] => {
    return [
      ...newNoteMenuEntries(node.path),
      {
        label: 'New Folder',
        action: () => {
          setCreatingIn(node.path)
          setCreatingType('folder')
          setCreatingValue('')
        }
      },
      { separator: true },
      ...(getClipboardFile() ? [{
        label: 'Paste File',
        action: async () => {
          const cf = getClipboardFile()!
          await window.electronAPI.copyFile(cf.sourcePath, node.path)
          clearClipboardFile()
          await refreshNotes()
        }
      }] : []),
      {
        label: 'Rename',
        action: () => {
          setRenamingPath(node.path)
          setRenameValue(node.name)
        }
      },
      { separator: true },
      {
        label: 'Delete Folder',
        danger: true,
        action: async () => {
          if (confirm(`Delete folder "${node.name}" and all its contents?`)) {
            await window.electronAPI.deleteFolder(node.path)
            await refreshNotes()
          }
        }
      }
    ]
  }, [refreshNotes])

  const buildRootContextMenu = useCallback((): MenuEntry[] => {
    return [
      ...newNoteMenuEntries(''),
      {
        label: 'New Folder',
        action: () => {
          setCreatingIn('')
          setCreatingType('folder')
          setCreatingValue('')
        }
      },
      ...(getClipboardFile() ? [{
        label: 'Paste File',
        action: async () => {
          const cf = getClipboardFile()!
          await window.electronAPI.copyFile(cf.sourcePath, '')
          clearClipboardFile()
          await refreshNotes()
        }
      }] : [])
    ]
  }, [refreshNotes])

  const handleContextMenu = useCallback((e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, node })
  }, [])

  const handleRootContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, node: null })
  }, [])

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
                      <option key={opt.value} value={opt.value}>{opt.displayName}</option>
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
        <div className="note-tree" onContextMenu={handleRootContextMenu}>
          {filteredTree.map((node) => (
            <TreeItem
              key={node.path}
              node={node}
              depth={0}
              selectedPath={state.selectedNoteId}
              onSelect={handleSelect}
              onDelete={handleDelete}
              onRename={handleRename}
              onContextMenu={handleContextMenu}
              renamingPath={renamingPath}
              renameValue={renameValue}
              onRenameValueChange={setRenameValue}
              onRenameSubmit={handleRenameSubmit}
              onRenameCancel={handleRenameCancel}
              creatingIn={creatingIn}
              creatingType={creatingType}
              creatingValue={creatingValue}
              onCreatingValueChange={setCreatingValue}
              onCreateSubmit={handleCreateSubmit}
              onCreateCancel={handleCreateCancel}
            />
          ))}
          {creatingIn === '' && (
            <div className="tree-item tree-item-create" style={{ '--depth': 0 } as React.CSSProperties}>
              <span className="tree-item-icon">{creatingType === 'folder' ? '📁' : noteTypeIcons[creatingType as NoteType]}</span>
              <input
                className="tree-item-inline-input"
                value={creatingValue}
                placeholder={creatingType === 'folder' ? 'folder name' : 'file name'}
                onChange={(e) => setCreatingValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateSubmit()
                  if (e.key === 'Escape') handleCreateCancel()
                }}
                onBlur={handleCreateCancel}
                autoFocus
                ref={(el) => {
                  if (el && creatingType !== 'folder') {
                    el.setSelectionRange(0, 0)
                  }
                }}
              />
            </div>
          )}
        </div>
        {contextMenu && (
          <NodeContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextMenu.node === null
              ? buildRootContextMenu()
              : contextMenu.node.type === 'folder'
                ? buildFolderContextMenu(contextMenu.node)
                : buildFileContextMenu(contextMenu.node)
            }
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    </div>
  )
}
