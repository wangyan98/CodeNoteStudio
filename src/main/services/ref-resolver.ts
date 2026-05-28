import type { CodeSymbol } from './code-parser'

export interface RefSpec {
  raw: string          // original text inside @ref(...)
  filePath?: string    // classified file segment (contains '/')
  line?: number        // classified line segment (pure digits)
  name?: string        // classified name segment (may include '.' for Class.method)
}

export interface CodeMapping {
  raw: string
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
 * Resolve parsed @ref names to CodeMapping objects.
 *
 * Three-tier resolution:
 * 1. If a previous mapping exists, match by same file + nearby line range
 * 2. Fall back to exact name match across all symbols
 * 3. Fall back to Class.method resolution (last dot split)
 * 4. If nothing matches, the ref is silently dropped (not rendered)
 */
export function resolveRefs(
  refNames: string[],
  symbols: CodeSymbol[],
  previousMappings: CodeMapping[] = []
): CodeMapping[] {
  const mappings: CodeMapping[] = []
  const matched = new Set<string>()

  // Index previous mappings by ref name
  const prevByName = new Map<string, CodeMapping>()
  for (const pm of previousMappings) {
    if (!prevByName.has(pm.functionName)) {
      prevByName.set(pm.functionName, pm)
    }
  }

  // Build a lookup: filePath -> symbols for efficient file+line matching
  const symbolsByFile = new Map<string, CodeSymbol[]>()
  for (const s of symbols) {
    const list = symbolsByFile.get(s.filePath)
    if (list) {
      list.push(s)
    } else {
      symbolsByFile.set(s.filePath, [s])
    }
  }

  for (const refName of refNames) {
    if (matched.has(refName)) continue

    // Tier 1: try cached file + nearby line
    const prev = prevByName.get(refName)
    if (prev) {
      const fileSymbols = symbolsByFile.get(prev.filePath)
      if (fileSymbols) {
        // Find a symbol with the same name in the same file, within ±20 lines
        const nearby = fileSymbols.find(
          (s) =>
            s.name === refName &&
            Math.abs(s.startLine - prev.startLine) <= 20
        )
        if (nearby) {
          matched.add(refName)
          mappings.push({
            raw: refName,
            functionName: refName,
            filePath: nearby.filePath,
            startLine: nearby.startLine,
            endLine: nearby.endLine
          })
          continue
        }
      }
    }

    // Tier 2: exact name match across all symbols
    const match = symbols.find((s) => s.name === refName)
    if (match) {
      matched.add(refName)
      mappings.push({
        raw: refName,
        functionName: refName,
        filePath: match.filePath,
        startLine: match.startLine,
        endLine: match.endLine
      })
      continue
    }

    // Tier 3: Class.method resolution (split by last dot)
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
          raw: refName,
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
