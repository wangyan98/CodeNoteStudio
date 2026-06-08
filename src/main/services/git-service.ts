import { simpleGit, type SimpleGit } from 'simple-git'
import fs from 'node:fs'
import path from 'node:path'

export interface CommitInfo {
  sha: string
  message: string
  author: string
  date: string
}

export interface CommitEntry {
  sha: string
  message: string
  author: string
  date: string
}

export interface BlameLine {
  line: number
  commit: string
  author: string
  date: string
  summary: string
}

function isGitRepo(repoPath: string): boolean {
  try {
    return fs.existsSync(path.join(repoPath, '.git'))
  } catch {
    return false
  }
}

function getGit(repoPath: string): SimpleGit | null {
  if (!isGitRepo(repoPath)) return null
  return simpleGit(repoPath)
}

export async function getRemoteUrl(repoPath: string): Promise<string | null> {
  const git = getGit(repoPath)
  if (!git) return null

  try {
    const remotes = await git.getRemotes(true)
    const origin = remotes.find((r) => r.name === 'origin')
    if (!origin) return null
    // Strip trailing .git for cleaner display
    return origin.refs.fetch.replace(/\.git$/, '')
  } catch {
    return null
  }
}

export async function getCommitInfo(repoPath: string): Promise<CommitInfo> {
  const git = getGit(repoPath)
  if (!git) {
    return { sha: 'not available', message: '', author: '', date: '' }
  }

  try {
    const log = await git.log({ maxCount: 1 })
    if (!log.latest) {
      return { sha: 'not available', message: '', author: '', date: '' }
    }
    return {
      sha: log.latest.hash,
      message: log.latest.message,
      author: log.latest.author_name,
      date: log.latest.date
    }
  } catch {
    return { sha: 'not available', message: '', author: '', date: '' }
  }
}

export async function getRecentCommits(
  repoPath: string,
  maxCount = 10
): Promise<CommitEntry[]> {
  const git = getGit(repoPath)
  if (!git) return []

  try {
    const log = await git.log({ maxCount })
    return log.all.map((entry) => ({
      sha: entry.hash,
      message: entry.message,
      author: entry.author_name,
      date: entry.date
    }))
  } catch {
    return []
  }
}

export async function getFileBlame(
  repoPath: string,
  filePath: string
): Promise<BlameLine[]> {
  const git = getGit(repoPath)
  if (!git) return []

  try {
    const result = await git.raw('blame', '--line-porcelain', filePath)
    return parseBlameOutput(result)
  } catch {
    return []
  }
}

function parseBlameOutput(output: string): BlameLine[] {
  const lines: BlameLine[] = []
  const entries = output.split('\n')

  let current: Partial<BlameLine> = {}
  let lineNum = 0

  for (const entry of entries) {
    if (/^[0-9a-f]{40} \d+ \d+/.test(entry)) {
      if (current.commit && current.line) {
        lines.push(current as BlameLine)
      }
      const parts = entry.split(' ')
      current = { commit: parts[0] }
      lineNum = parseInt(parts[2] || '0', 10)
      current.line = lineNum
    } else if (entry.startsWith('author ')) {
      current.author = entry.slice(7)
    } else if (entry.startsWith('author-time ')) {
      current.date = entry.slice(12)
    } else if (entry.startsWith('summary ')) {
      current.summary = entry.slice(8)
    }
  }

  if (current.commit && current.line) {
    lines.push(current as BlameLine)
  }

  return lines
}
