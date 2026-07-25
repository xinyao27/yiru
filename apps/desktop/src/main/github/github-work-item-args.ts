export type WorkItemArgs = {
  repoPath: string
  repoId?: string | null
  number: number
  type?: 'pr'
}

type RegisteredRepoContext = {
  path: string
  connectionId?: string | null
}

type LocalGitExecOptions = {
  wslDistro?: string
}

// Why: renderer input crosses the IPC boundary and is untrusted. Reject
// malformed numbers and any work-item kind other than a pull request.
export function dispatchWorkItem<T>(
  args: WorkItemArgs,
  repo: RegisteredRepoContext,
  fn: (
    path: string,
    n: number,
    t?: 'pr',
    connectionId?: string | null,
    localGitOptions?: LocalGitExecOptions
  ) => Promise<T | null>,
  localGitOptions?: LocalGitExecOptions
): Promise<T | null> | null {
  const { number, type } = args
  if (
    typeof number !== 'number' ||
    !Number.isInteger(number) ||
    number < 1 ||
    (type !== undefined && type !== 'pr')
  ) {
    return null
  }
  return fn(repo.path, number, 'pr', repo.connectionId ?? null, localGitOptions)
}
