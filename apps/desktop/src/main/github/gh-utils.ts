import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { gitExecFileAsync, ghExecFileAsync, extractExecError } from '../git/runner'

// Why: legacy generic execFile wrapper - only used by callers that don't need
// WSL-aware routing. Repo-scoped callers should use the runner exports below.
export const execFileAsync = promisify(execFile)
export { ghExecFileAsync, gitExecFileAsync, extractExecError }
export { classifyGhError } from './gh-error-classification'
export {
  getIssueOwnerRepo,
  getOwnerRepo,
  getOwnerRepoForRemote,
  getRemoteUrlForRepo,
  ghRepoExecOptions,
  githubRepoContext,
  parseGitHubOwnerRepo,
  parseGitHubRemoteIdentity,
  resolvePRRepositoryCandidates
} from './github-repository-identity'
export type {
  GitHubRemoteIdentity,
  GitHubRepoContext,
  LocalGitExecOptions,
  OwnerRepo,
  PRRepositoryCandidates
} from './github-repository-identity'

const MAX_CONCURRENT = 4
let running = 0
const queue: (() => void)[] = []

export function acquire(): Promise<void> {
  if (running < MAX_CONCURRENT) {
    running += 1
    return Promise.resolve()
  }
  return new Promise((resolve) =>
    queue.push(() => {
      running += 1
      resolve()
    })
  )
}

export function release(): void {
  running -= 1
  const next = queue.shift()
  if (next) {
    next()
  }
}
