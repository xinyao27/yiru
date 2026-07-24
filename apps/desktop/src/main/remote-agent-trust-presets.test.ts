import { describe, expect, it } from 'vite-plus/test'

import type { IFilesystemProvider } from './providers/types'
import { resolveRemoteCodexProjectTrustRoot } from './remote-codex-trust-root'

function remoteFilesystem(files: Record<string, string>): IFilesystemProvider {
  return {
    readFile: async (filePath) => {
      const content = files[filePath]
      if (content === undefined) {
        throw new Error(`missing ${filePath}`)
      }
      return { content, isBinary: false }
    },
    realpath: async (filePath) => filePath
  } as IFilesystemProvider
}

describe('resolveRemoteCodexProjectTrustRoot', () => {
  it.each([
    {
      label: 'POSIX SSH',
      workspace: '/srv/worktrees/feature',
      repository: '/srv/repo',
      gitDir: '/srv/repo/.git/worktrees/feature',
      workspaceGitFile: '/srv/worktrees/feature/.git',
      gitDirBacklink: '/srv/repo/.git/worktrees/feature/gitdir'
    },
    {
      label: 'Windows SSH',
      workspace: String.raw`C:\worktrees\feature`,
      repository: String.raw`C:\repo`,
      gitDir: String.raw`C:\repo\.git\worktrees\feature`,
      workspaceGitFile: String.raw`C:\worktrees\feature\.git`,
      gitDirBacklink: String.raw`C:\repo\.git\worktrees\feature\gitdir`
    }
  ])('resolves the linked repository root on $label', async (fixture) => {
    const fsProvider = remoteFilesystem({
      [fixture.workspaceGitFile]: `gitdir: ${fixture.gitDir}\n`,
      [fixture.gitDirBacklink]: fixture.workspaceGitFile
    })

    await expect(resolveRemoteCodexProjectTrustRoot(fsProvider, fixture.workspace)).resolves.toBe(
      fixture.repository
    )
  })

  it('keeps SSH trust scoped to the workspace when the backlink does not match', async () => {
    const workspace = '/srv/worktrees/feature'
    const gitDir = '/srv/unrelated/.git/worktrees/feature'
    const fsProvider = remoteFilesystem({
      [`${workspace}/.git`]: `gitdir: ${gitDir}\n`,
      [`${gitDir}/gitdir`]: '/srv/unrelated/.git'
    })

    await expect(resolveRemoteCodexProjectTrustRoot(fsProvider, workspace)).resolves.toBe(workspace)
  })
})
