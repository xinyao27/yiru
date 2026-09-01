import { gitExecFileAsync, ghExecFileAsync, extractExecError } from '../git/runner/runner'

type GitHubCliProcessOptions = {
  cwd?: string
  env?: Record<string, string>
  encoding?: string
  timeout?: number
}

export async function execFileAsync(
  command: string,
  args: string[],
  options: GitHubCliProcessOptions = {}
): Promise<{ stderr: string; stdout: string }> {
  const child = Bun.spawn([command, ...args], {
    ...(options.cwd ? { cwd: options.cwd } : {}),
    env: { ...process.env, ...options.env },
    ...(options.timeout ? { signal: AbortSignal.timeout(options.timeout) } : {}),
    stderr: 'pipe',
    stdout: 'pipe'
  })
  const [exitCode, stderr, stdout] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    new Response(child.stdout).text()
  ])
  if (exitCode !== 0) {
    throw Object.assign(new Error(stderr.trim() || stdout.trim() || `${command} failed`), {
      code: exitCode,
      stderr,
      stdout
    })
  }
  return { stderr, stdout }
}

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
} from './repository-identity'
export type {
  GitHubRemoteIdentity,
  GitHubRepoContext,
  LocalGitExecOptions,
  OwnerRepo,
  PRRepositoryCandidates
} from './repository-identity'

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
