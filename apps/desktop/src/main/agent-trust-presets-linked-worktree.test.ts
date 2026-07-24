import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

import { resolveCodexProjectTrustRoot } from './agent-trust-presets'

describe('resolveCodexProjectTrustRoot', () => {
  it('trusts the repository root for a reciprocally linked worktree', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'yiru-codex-linked-worktree-'))
    const repository = join(fixtureRoot, 'repo')
    const workspace = join(fixtureRoot, 'worktrees', 'feature')
    const worktreeGitDir = join(repository, '.git', 'worktrees', 'feature')
    try {
      mkdirSync(worktreeGitDir, { recursive: true })
      mkdirSync(workspace, { recursive: true })
      writeFileSync(join(workspace, '.git'), `gitdir: ${worktreeGitDir}\n`, 'utf-8')
      writeFileSync(join(worktreeGitDir, 'gitdir'), join(workspace, '.git'), 'utf-8')

      expect(resolveCodexProjectTrustRoot(workspace)).toBe(realpathSync.native(repository))
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })

  it('does not broaden trust when the worktree backlink points elsewhere', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'yiru-codex-untrusted-worktree-'))
    const workspace = join(fixtureRoot, 'workspace')
    const unrelated = join(fixtureRoot, 'unrelated')
    const worktreeGitDir = join(unrelated, '.git', 'worktrees', 'feature')
    try {
      mkdirSync(worktreeGitDir, { recursive: true })
      mkdirSync(workspace, { recursive: true })
      writeFileSync(join(workspace, '.git'), `gitdir: ${worktreeGitDir}\n`, 'utf-8')
      writeFileSync(join(worktreeGitDir, 'gitdir'), join(unrelated, '.git'), 'utf-8')

      expect(resolveCodexProjectTrustRoot(workspace)).toBe(realpathSync.native(workspace))
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })
})
