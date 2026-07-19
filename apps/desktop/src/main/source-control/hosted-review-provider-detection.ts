import { extractExecError, gitExecFileAsync } from '../git/runner'
import { getSshGitProvider } from '../providers/ssh-git-dispatch'
import type { HostedReviewExecutionOptions } from './hosted-review-git-options'

type HostedReviewProviderDetectionContext = HostedReviewExecutionOptions & {
  repoPath: string
  connectionId?: string | null
}

export async function assertHostedReviewProviderDetectionAvailable(
  context: HostedReviewProviderDetectionContext
): Promise<void> {
  try {
    const sshProvider = context.connectionId ? getSshGitProvider(context.connectionId) : null
    if (context.connectionId && !sshProvider) {
      throw new Error('Hosted review SSH provider is unavailable.')
    }
    if (sshProvider) {
      await sshProvider.exec(
        ['remote', 'get-url', 'origin'],
        context.repoPath,
        context.signal ? { signal: context.signal } : undefined
      )
      return
    }
    await gitExecFileAsync(['remote', 'get-url', 'origin'], {
      cwd: context.repoPath,
      ...(context.localGitExecOptions?.wslDistro
        ? { wslDistro: context.localGitExecOptions.wslDistro }
        : {}),
      ...(context.signal ? { signal: context.signal } : {})
    })
  } catch (error) {
    context.signal?.throwIfAborted()
    const output = extractExecError(error)
    if (/no such remote/i.test(`${output.stderr}\n${output.stdout}`)) {
      return
    }
    // Why: an unsupported remote may be empty, but a failed remote probe is
    // not evidence that the branch has no hosted review.
    throw error
  }
}
