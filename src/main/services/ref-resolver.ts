import type { CodeSymbol } from './code-parser'

export interface CodeMapping {
  functionName: string
  filePath: string
  startLine: number
  endLine: number
}

/**
 * Extract @ref(name) references from arbitrary text content.
 * Works with Markdown, JSON (mind maps, derivation trees), and plain text.
 */
export function parseRefs(content: string): string[] {
  if (!content) return []

  const refs: string[] = []
  // Match @ref(name) where name can contain letters, digits, dots, underscores, hyphens
  const regex = /@ref\(([a-zA-Z0-9._-]+)\)/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    const name = match[1]
    if (!refs.includes(name)) {
      refs.push(name)
    }
  }

  return refs
}

/**
 * Resolve parsed @ref names to CodeMapping objects using a symbol lookup function.
 */
export function resolveRefs(
  refNames: string[],
  symbols: CodeSymbol[]
): CodeMapping[] {
  const mappings: CodeMapping[] = []
  const matched = new Set<string>()

  for (const refName of refNames) {
    if (matched.has(refName)) continue

    // Try exact match by name
    const match = symbols.find((s) => s.name === refName)

    if (match) {
      matched.add(refName)
      mappings.push({
        functionName: refName,
        filePath: match.filePath,
        startLine: match.startLine,
        endLine: match.endLine
      })
      continue
    }

    // Try Class.method resolution: split by last dot
    const lastDot = refName.lastIndexOf('.')
    if (lastDot > 0) {
      const className = refName.slice(0, lastDot)
      const methodName = refName.slice(lastDot + 1)

      const methodMatch = symbols.find(
        (s) => s.name === methodName && s.parentName === className
      )

      if (methodMatch) {
        matched.add(refName)
        mappings.push({
          functionName: refName,
          filePath: methodMatch.filePath,
          startLine: methodMatch.startLine,
          endLine: methodMatch.endLine
        })
      }
    }
  }

  return mappings
}
