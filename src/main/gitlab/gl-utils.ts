import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { gitExecFileAsync, glabExecFileAsync } from '../git/runner'
import { parseGlabApiResponse, type GlabApiResponse } from './glab-api-response'

// Why: legacy generic execFile wrapper - only used by callers that don't need
// WSL-aware routing. Repo-scoped callers should use the runner exports below.
export const execFileAsync = promisify(execFile)
export { glabExecFileAsync, gitExecFileAsync }
export { classifyGlabError, classifyListError } from './glab-error-classification'
export {
  DEFAULT_GITLAB_HOSTS,
  clearKnownHostsCache,
  getGlabKnownHosts,
  getPreferredProjectRef,
  getProjectRef,
  getProjectRefForRemote,
  glabHostnameArgs,
  glabRepoExecOptions,
  parseGlabAuthStatusHosts,
  parseGitLabProjectRef,
  resolveProjectRemote
} from './gitlab-project-ref-resolution'
export type {
  LocalGitExecOptions,
  ProjectRef,
  ResolvedProjectSource
} from './gitlab-project-ref-resolution'
export { parseGlabApiResponse, type GlabApiResponse } from './glab-api-response'

const MAX_CONCURRENT = 4
let running = 0
type QueuedAcquire = {
  grant: () => void
  abort?: () => void
}
const queue: QueuedAcquire[] = []

export function acquire(signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted()
  if (running < MAX_CONCURRENT) {
    running += 1
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const queued: QueuedAcquire = {
      grant: () => {
        if (queued.abort) {
          signal?.removeEventListener('abort', queued.abort)
        }
        running += 1
        resolve()
      }
    }
    queued.abort = () => {
      // Why: an abandoned Spool read must leave the shared glab queue before
      // it can later consume one of the four process lanes.
      const index = queue.indexOf(queued)
      if (index !== -1) {
        queue.splice(index, 1)
      }
      reject(signal?.reason ?? new Error('aborted'))
    }
    queue.push(queued)
    signal?.addEventListener('abort', queued.abort, { once: true })
    if (signal?.aborted) {
      queued.abort()
    }
  })
}

export function release(): void {
  running -= 1
  const next = queue.shift()
  if (next) {
    next.grant()
  }
}

export async function glabApiWithHeaders(
  args: string[],
  options?: { cwd?: string }
): Promise<GlabApiResponse> {
  const { stdout } = await glabExecFileAsync(['api', '-i', ...args], options)
  return parseGlabApiResponse(stdout)
}
