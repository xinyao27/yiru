import { gitExecFileAsync } from '../git/runner'

type LocalGitExecOptions = {
  cwd: string
  wslDistro?: string
}

export async function fetchPrHeadTrackingRef(
  repo: { path: string },
  remote: string,
  branch: string,
  options: { localGitExecOptions?: LocalGitExecOptions } = {}
): Promise<void> {
  const ref = `refs/remotes/${remote}/${branch}`
  await gitExecFileAsync(
    ['fetch', remote, `+refs/heads/${branch}:${ref}`],
    options.localGitExecOptions ?? { cwd: repo.path }
  )
}
