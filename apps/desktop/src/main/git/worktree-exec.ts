import type { GitWorktreeExecOptions } from './worktree-model'

export function gitExecOptions(
  cwd: string,
  options: GitWorktreeExecOptions = {}
): { cwd: string; wslDistro?: string; signal?: AbortSignal; timeout?: number } {
  return {
    cwd,
    ...(options.wslDistro ? { wslDistro: options.wslDistro } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.timeout ? { timeout: options.timeout } : {})
  }
}

export function getErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined
}

export function getErrorText(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const parts: string[] = []
    if ('message' in error && typeof error.message === 'string') {
      parts.push(error.message)
    }
    if ('stderr' in error && typeof error.stderr === 'string') {
      parts.push(error.stderr)
    }
    return parts.join('\n')
  }
  return String(error)
}

export function isNotGitRepositoryError(error: unknown): boolean {
  return /not a git repository/i.test(getErrorText(error))
}

export function isBranchCheckedOutInWorktreeError(error: unknown): boolean {
  return /cannot delete branch .*(?:used by worktree|checked out)|branch .*is checked out/i.test(
    getErrorText(error)
  )
}

export function normalizeLocalBranchRef(branch: string): string {
  return branch.replace(/^refs\/heads\//, '')
}
