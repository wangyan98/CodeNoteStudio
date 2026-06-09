import { useEffect, useState, useCallback } from 'react'
import { useAppContext } from '../contexts/AppContext'
import type { CodeFile } from '../types'
import { NodeContextMenu } from './editors/NodeContextMenu'
import type { MenuEntry } from './editors/NodeContextMenu'
import { setClipboardFile } from '../services/clipboard'
import './CodeDirectory.css'
import './ContextMenu.css'

interface RepoFileNode {
  name: string
  relativePath: string
  absolutePath: string
  isDirectory: boolean
  children?: RepoFileNode[]
}

function FileTreeItem({
  file,
  depth,
  onSelect,
  onContextMenu,
  revealTargetPath
}: {
  file: RepoFileNode
  depth: number
  onSelect: (file: RepoFileNode) => void
  onContextMenu: (e: React.MouseEvent, file: RepoFileNode) => void
  revealTargetPath?: string
}) {
  const [expanded, setExpanded] = useState(depth < 1)

  useEffect(() => {
    if (revealTargetPath && file.isDirectory && revealTargetPath.startsWith(file.absolutePath + '/')) {
      setExpanded(true)
    }
  }, [revealTargetPath, file.isDirectory, file.absolutePath])
  const icon = file.isDirectory ? (expanded ? '▾' : '▸') : getFileIcon(file.name)

  const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'])

  function isImageFileName(name: string): boolean {
    const ext = name.split('.').pop()?.toLowerCase() || ''
    return IMAGE_EXTS.has(ext)
  }

  const handleClick = useCallback(() => {
    if (file.isDirectory) {
      setExpanded(!expanded)
    } else {
      onSelect(file)
    }
  }, [file, expanded, onSelect])

  const handleDragStart = useCallback((e: React.DragEvent) => {
    if (file.isDirectory) return
    const isImage = isImageFileName(file.name)
    e.dataTransfer.effectAllowed = 'copy'
    if (isImage) {
      e.dataTransfer.setData('application/x-image-drag', 'true')
      e.dataTransfer.setData('application/x-source-path', file.absolutePath)
    }
    e.dataTransfer.setData('text/plain', `[${file.name}](${file.relativePath})`)
  }, [file])

  return (
    <>
      <div
        className={`code-file-item ${file.isDirectory ? 'folder' : ''}`}
        style={{ '--depth': depth } as React.CSSProperties}
        onClick={handleClick}
        draggable={!file.isDirectory}
        onDragStart={handleDragStart}
        onContextMenu={(e) => onContextMenu(e, file)}
        data-file-path={file.absolutePath}
      >
        <span className="code-file-icon">{icon}</span>
        <span>{file.name}</span>
      </div>
      {file.isDirectory && expanded && file.children && file.children.map((child) => (
        <FileTreeItem
          key={child.relativePath}
          file={child}
          depth={depth + 1}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
          revealTargetPath={revealTargetPath}
        />
      ))}
    </>
  )
}

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  const icons: Record<string, string> = {
    ts: '🟦', tsx: '⚛', js: '🟨', jsx: '⚛',
    py: '🐍', rs: '🚀', go: '🔵', cpp: '⚙',
    c: '⚙', h: '📋', hpp: '📋',
    md: '📝', json: '📋', yaml: '📋', yml: '📋',
    css: '🎨', scss: '🎨', html: '🌐',
    svg: '🖼', png: '🖼', jpg: '🖼',
    sh: '💻', bash: '💻', zsh: '💻'
  }
  return icons[ext || ''] || '📄'
}

function buildTree(files: RepoFileNode[]): RepoFileNode[] {
  const root: RepoFileNode[] = []
  const dirMap = new Map<string, RepoFileNode>()

  // First pass: collect all directories
  for (const file of files) {
    if (file.isDirectory) {
      dirMap.set(file.relativePath + '/', { ...file, children: [] })
    }
  }

  // Second pass: build tree
  for (const file of files) {
    const parts = file.relativePath.split('/')
    const parentPath = parts.slice(0, -1).join('/') + '/'

    if (parts.length === 1) {
      if (file.isDirectory && dirMap.has(file.relativePath + '/')) {
        root.push(dirMap.get(file.relativePath + '/')!)
      } else {
        root.push(file)
      }
    } else if (dirMap.has(parentPath)) {
      const parent = dirMap.get(parentPath)!
      if (file.isDirectory && dirMap.has(file.relativePath + '/')) {
        parent.children!.push(dirMap.get(file.relativePath + '/')!)
      } else {
        parent.children!.push(file)
      }
    } else {
      root.push(file)
    }
  }

  return root
}

export function CodeDirectory() {
  const { state, dispatch } = useAppContext()
  const { codeRepoPath, codeRepos } = state
  const [repoFiles, setRepoFiles] = useState<RepoFileNode[]>([])
  const [filter, setFilter] = useState<string>('all')
  const [loading, setLoading] = useState(false)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    file: RepoFileNode
  } | null>(null)

  const fileTypes = ['all', '.ts', '.tsx', '.js', '.py', '.rs', '.go', '.cpp', '.md', '.json']

  useEffect(() => {
    async function loadRepo() {
      if (!codeRepoPath) {
        setRepoFiles([])
        return
      }
      setLoading(true)
      try {
        const files = await window.electronAPI.listRepoFiles(codeRepoPath)
        setRepoFiles(files)
      } catch {
        setRepoFiles([])
      } finally {
        setLoading(false)
      }
    }
    loadRepo()
  }, [codeRepoPath])

  useEffect(() => {
    if (!state.revealFilePath || loading) return
    const filePath = state.revealFilePath
    let raf1: number
    let raf2: number
    let timer: ReturnType<typeof setTimeout>
    let cancelled = false

    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (cancelled) return
        const escaped = CSS.escape(filePath)
        const el = document.querySelector(`[data-file-path="${escaped}"]`)
        if (el) {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' })
          el.classList.add('code-file-item-highlight')
          timer = setTimeout(() => el.classList.remove('code-file-item-highlight'), 2000)
        }
        dispatch({ type: 'CLEAR_REVEAL_FILE_IN_TREE' })
      })
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      clearTimeout(timer)
    }
  }, [state.revealFilePath, loading, dispatch])

  const handleFileSelect = useCallback((file: RepoFileNode) => {
    if (file.isDirectory) return

    // Find which repo this file belongs to
    let fileRepoPath: string | undefined
    for (const repo of codeRepos) {
      const repoPrefix = repo.path.endsWith('/') ? repo.path : repo.path + '/'
      if (file.absolutePath.startsWith(repoPrefix)) {
        fileRepoPath = repo.path
        break
      }
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    const langMap: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
      py: 'python', rs: 'rust', go: 'go', cpp: 'cpp', c: 'c',
      css: 'css', html: 'html', json: 'json', md: 'markdown',
      png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
      webp: 'image', bmp: 'image', svg: 'image'
    }

    const codeFile: CodeFile = {
      path: file.absolutePath,
      name: file.name,
      language: langMap[ext] || 'plaintext',
      repoPath: fileRepoPath
    }

    dispatch({ type: 'OPEN_CODE_FILE', file: codeFile })
  }, [dispatch, codeRepos])

  const filteredFiles = filter === 'all'
    ? repoFiles
    : repoFiles.filter((f) => f.isDirectory || f.name.endsWith(filter))

  const tree = buildTree(filteredFiles)

  const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'])

  const isImageFile = (name: string): boolean => {
    const ext = name.split('.').pop()?.toLowerCase() || ''
    return IMAGE_EXTS.has(ext)
  }

  const buildFileContextMenu = useCallback((file: RepoFileNode): MenuEntry[] => {
    const items: MenuEntry[] = [
      {
        label: 'Copy File',
        action: () => { setClipboardFile(file.absolutePath) }
      },
      { separator: true },
      {
        label: 'Copy Relative Path',
        action: () => { navigator.clipboard.writeText(file.relativePath) }
      },
      {
        label: 'Copy Absolute Path',
        action: () => { navigator.clipboard.writeText(file.absolutePath) }
      }
    ]

    if (isImageFile(file.name)) {
      items.push(
        { separator: true },
        {
          label: 'Insert Image into MD',
          action: () => {
            window.dispatchEvent(new CustomEvent('image-insert', {
              detail: { sourcePath: file.absolutePath, fileName: file.name }
            }))
          }
        }
      )
    }

    return items
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent, file: RepoFileNode) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, file })
  }, [])

  return (
    <div className="panel panel-code-directory">
      <div className="panel-header">Code</div>
      <div className="code-directory">
        {codeRepoPath ? (
          <>
            <div className="code-directory-toolbar">
              <span className="code-repo-path" title={codeRepoPath}>{codeRepoPath}</span>
              {fileTypes.map((ft) => (
                <button
                  key={ft}
                  className={`code-file-type-filter ${filter === ft ? 'active' : ''}`}
                  onClick={() => setFilter(ft)}
                >
                  {ft === 'all' ? 'All' : ft}
                </button>
              ))}
            </div>
            <div className="code-file-tree">
              {loading ? (
                <div style={{ padding: 12, color: 'var(--placeholder-color)' }}>Loading...</div>
              ) : (
                tree.map((file) => (
                  <FileTreeItem
                    key={file.relativePath}
                    file={file}
                    depth={0}
                    onSelect={handleFileSelect}
                    onContextMenu={handleContextMenu}
                    revealTargetPath={state.revealFilePath || undefined}
                  />
                ))
              )}
            </div>
          </>
        ) : (
          <div className="code-no-repo">
            <p>No code repository selected.<br/>Use the toolbar to add a repo.</p>
          </div>
        )}
        {contextMenu && (
          <NodeContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={buildFileContextMenu(contextMenu.file)}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    </div>
  )
}
