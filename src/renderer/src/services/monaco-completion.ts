import * as monaco from 'monaco-editor'

export function registerRefCompletionProvider(): monaco.IDisposable {
  return monaco.languages.registerCompletionItemProvider('markdown', {
    triggerCharacters: ['('],

    async provideCompletionItems(model, position) {
      const lineContent = model.getLineContent(position.lineNumber)
      const textBeforeCursor = lineContent.substring(0, position.column - 1)

      const refMatch = textBeforeCursor.match(/@ref\(([a-zA-Z0-9._/\-:]*)$/)
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

        // Detect names that appear in multiple files
        const nameFileCount = new Map<string, number>()
        for (const sym of symbols) {
          nameFileCount.set(sym.name, (nameFileCount.get(sym.name) || 0) + 1)
        }
        const duplicateNames = new Set(
          [...nameFileCount.entries()]
            .filter(([, count]) => count > 1)
            .map(([name]) => name)
        )

        const suggestions: monaco.languages.CompletionItem[] = []

        for (const sym of symbols) {
          const relPath = toRelPath(sym.filePath)
          const fileName = relPath.split('/').pop() || relPath

          if (duplicateNames.has(sym.name)) {
            suggestions.push({
              label: `${relPath}:${sym.name}`,
              kind: mapKind(sym.kind),
              detail: `${sym.kind} · ${fileName}:${sym.startLine}`,
              insertText: `${relPath}:${sym.name}`,
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

          suggestions.push({
            label: sym.name,
            kind: mapKind(sym.kind),
            detail: `${sym.kind} · ${fileName}:${sym.startLine}`,
            insertText: sym.name,
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
