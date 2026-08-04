import { deriveGitRemoteIdentity, type GitRemoteIdentity } from '~shared/git/remote-identity'

import { gitExecFileAsync } from './git/runner'

export async function detectGitRemoteIdentity(repoPath: string): Promise<GitRemoteIdentity | null> {
  try {
    const result = await gitExecFileAsync(['remote', '-v'], { cwd: repoPath })
    return deriveGitRemoteIdentity(result.stdout)
  } catch {
    // Repo creation must not fail because a best-effort remote probe failed.
    return null
  }
}
