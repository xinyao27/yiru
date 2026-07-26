import type {
  CoworkingGitDiffOperation,
  CoworkingGitDiffResult,
  CoworkingGitHistoryOperation,
  CoworkingGitHistoryResult,
  CoworkingGitStatusResult
} from '../../shared/coworking/operation-contract'
import {
  COWORKING_GIT_DIFF_MAX_BYTES,
  COWORKING_GIT_HISTORY_DEFAULT_LIMIT,
  COWORKING_GIT_HISTORY_MAX_LIMIT
} from '../../shared/coworking/operation-contract'
import { CoworkingExecutionError } from './execution-error'
import type { CoworkingGitCommitReferences } from './git-commit-references'
import {
  parseCoworkingGitHistory,
  projectCoworkingGitHistory,
  projectCoworkingGitStatus
} from './git-read-projection'
import { normalizeCoworkingRelativePath } from './worktree-containment'
import type { CoworkingPublicWorktreeInstance } from './worktree-publication-state'

const GIT_READ_TIMEOUT_MS = 10_000
const GIT_STATUS_MAX_BYTES = 2 * 1_024 * 1_024
const GIT_HISTORY_MAX_BYTES = 2 * 1_024 * 1_024
const HISTORY_FORMAT = '%H%n%aN%n%at%n%P%n%B'

export type CoworkingGitReadCommand = {
  args: readonly string[]
  env: Readonly<Record<string, string>>
  timeoutMs: number
  maxOutputBytes: number
  signal: AbortSignal
}

export type CoworkingGitReadCommandResult = {
  stdout: string
  outputTruncated?: boolean
}

export type CoworkingGitReadCommandHost = {
  runReadCommand(
    target: CoworkingPublicWorktreeInstance,
    command: CoworkingGitReadCommand
  ): Promise<CoworkingGitReadCommandResult>
}

export class CoworkingGitReadProfile {
  constructor(
    private readonly host: CoworkingGitReadCommandHost,
    private readonly commitReferences: CoworkingGitCommitReferences
  ) {}

  async status(
    target: CoworkingPublicWorktreeInstance,
    signal: AbortSignal
  ): Promise<CoworkingGitStatusResult> {
    const result = await this.run(
      target,
      [
        ...baseArgs(),
        '-c',
        'core.quotePath=false',
        'status',
        '--porcelain=v2',
        '--branch',
        '--untracked-files=all',
        '--ignore-submodules=all'
      ],
      GIT_STATUS_MAX_BYTES,
      signal
    )
    return projectCoworkingGitStatus(result.stdout, result.outputTruncated === true)
  }

  async history(
    connectionId: string,
    target: CoworkingPublicWorktreeInstance,
    operation: CoworkingGitHistoryOperation,
    signal: AbortSignal
  ): Promise<CoworkingGitHistoryResult> {
    const limit = boundedHistoryLimit(operation.limit)
    const result = await this.run(
      target,
      [
        ...baseArgs(),
        'log',
        '--no-decorate',
        '--no-show-signature',
        '--topo-order',
        '-z',
        `--format=${HISTORY_FORMAT}`,
        `-n${limit + 1}`,
        'HEAD'
      ],
      GIT_HISTORY_MAX_BYTES,
      signal
    )
    if (result.outputTruncated) {
      throw new CoworkingExecutionError('result_too_large')
    }
    const parsed = parseCoworkingGitHistory(result.stdout)
    const visible = parsed.slice(0, limit)
    const references = this.commitReferences.remember(
      connectionId,
      target,
      visible.map((entry) => entry.oid)
    )
    return {
      entries: projectCoworkingGitHistory(visible, references),
      hasMore: parsed.length > limit
    }
  }

  async diff(
    connectionId: string,
    target: CoworkingPublicWorktreeInstance,
    operation: CoworkingGitDiffOperation,
    signal: AbortSignal
  ): Promise<CoworkingGitDiffResult> {
    const relativePath = operation.relativePath
      ? normalizeCoworkingRelativePath(operation.relativePath)
      : null
    const commitOid =
      operation.source === 'commit' && operation.commitRef
        ? this.commitReferences.resolve(connectionId, target, operation.commitRef)
        : null
    if (operation.source === 'commit' && !commitOid) {
      throw new CoworkingExecutionError(
        operation.commitRef ? 'resource_not_found' : 'invalid_argument'
      )
    }
    if (commitOid) {
      await this.requireCurrentHeadAncestor(target, commitOid, signal)
    }
    const args = this.diffArgs(operation, relativePath, commitOid)
    const result = await this.run(target, args, COWORKING_GIT_DIFF_MAX_BYTES, signal)
    return {
      source: operation.source,
      relativePath,
      patch: result.stdout,
      truncated: result.outputTruncated === true
    }
  }

  closeConnection(connectionId: string): void {
    this.commitReferences.closeConnection(connectionId)
  }

  private diffArgs(
    operation: CoworkingGitDiffOperation,
    relativePath: string | null,
    commitOid: string | null
  ): readonly string[] {
    const pathspec = relativePath ? ['--', relativePath] : []
    const safeDiffFlags = ['--no-ext-diff', '--no-textconv', '--no-renames']
    if (operation.source === 'working-tree') {
      if (operation.commitRef !== undefined) {
        throw new CoworkingExecutionError('invalid_argument')
      }
      return [...baseArgs(), 'diff', ...safeDiffFlags, ...pathspec]
    }
    if (operation.source === 'index') {
      if (operation.commitRef !== undefined) {
        throw new CoworkingExecutionError('invalid_argument')
      }
      return [...baseArgs(), 'diff', '--cached', ...safeDiffFlags, ...pathspec]
    }
    if (!operation.commitRef || !commitOid) {
      throw new CoworkingExecutionError('invalid_argument')
    }
    // Why: only an OID previously issued from this connection's HEAD ancestry reaches Git.
    return [...baseArgs(), 'show', '--format=', ...safeDiffFlags, commitOid, ...pathspec]
  }

  private async requireCurrentHeadAncestor(
    target: CoworkingPublicWorktreeInstance,
    commitOid: string,
    signal: AbortSignal
  ): Promise<void> {
    try {
      await this.run(
        target,
        [...baseArgs(), 'merge-base', '--is-ancestor', commitOid, 'HEAD'],
        1_024,
        signal
      )
    } catch {
      // Why: an old opaque ref must not become a doorway into a different current branch.
      throw new CoworkingExecutionError('resource_not_found')
    }
  }

  private async run(
    target: CoworkingPublicWorktreeInstance,
    args: readonly string[],
    maxOutputBytes: number,
    signal: AbortSignal
  ): Promise<CoworkingGitReadCommandResult> {
    const result = await this.host.runReadCommand(target, {
      args,
      env: {
        GIT_OPTIONAL_LOCKS: '0',
        GIT_TERMINAL_PROMPT: '0',
        GIT_PAGER: 'cat',
        PAGER: 'cat',
        LC_ALL: 'C'
      },
      timeoutMs: GIT_READ_TIMEOUT_MS,
      maxOutputBytes,
      signal
    })
    if (Buffer.byteLength(result.stdout, 'utf8') > maxOutputBytes) {
      throw new CoworkingExecutionError('result_too_large')
    }
    return result
  }
}

function baseArgs(): readonly string[] {
  // Why: all options are available in Git 2.25 and precede the subcommand for wrapper compatibility.
  return ['--no-pager', '-c', 'core.fsmonitor=false']
}

function boundedHistoryLimit(value: number | undefined): number {
  if (value === undefined) {
    return COWORKING_GIT_HISTORY_DEFAULT_LIMIT
  }
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new CoworkingExecutionError('invalid_argument')
  }
  return Math.min(COWORKING_GIT_HISTORY_MAX_LIMIT, value)
}
