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
 * Extract @ref(...) references from text content and classify each
 * colon-separated segment as filePath, line, or name.
 */
export function parseRefs(content: string): RefSpec[] {
  if (!content) return []

  const refs: RefSpec[] = []
  const seen = new Set<string>()

  // Match @ref(...) — allow / : . digits letters underscores hyphens inside parens
  const regex = /@ref\(([a-zA-Z0-9._/\-:]+)\)/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    const raw = match[1]
    if (seen.has(raw)) continue
    seen.add(raw)

    const spec = classifyRef(raw)
    refs.push(spec)
  }

  return refs
}

function classifyRef(raw: string): RefSpec {
  const parts = raw.split(':')

  let filePath: string | undefined
  let line: number | undefined
  let name: string | undefined

  for (const part of parts) {
    if (part.includes('/')) {
      filePath = part
    } else if (/^\d+$/.test(part)) {
      line = parseInt(part, 10)
    } else {
      name = part
    }
  }

  return { raw, filePath, line, name }
}

/**
 * Resolve RefSpecs to CodeMapping objects using a 5-tier priority.
 * Only matched refs are returned. Unmatched refs are silently dropped.
 *
 * T1: file + line + name  — exact symbol at that line in that file
 * T2: file + line         — any symbol spanning that line in that file
 * T3: file + name         — named symbol in that file (with Class.method support)
 * T4: Class.method        — split by last ".", match across all files
 * T5: name only           — first match across all files
 */
export function resolveRefs(
  refs: RefSpec[],
  symbols: CodeSymbol[]
): CodeMapping[] {
  const mappings: CodeMapping[] = []

  // Build lookup: filePath -> symbols
  const symbolsByFile = new Map<string, CodeSymbol[]>()
  for (const s of symbols) {
    const list = symbolsByFile.get(s.filePath)
    if (list) {
      list.push(s)
    } else {
      symbolsByFile.set(s.filePath, [s])
    }
  }

  for (const ref of refs) {
    // T1: file + line + name
    if (ref.filePath && ref.line !== undefined && ref.name) {
      const fileSymbols = symbolsByFile.get(ref.filePath)
      if (fileSymbols) {
        const match = fileSymbols.find(
          (s) =>
            s.startLine <= ref.line! &&
            s.endLine >= ref.line! &&
            symbolMatchesName(s, ref.name!)
        )
        if (match) {
          mappings.push(toMapping(ref, match))
          continue
        }
      }
    }

    // T2: file + line
    if (ref.filePath && ref.line !== undefined) {
      const fileSymbols = symbolsByFile.get(ref.filePath)
      if (fileSymbols) {
        const match = fileSymbols.find(
          (s) => s.startLine <= ref.line! && s.endLine >= ref.line!
        )
        if (match) {
          mappings.push(toMapping(ref, match))
          continue
        }
      }
    }

    // T3: file + name
    if (ref.filePath && ref.name) {
      const fileSymbols = symbolsByFile.get(ref.filePath)
      if (fileSymbols) {
        const match = findSymbolByName(fileSymbols, ref.name)
        if (match) {
          mappings.push(toMapping(ref, match))
          continue
        }
      }
    }

    // T4: Class.method (name with dot, across all files)
    if (ref.name && ref.name.includes('.')) {
      const match = findSymbolByName(symbols, ref.name)
      if (match) {
        mappings.push(toMapping(ref, match))
        continue
      }
    }

    // T5: name only (first match across all files)
    if (ref.name) {
      const match = symbols.find((s) => s.name === ref.name)
      if (match) {
        mappings.push(toMapping(ref, match))
        continue
      }
    }

    // T6: no match — silently drop
  }

  return mappings
}

/**
 * Check if a symbol matches a ref name, supporting both
 * direct name match and Class.method resolution.
 */
function symbolMatchesName(sym: CodeSymbol, refName: string): boolean {
  if (sym.name === refName) return true

  const lastDot = refName.lastIndexOf('.')
  if (lastDot > 0) {
    const className = refName.slice(0, lastDot)
    const methodName = refName.slice(lastDot + 1)
    return sym.name === methodName && sym.parentName === className
  }

  return false
}

/**
 * Find a symbol by name in a list, trying direct match first,
 * then Class.method resolution.
 */
function findSymbolByName(symbols: CodeSymbol[], refName: string): CodeSymbol | undefined {
  const direct = symbols.find((s) => s.name === refName)
  if (direct) return direct

  const lastDot = refName.lastIndexOf('.')
  if (lastDot > 0) {
    const className = refName.slice(0, lastDot)
    const methodName = refName.slice(lastDot + 1)
    return symbols.find(
      (s) => s.name === methodName && s.parentName === className
    )
  }

  return undefined
}

function toMapping(ref: RefSpec, sym: CodeSymbol): CodeMapping {
  let displayName: string
  if (ref.name && ref.name.includes('.')) {
    displayName = ref.name
  } else {
    displayName = sym.name
  }
  return {
    raw: ref.raw,
    functionName: displayName,
    filePath: sym.filePath,
    startLine: sym.startLine,
    endLine: sym.endLine
  }
}
