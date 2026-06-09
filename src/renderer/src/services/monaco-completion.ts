import * as monaco from 'monaco-editor'

export function registerRefCompletionProvider(): monaco.IDisposable {
  // Cache codeRepos for repo prefix detection in completions
  let codeRepos: Array<{ path: string }> = []
  window.electronAPI.loadConfig().then((cfg) => {
    codeRepos = cfg?.codeRepos || []
  }).catch(() => {})

  return monaco.languages.registerCompletionItemProvider('markdown', {
    triggerCharacters: ['('],

    async provideCompletionItems(model, position) {
      const lineContent = model.getLineContent(position.lineNumber)
      const textBeforeCursor = lineContent.substring(0, position.column - 1)

      const refMatch = textBeforeCursor.match(/@ref\(([a-zA-Z0-9._/\-:#]*)$/)
      if (!refMatch) return { suggestions: [] }

      const partialName = refMatch[1] || ''

      try {
        const symbols = await window.electronAPI.querySymbols(
          partialName || undefined,
          undefined,
          undefined
        )

        // Convert absolute paths to project-relative paths
        const projectPath = await window.electronAPI.getProjectPath()
        const toRelPath = (absPath: string): string => {
          if (projectPath && absPath.startsWith(projectPath + '/')) {
            return absPath.slice(projectPath.length + 1)
          }
          return absPath
        }

        // Refresh codeRepos in case config changed
        try {
          const cfg = await window.electronAPI.loadConfig()
          codeRepos = cfg?.codeRepos || []
        } catch {}

        const suggestions: monaco.languages.CompletionItem[] = []

        for (const sym of symbols) {
          const relPath = toRelPath(sym.filePath)
          const fileName = relPath.split('/').pop() || relPath
          const displayName = sym.parentName ? `${sym.parentName}.${sym.name}` : sym.name

          // Include repo prefix when the symbol belongs to a configured repo
          let repoPrefix = ''
          let refRelPath = relPath
          for (const repo of codeRepos) {
            const prefix = repo.path.endsWith('/') ? repo.path : repo.path + '/'
            if (sym.filePath.startsWith(prefix)) {
              repoPrefix = (repo.path.split('/').pop() || repo.path) + ':'
              refRelPath = sym.filePath.slice(prefix.length)
              break
            }
          }

          const fullRef = `${repoPrefix}${refRelPath}:${sym.startLine}:${displayName}`

          const detail = sym.parentName
            ? `${sym.kind} · ${sym.parentName} · ${fileName}:${sym.startLine}`
            : `${sym.kind} · ${fileName}:${sym.startLine}`

          suggestions.push({
            label: fullRef,
            kind: mapKind(sym.kind),
            detail,
            insertText: fullRef,
            filterText: displayName,
            range: {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: position.column - partialName.length,
              endColumn: position.column
            },
            sortText: partialName
              ? (sym.name.startsWith(partialName) ? '0' : '1') + sym.name
              : sym.name
          })
        }

        return { suggestions }
      } catch {
        return { suggestions: [] }
      }
    }
  })
}

function mapKind(kind: string): monaco.languages.CompletionItemKind {
  switch (kind) {
    case 'function': return monaco.languages.CompletionItemKind.Function
    case 'method': return monaco.languages.CompletionItemKind.Method
    case 'class': return monaco.languages.CompletionItemKind.Class
    case 'interface': return monaco.languages.CompletionItemKind.Interface
    case 'type': return monaco.languages.CompletionItemKind.Struct
    case 'variable': return monaco.languages.CompletionItemKind.Variable
    case 'enum': return monaco.languages.CompletionItemKind.Enum
    default: return monaco.languages.CompletionItemKind.Text
  }
}
