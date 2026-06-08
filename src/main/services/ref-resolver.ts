import type { CodeSymbol } from './code-parser'
import { readTextFile } from './file-system'
import path from 'node:path'

const CONTEXT_LINES = 10

export interface RefSpec {
  raw: string          // original text inside @ref(...)
  repo?: string        // repo name prefix (first segment if not digits and not a path)
  filePath?: string    // classified file segment (contains '/')
  line?: number        // classified line segment (pure digits)
  name?: string        // classified name segment (may include '.' for Class.method)
}

export interface CodeSnippet {
  lines: string[]
  startLine: number
  highlightLine: number
}

export interface CodeMapping {
  raw: string
  functionName: string
  filePath: string
  startLine: number
  endLine: number
  codeSnippet?: CodeSnippet
}

/**
 * Extract @ref(...) references from text content and classify each
 * colon-separated segment as filePath, line, or name.
 */
export function parseRefs(content: string): RefSpec[] {
  if (!content) return []

  const refs: RefSpec[] = []
  const seen = new Set<string>()

  // Match @ref(...) — allow / # : . digits letters underscores hyphens inside parens
  const regex = /@ref\(([a-zA-Z0-9._/\-:#]+)\)/g
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
  // Support new '#' separator (mermaid-safe) and legacy ':' separator
  const sep = raw.includes('#') ? '#' : ':'

  // When using ':' separator, protect '::' (C++ namespace) from being split.
  // Replace '::' with a placeholder, split, then restore.
  let sanitized = raw
  if (sep === ':') {
    sanitized = raw.replace(/::/g, '\x00DC\x00')
  }
  const parts = sanitized.split(sep).map(p => p.replace(/\x00DC\x00/g, '::'))

  let repo: string | undefined
  let filePath: string | undefined
  let line: number | undefined
  let name: string | undefined

  // First segment is a repo if it's not all-digits and doesn't contain '/'
  let startIndex = 0
  if (parts.length > 1 && parts[0].length > 0 && !parts[0].includes('/') && !/^\d+$/.test(parts[0])) {
    repo = parts[0]
    startIndex = 1
  }

  for (let i = startIndex; i < parts.length; i++) {
    const part = parts[i]
    if (part.includes('/')) {
      filePath = part
    } else if (/^\d+$/.test(part)) {
      line = parseInt(part, 10)
    } else if (part.length > 0) {
      name = part
    }
  }

  return { raw, repo, filePath, line, name }
}

async function extractCodeSnippet(
  filePath: string,
  targetLine: number
): Promise<CodeSnippet | undefined> {
  try {
    const content = await readTextFile(filePath)
    const allLines = content.split('\n')
    const start = Math.max(1, targetLine - CONTEXT_LINES)
    const end = Math.min(allLines.length, targetLine + CONTEXT_LINES)
    const lines = allLines.slice(start - 1, end)
    return { lines, startLine: start, highlightLine: targetLine }
  } catch {
    return undefined
  }
}

function getRepoPath(
  symbols: (CodeSymbol & { repoPath?: string })[],
  allSymbols: (CodeSymbol & { repoPath?: string })[],
  targetRepo?: string,
  activeRepo?: string,
  codeRepos?: { path: string }[]
): string | undefined {
  if (targetRepo) {
    const match = symbols.find(
      (s) => s.repoPath && (s.repoPath.endsWith('/' + targetRepo) || s.repoPath === targetRepo)
    )
    if (match?.repoPath) return match.repoPath
    // Fallback: search all symbols (unfiltered) for the target repo
    const globalMatch = allSymbols.find(
      (s) => s.repoPath && (s.repoPath.endsWith('/' + targetRepo) || s.repoPath === targetRepo)
    )
    if (globalMatch?.repoPath) return globalMatch.repoPath
    // Fallback: look up repo path from notebook config (match by basename)
    if (codeRepos) {
      const cfgRepo = codeRepos.find((r) => path.basename(r.path) === targetRepo)
      if (cfgRepo) return cfgRepo.path
    }
    return undefined
  }
  const any = allSymbols.find((s) => s.repoPath)
  if (any?.repoPath) return any.repoPath
  return activeRepo
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
export async function resolveRefs(
  refs: RefSpec[],
  symbols: (CodeSymbol & { repoPath?: string })[],
  activeRepo?: string,
  codeRepos?: { path: string }[]
): Promise<CodeMapping[]> {
  const mappings: CodeMapping[] = []

  for (const ref of refs) {
    const targetRepo = ref.repo ?? activeRepo ?? undefined

    let candidateSymbols = symbols
    if (targetRepo) {
      candidateSymbols = symbols.filter(
        (s) => s.repoPath && (
          s.repoPath.endsWith('/' + targetRepo) ||
          s.repoPath === targetRepo
        )
      )
    }

    // Build file lookup from filtered candidates
    const symbolsByFile = new Map<string, CodeSymbol[]>()
    for (const s of candidateSymbols) {
      const list = symbolsByFile.get(s.filePath)
      if (list) { list.push(s) }
      else { symbolsByFile.set(s.filePath, [s]) }
    }

    const getFileSymbols = (refPath: string): CodeSymbol[] | undefined => {
      const direct = symbolsByFile.get(refPath)
      if (direct) return direct
      for (const [absPath, syms] of symbolsByFile) {
        if (absPath.endsWith('/' + refPath) || absPath === refPath) {
          return syms
        }
      }
      return undefined
    }

    // T1: file + line + name
    if (ref.filePath && ref.line !== undefined && ref.name) {
      const fileSymbols = getFileSymbols(ref.filePath)
      if (fileSymbols) {
        const match = fileSymbols.find(
          (s) => s.startLine <= ref.line! && s.endLine >= ref.line! && symbolMatchesName(s, ref.name!)
        )
        if (match) {
          const mapping = toMapping(ref, match)
          if (mapping.filePath && mapping.startLine) {
            mapping.codeSnippet = await extractCodeSnippet(mapping.filePath, mapping.startLine)
          }
          mappings.push(mapping)
          continue
        }
      }
    }

    // T2: file + line
    if (ref.filePath && ref.line !== undefined) {
      const fileSymbols = getFileSymbols(ref.filePath)
      if (fileSymbols) {
        const match = fileSymbols.find((s) => s.startLine <= ref.line! && s.endLine >= ref.line!)
        if (match) {
          const mapping = toMapping(ref, match)
          if (mapping.filePath && mapping.startLine) {
            mapping.codeSnippet = await extractCodeSnippet(mapping.filePath, mapping.startLine)
          }
          mappings.push(mapping)
          continue
        }
        // Fallback A: file found in index but no symbol spans this line.
        // Still allow navigation to file:line.
        const absPath = fileSymbols[0]?.filePath
        if (absPath) {
          const mapping: CodeMapping = {
            raw: ref.raw,
            functionName: ref.name ?? `line ${ref.line}`,
            filePath: absPath,
            startLine: ref.line,
            endLine: ref.line,
          }
          mapping.codeSnippet = await extractCodeSnippet(absPath, ref.line)
          mappings.push(mapping)
          continue
        }
      }
      // Fallback B: file not in symbol index. Construct path from repo root.
      const repoPath = getRepoPath(candidateSymbols, symbols, targetRepo, activeRepo, codeRepos)
      if (repoPath) {
        const absPath = repoPath + '/' + ref.filePath
        const mapping: CodeMapping = {
          raw: ref.raw,
          functionName: ref.name ?? `line ${ref.line}`,
          filePath: absPath,
          startLine: ref.line,
          endLine: ref.line,
        }
        mapping.codeSnippet = await extractCodeSnippet(absPath, ref.line)
        mappings.push(mapping)
        continue
      }
    }

    // T3: file + name
    if (ref.filePath && ref.name) {
      const fileSymbols = getFileSymbols(ref.filePath)
      if (fileSymbols) {
        const match = findSymbolByName(fileSymbols, ref.name)
        if (match) {
          const mapping = toMapping(ref, match)
          if (mapping.filePath && mapping.startLine) {
            mapping.codeSnippet = await extractCodeSnippet(mapping.filePath, mapping.startLine)
          }
          mappings.push(mapping)
          continue
        }
        // Fallback: file found but symbol not matched. Navigate to file start.
        const absPath = fileSymbols[0]?.filePath
        if (absPath) {
          mappings.push({
            raw: ref.raw,
            functionName: ref.name,
            filePath: absPath,
            startLine: 1,
            endLine: 1,
          })
          continue
        }
      }
      // Fallback: file not in index. Construct path from repo root.
      const repoPath = getRepoPath(candidateSymbols, symbols, targetRepo, activeRepo, codeRepos)
      if (repoPath) {
        mappings.push({
          raw: ref.raw,
          functionName: ref.name,
          filePath: repoPath + '/' + ref.filePath,
          startLine: 1,
          endLine: 1,
        })
        continue
      }
    }

    // T4: Class.method (across candidate files)
    if (ref.name && ref.name.includes('.')) {
      const match = findSymbolByName(candidateSymbols, ref.name)
      if (match) {
        const mapping = toMapping(ref, match)
        if (mapping.filePath && mapping.startLine) {
          mapping.codeSnippet = await extractCodeSnippet(mapping.filePath, mapping.startLine)
        }
        mappings.push(mapping)
        continue
      }
    }

    // T5: name only (across candidate files)
    if (ref.name) {
      const match = candidateSymbols.find((s) => s.name === ref.name)
      if (match) {
        const mapping = toMapping(ref, match)
        if (mapping.filePath && mapping.startLine) {
          mapping.codeSnippet = await extractCodeSnippet(mapping.filePath, mapping.startLine)
        }
        mappings.push(mapping)
        continue
      }
    }

    // No match — silently drop
  }

  return mappings
}

/**
 * Check if a symbol matches a ref name, supporting both
 * direct name match and Class.method resolution.
 */
function symbolMatchesName(sym: CodeSymbol, refName: string): boolean {
  if (sym.name === refName) return true

  const { parentSep, parentIdx } = findLastNameSeparator(refName)
  if (parentIdx > 0) {
    const className = refName.slice(0, parentIdx)
    const methodName = refName.slice(parentIdx + parentSep.length)
    return sym.name === methodName && sym.parentName === className
  }

  return false
}

/**
 * Find a symbol by name in a list, trying direct match first,
 * then Class.method resolution.
 */
function findLastNameSeparator(refName: string): { parentSep: string; parentIdx: number } {
  const lastDoubleColon = refName.lastIndexOf('::')
  const lastDot = refName.lastIndexOf('.')

  if (lastDoubleColon > lastDot) {
    return { parentSep: '::', parentIdx: lastDoubleColon }
  }
  return { parentSep: '.', parentIdx: lastDot }
}

function findSymbolByName(symbols: CodeSymbol[], refName: string): CodeSymbol | undefined {
  const direct = symbols.find((s) => s.name === refName)
  if (direct) return direct

  const { parentSep, parentIdx } = findLastNameSeparator(refName)
  if (parentIdx > 0) {
    const className = refName.slice(0, parentIdx)
    const methodName = refName.slice(parentIdx + parentSep.length)
    return symbols.find(
      (s) => s.name === methodName && s.parentName === className
    )
  }

  return undefined
}

function toMapping(ref: RefSpec, sym: CodeSymbol): CodeMapping {
  let displayName: string
  if (ref.name && (ref.name.includes('.') || ref.name.includes('::'))) {
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
