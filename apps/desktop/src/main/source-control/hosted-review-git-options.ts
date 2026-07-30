export type HostedReviewLocalGitOptions = {
  wslDistro?: string
  signal?: AbortSignal
}

export type HostedReviewExecutionOptions = {
  localGitExecOptions?: HostedReviewLocalGitOptions
  signal?: AbortSignal
  sharedLinkPaths?: readonly string[]
}

export function getHostedReviewLocalGitOptions(
  options: HostedReviewExecutionOptions = {}
): HostedReviewLocalGitOptions {
  const wslDistro = options.localGitExecOptions?.wslDistro
  return {
    ...(wslDistro ? { wslDistro } : {}),
    ...(options.signal ? { signal: options.signal } : {})
  }
}

export function hasHostedReviewLocalGitOptions(
  options: HostedReviewExecutionOptions = {}
): boolean {
  return Object.keys(getHostedReviewLocalGitOptions(options)).length > 0
}
