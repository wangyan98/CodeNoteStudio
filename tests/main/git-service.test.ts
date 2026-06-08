// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { writeTextFile } from '../../src/main/services/file-system'
import { getCommitInfo, getFileBlame, getRecentCommits, getRemoteUrl } from '../../src/main/services/git-service'

describe('git-service', () => {
  let testDir: string

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'cns-git-'))
    execSync('git init', { cwd: testDir })
    execSync('git config user.email "test@test.com"', { cwd: testDir })
    execSync('git config user.name "Test"', { cwd: testDir })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe('getCommitInfo', () => {
    it('returns commit info for a git repo', async () => {
      await writeTextFile(join(testDir, 'test.txt'), 'hello')
      execSync('git add test.txt', { cwd: testDir })
      execSync('git commit -m "initial commit"', { cwd: testDir })

      const info = await getCommitInfo(testDir)
      expect(info.sha).toBeTruthy()
      expect(info.sha).toHaveLength(40)
      expect(info.message).toBe('initial commit')
      expect(info.author).toBe('Test')
    })

    it('returns stub for non-git directory', async () => {
      const nonGitDir = mkdtempSync(join(tmpdir(), 'cns-nogit-'))
      const info = await getCommitInfo(nonGitDir)
      expect(info.sha).toBe('not available')
      rmSync(nonGitDir, { recursive: true, force: true })
    })
  })

  describe('getRecentCommits', () => {
    it('returns recent commit messages', async () => {
      await writeTextFile(join(testDir, 'test.txt'), 'v1')
      execSync('git add test.txt', { cwd: testDir })
      execSync('git commit -m "first"', { cwd: testDir })

      await writeTextFile(join(testDir, 'test.txt'), 'v2')
      execSync('git add test.txt', { cwd: testDir })
      execSync('git commit -m "second"', { cwd: testDir })

      const commits = await getRecentCommits(testDir, 5)
      expect(commits).toHaveLength(2)
      expect(commits[0].message).toBe('second')
      expect(commits[1].message).toBe('first')
    })
  })

  describe('getFileBlame', () => {
    it('returns blame info for a tracked file', async () => {
      await writeTextFile(join(testDir, 'blame.ts'), 'line1')
      execSync('git add blame.ts', { cwd: testDir })
      execSync('git commit -m "add blame"', { cwd: testDir })

      const blame = await getFileBlame(testDir, 'blame.ts')
      expect(blame).toHaveLength(1)
      expect(blame[0].line).toBe(1)
      expect(blame[0].commit).toBeTruthy()
    })
  })

  describe('getRemoteUrl', () => {
    it('returns null for repo without remote', async () => {
      const url = await getRemoteUrl(testDir)
      expect(url).toBeNull()
    })

    it('returns remote url after git remote add', async () => {
      execSync('git remote add origin https://github.com/user/repo.git', { cwd: testDir })
      const url = await getRemoteUrl(testDir)
      expect(url).toBe('https://github.com/user/repo')
    })

    it('returns null for non-git directory', async () => {
      const nonGitDir = mkdtempSync(join(tmpdir(), 'cns-nogit-'))
      const url = await getRemoteUrl(nonGitDir)
      expect(url).toBeNull()
      rmSync(nonGitDir, { recursive: true, force: true })
    })
  })
})
