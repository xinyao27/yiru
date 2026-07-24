import { posix, win32 } from 'node:path'

import { isWindowsAbsolutePathLike } from '@yiru/workbench-model/platform'

import type { IFilesystemProvider } from './providers/types'

function getRemotePathApi(remotePath: string): typeof posix {
  return isWindowsAbsolutePathLike(remotePath) ? win32 : posix
}

async function canonicalizeRemotePath(
  fsProvider: IFilesystemProvider,
  remotePath: string
): Promise<string> {
  try {
    return await fsProvider.realpath(remotePath)
  } catch {
    return remotePath
  }
}

async function readRemoteTextFile(
  fsProvider: IFilesystemProvider,
  filePath: string
): Promise<string> {
  try {
    const result = await fsProvider.readFile(filePath)
    return result.isBinary ? '' : result.content
  } catch {
    return ''
  }
}

function remotePathsEqual(left: string, right: string, pathApi: typeof posix): boolean {
  return pathApi === win32 ? left.toLowerCase() === right.toLowerCase() : left === right
}

export async function resolveRemoteCodexProjectTrustRoot(
  fsProvider: IFilesystemProvider,
  workspacePath: string
): Promise<string> {
  const absPath = await canonicalizeRemotePath(fsProvider, workspacePath)
  const pathApi = getRemotePathApi(absPath)
  try {
    const workspaceGitFile = pathApi.join(absPath, '.git')
    const gitDirReference = (await readRemoteTextFile(fsProvider, workspaceGitFile)).trim()
    if (!gitDirReference.startsWith('gitdir:')) {
      return absPath
    }
    const gitDirPath = gitDirReference.slice('gitdir:'.length).trim()
    if (!gitDirPath) {
      return absPath
    }
    const gitDir = pathApi.resolve(absPath, gitDirPath)
    const worktreesDir = pathApi.dirname(gitDir)
    const worktreesName = pathApi.basename(worktreesDir)
    if ((pathApi === win32 ? worktreesName.toLowerCase() : worktreesName) !== 'worktrees') {
      return absPath
    }
    const commonGitDir = pathApi.dirname(worktreesDir)
    const commonGitDirName = pathApi.basename(commonGitDir)
    if ((pathApi === win32 ? commonGitDirName.toLowerCase() : commonGitDirName) !== '.git') {
      // Why: a bare <repo>/worktrees/<name> path must not be mistaken for the
      // linked-worktree layout and expand remote trust to the repo's parent.
      return absPath
    }
    const gitDirBacklink = (
      await readRemoteTextFile(fsProvider, pathApi.join(gitDir, 'gitdir'))
    ).trim()
    if (!gitDirBacklink) {
      return absPath
    }
    const resolvedBacklink = pathApi.resolve(gitDir, gitDirBacklink)
    const [canonicalBacklink, canonicalWorkspaceGitFile] = await Promise.all([
      canonicalizeRemotePath(fsProvider, resolvedBacklink),
      canonicalizeRemotePath(fsProvider, workspaceGitFile)
    ])
    if (!remotePathsEqual(canonicalBacklink, canonicalWorkspaceGitFile, pathApi)) {
      return absPath
    }
    // Why: only a reciprocal `.git/worktrees/<name>` link may broaden remote
    // Codex trust from the checkout to its repository root.
    return canonicalizeRemotePath(fsProvider, pathApi.dirname(commonGitDir))
  } catch {
    return absPath
  }
}
