import { useEffect, useState, useCallback } from 'react'
import { useAppContext } from '../contexts/AppContext'
import type { CodeFile } from '../types'
import './CodeDirectory.css'

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
  onSelect
}: {
  file: RepoFileNode
  depth: number
  onSelect: (file: RepoFileNode) => void
}) {
  const [expanded, setExpanded] = useState(depth < 1)
  const icon = file.isDirectory ? (expanded ? '▾' : '▸') : getFileIcon(file.name)

  const handleClick = useCallback(() => {
    if (file.isDirectory) {
      setExpanded(!expanded)
    } else {
      onSelect(file)
    }
  }, [file, expanded, onSelect])

  return (
    <>
      <div
        className={`code-file-item ${file.isDirectory ? 'folder' : ''}`}
        style={{ '--depth': depth } as React.CSSProperties}
        onClick={handleClick}
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
  const [repoFiles, setRepoFiles] = useState<RepoFileNode[]>([])
  const [filter, setFilter] = useState<string>('all')
  const [loading, setLoading] = useState(false)

  const fileTypes = ['all', '.ts', '.tsx', '.js', '.py', '.rs', '.go', '.cpp', '.md', '.json']

  useEffect(() => {
    async function loadRepo() {
      if (!state.codeRepoPath) {
        setRepoFiles([])
        return
      }
      setLoading(true)
      try {
        const files = await window.electronAPI.listRepoFiles(state.codeRepoPath)
        setRepoFiles(files)
      } catch {
        setRepoFiles([])
      } finally {
        setLoading(false)
      }
    }
    loadRepo()
  }, [state.codeRepoPath])

  const handleFileSelect = useCallback(async (file: RepoFileNode) => {
    if (file.isDirectory) return

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
      language: langMap[ext] || 'plaintext'
    }

    dispatch({ type: 'OPEN_CODE_FILE', file: codeFile })
  }, [dispatch])

  const filteredFiles = filter === 'all'
    ? repoFiles
    : repoFiles.filter((f) => f.isDirectory || f.name.endsWith(filter))

  const tree = buildTree(filteredFiles)

  return (
    <div className="panel panel-code-directory">
      <div className="panel-header">Code</div>
      <div className="code-directory">
        {state.codeRepoPath ? (
          <>
            <div className="code-directory-toolbar">
              <span className="code-repo-path" title={state.codeRepoPath}>{state.codeRepoPath}</span>
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
      </div>
    </div>
  )
}
