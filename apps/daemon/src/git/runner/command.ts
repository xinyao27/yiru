import type { Host } from '../../hosts/contract'
import { createLocalHost } from '../../hosts/local'

const GIT_COMMAND_TIMEOUT_MS = 30_000

export type GitCommandResult = {
  stderr: string
  stdout: string
}

export class GitCommandError extends Error {
  readonly exitCode: number
  readonly stderr: string

  constructor(exitCode: number, stderr: string) {
    super('git_command_failed')
    this.name = 'GitCommandError'
    this.exitCode = exitCode
    this.stderr = stderr
  }
}

export async function runGit(
  cwd: string,
  args: string[],
  timeoutMs = GIT_COMMAND_TIMEOUT_MS,
  host: Host = createLocalHost()
): Promise<GitCommandResult> {
  const result = await host.exec({
    args: ['-C', cwd, ...args],
    command: 'git',
    timeoutMs
  })
  if (result.exitCode !== 0) {
    throw new GitCommandError(result.exitCode, result.stderr.trim())
  }
  return { stderr: result.stderr, stdout: result.stdout }
}
