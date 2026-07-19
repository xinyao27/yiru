import type { SpoolAgentLaunchId } from './spool-agent-launch-contract'

export const SPOOL_FILE_LIST_DEFAULT_LIMIT = 1_000
export const SPOOL_FILE_LIST_MAX_LIMIT = 5_000
export const SPOOL_FILE_LIST_VERIFIED_HOST_PAGE_LIMIT = 256
// Why: owner-only entries are filtered across bounded internal host pages.
export const SPOOL_FILE_LIST_VERIFIED_HOST_MAX_LIMIT = SPOOL_FILE_LIST_MAX_LIMIT + 256
export const SPOOL_FILE_READ_DEFAULT_BYTES = 512 * 1_024
export const SPOOL_FILE_READ_MAX_BYTES = 2 * 1_024 * 1_024
export const SPOOL_FILE_WRITE_MAX_BYTES = 4 * 1_024 * 1_024
export const SPOOL_GIT_DIFF_MAX_BYTES = 4 * 1_024 * 1_024
export const SPOOL_GIT_HISTORY_DEFAULT_LIMIT = 50
export const SPOOL_GIT_HISTORY_MAX_LIMIT = 200

export type SpoolFileListOperation = {
  kind: 'files.list'
  relativePath: string
  limit?: number
}

export type SpoolFileReadOperation = {
  kind: 'files.read'
  relativePath: string
  offset?: number
  maxBytes?: number
}

export type SpoolFileDiffOperation = {
  kind: 'files.diff'
  relativePath: string
  staged: boolean
}

export type SpoolFileWriteOperation = {
  kind: 'files.write'
  relativePath: string
  content: string
  encoding: 'utf8' | 'base64'
  mode: 'create' | 'replace'
}

export type SpoolFileCreateDirectoryOperation = {
  kind: 'files.mkdir'
  relativePath: string
}

export type SpoolFileRenameOperation = {
  kind: 'files.rename'
  relativePath: string
  destinationRelativePath: string
}

export type SpoolFileDeleteOperation = {
  kind: 'files.delete'
  relativePath: string
  recursive?: boolean
}

export type SpoolGitStatusOperation = { kind: 'git.status' }

export type SpoolGitDiffOperation = {
  kind: 'git.diff'
  source: 'working-tree' | 'index' | 'commit'
  relativePath?: string
  commitRef?: string
}

export type SpoolGitHistoryOperation = {
  kind: 'git.history'
  limit?: number
}

export type SpoolGitStageOperation = {
  kind: 'git.stage'
  relativePaths: readonly string[]
}

export type SpoolGitUnstageOperation = {
  kind: 'git.unstage'
  relativePaths: readonly string[]
}

export type SpoolGitCommitOperation = {
  kind: 'git.commit'
  message: string
}

export type SpoolChecksReadOperation = { kind: 'checks.read' }

export type SpoolTerminalInputOperation = {
  kind: 'terminal.input'
  terminalRef: string
  data: string
}

export type SpoolTerminalResizeOperation = {
  kind: 'terminal.resize'
  terminalRef: string
  cols: number
  rows: number
}

export type SpoolTerminalLaunchOptionsOperation = {
  kind: 'terminal.launchOptions'
}

export type SpoolTerminalLaunch = { kind: 'shell' } | { kind: 'agent'; agent: SpoolAgentLaunchId }

export type SpoolTerminalCreateOperation = {
  kind: 'terminal.create'
  /** Why: retries after an uncertain response must converge on one owner-side PTY. */
  clientMutationId: string
  launch: SpoolTerminalLaunch
}

export type SpoolSessionContinueOperation = {
  kind: 'session.continue'
  /** Why: owner-side lookup keeps resume commands out of the wire operation. */
  ownerRecordKey: string
}

export type SpoolExecutionOperation =
  | SpoolFileListOperation
  | SpoolFileReadOperation
  | SpoolFileDiffOperation
  | SpoolFileWriteOperation
  | SpoolFileCreateDirectoryOperation
  | SpoolFileRenameOperation
  | SpoolFileDeleteOperation
  | SpoolGitStatusOperation
  | SpoolGitDiffOperation
  | SpoolGitHistoryOperation
  | SpoolGitStageOperation
  | SpoolGitUnstageOperation
  | SpoolGitCommitOperation
  | SpoolChecksReadOperation
  | SpoolTerminalInputOperation
  | SpoolTerminalResizeOperation
  | SpoolTerminalLaunchOptionsOperation
  | SpoolTerminalCreateOperation
  | SpoolSessionContinueOperation

export type SpoolFileTreeEntry = {
  relativePath: string
  name: string
  kind: 'file' | 'directory' | 'symlink'
  size: number | null
  modifiedAt: number | null
}

export type SpoolFileListResult = {
  relativePath: string
  entries: readonly SpoolFileTreeEntry[]
  truncated: boolean
}

export type SpoolFileReadResult = {
  relativePath: string
  encoding: 'utf8' | 'base64'
  content: string
  offset: number
  bytesRead: number
  totalBytes: number
  truncated: boolean
}

export type SpoolFileDiffResult = {
  relativePath: string
  staged: boolean
  patch: string
  truncated: boolean
}

export type SpoolGitStatusEntry = {
  relativePath: string
  oldRelativePath?: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'copied'
  area: 'staged' | 'unstaged' | 'untracked'
  conflicted?: boolean
}

export type SpoolGitStatusResult = {
  branch: string | null
  upstream: { name: string; ahead: number; behind: number } | null
  entries: readonly SpoolGitStatusEntry[]
  truncated: boolean
}

export type SpoolGitDiffResult = {
  source: SpoolGitDiffOperation['source']
  relativePath: string | null
  patch: string
  truncated: boolean
}

export type SpoolGitHistoryEntry = {
  commitRef: string
  parentRefs: readonly string[]
  subject: string
  message: string
  author: string | null
  committedAt: number | null
}

export type SpoolGitHistoryResult = {
  entries: readonly SpoolGitHistoryEntry[]
  hasMore: boolean
}

export type SpoolChecksReview = {
  provider: 'github' | 'gitlab' | 'bitbucket' | 'azure-devops' | 'gitea' | 'unsupported'
  number: number
  title: string
  state: 'open' | 'closed' | 'merged' | 'draft'
  url: string | null
  status: 'pending' | 'success' | 'failure' | 'neutral'
  updatedAt: string
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null
}

export type SpoolCheckEntry = {
  name: string
  status: 'queued' | 'in_progress' | 'completed'
  conclusion:
    | 'success'
    | 'failure'
    | 'cancelled'
    | 'timed_out'
    | 'neutral'
    | 'skipped'
    | 'pending'
    | 'action_required'
    | null
  url: string | null
}

export type SpoolChecksReadResult = {
  review: SpoolChecksReview | null
  checks: readonly SpoolCheckEntry[]
  truncated: boolean
  detailStatus: 'complete' | 'unavailable' | 'unsupported'
}

export type SpoolMutationResult = { ok: true }

export type SpoolTerminalLaunchOptionsResult = {
  agents: readonly SpoolAgentLaunchId[]
  defaultAgent: SpoolAgentLaunchId | null
}

/** Internal owner/paired-runtime result; the requester receives only opaque session identity. */
export type SpoolTerminalCreateHostResult = {
  terminalHandle: string
  sessionKey: string
  provider: 'claude' | 'codex' | 'other'
  title: string
}

/** Internal owner/paired-runtime result; requester RPC retains its connection-scoped opaque ref. */
export type SpoolSessionContinueHostResult = { terminalHandle: string }

export type SpoolExecutionResultByKind = {
  'files.list': SpoolFileListResult
  'files.read': SpoolFileReadResult
  'files.diff': SpoolFileDiffResult
  'files.write': SpoolMutationResult
  'files.mkdir': SpoolMutationResult
  'files.rename': SpoolMutationResult
  'files.delete': SpoolMutationResult
  'git.status': SpoolGitStatusResult
  'git.diff': SpoolGitDiffResult
  'git.history': SpoolGitHistoryResult
  'git.stage': SpoolMutationResult
  'git.unstage': SpoolMutationResult
  'git.commit': SpoolMutationResult
  'checks.read': SpoolChecksReadResult
  'terminal.input': SpoolMutationResult
  'terminal.resize': SpoolMutationResult
  'terminal.launchOptions': SpoolTerminalLaunchOptionsResult
  'terminal.create': SpoolTerminalCreateHostResult
  'session.continue': SpoolSessionContinueHostResult
}

export type SpoolExecutionResult<TOperation extends SpoolExecutionOperation> =
  SpoolExecutionResultByKind[TOperation['kind']]

export type SpoolTerminalSubscribeOperation = {
  kind: 'terminal.subscribe'
  terminalRef: string
  scrollbackRows?: number
}

export type SpoolSubscriptionOperation = SpoolTerminalSubscribeOperation

export type SpoolTerminalSubscriptionEvent =
  | { kind: 'snapshot'; data: string; cols: number; rows: number; sequence: number }
  | { kind: 'output'; data: string; sequence: number }
  | { kind: 'resized'; cols: number; rows: number; sequence: number }
  | { kind: 'closed'; canContinue?: boolean }
  | { kind: 'unavailable' }

export type SpoolSubscriptionEvent<TOperation extends SpoolSubscriptionOperation> =
  TOperation extends SpoolTerminalSubscribeOperation ? SpoolTerminalSubscriptionEvent : never

const SPOOL_MUTATION_OPERATION_KINDS: ReadonlySet<SpoolExecutionOperation['kind']> = new Set([
  'files.write',
  'files.mkdir',
  'files.rename',
  'files.delete',
  'git.stage',
  'git.unstage',
  'git.commit',
  'terminal.input',
  'terminal.resize',
  'terminal.create',
  'session.continue'
])

export function isSpoolMutationKind(kind: SpoolExecutionOperation['kind']): boolean {
  return SPOOL_MUTATION_OPERATION_KINDS.has(kind)
}

export function isSpoolMutationOperation(operation: SpoolExecutionOperation): boolean {
  return isSpoolMutationKind(operation.kind)
}
