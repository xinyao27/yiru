import { gitExecFileAsync } from './runner'

type GitExecOptions = {
  wslDistro?: string
}

export async function resolveWorktreeBaseCommitOid(
  repoPath: string,
  qualifiedRef: string,
  options: GitExecOptions = {}
): Promise<string | null> {
  try {
    const { stdout } = await gitExecFileAsync(
      ['rev-parse', '--verify', '--quiet', `${qualifiedRef}^{commit}`],
      {
        cwd: repoPath,
        ...options
      }
    )
    const oid = stdout.trim()
    return oid.length > 0 ? oid : null
  } catch {
    return null
  }
}

export async function hasWorktreeBaseCommitRef(
  repoPath: string,
  qualifiedRef: string,
  options: GitExecOptions = {}
): Promise<boolean> {
  return (await resolveWorktreeBaseCommitOid(repoPath, qualifiedRef, options)) !== null
}
