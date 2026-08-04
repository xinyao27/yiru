import type { CoworkingAgentLaunchId } from './agent-launch-contract'
import { getCoworkingResourceQuota } from './resource-limits'

export const COWORKING_FILE_LIST_DEFAULT_LIMIT = 1_000
export const COWORKING_FILE_LIST_MAX_LIMIT = 5_000
export const COWORKING_FILE_LIST_VERIFIED_HOST_PAGE_LIMIT = 256
// Why: owner-only entries are filtered across bounded internal host pages.
export const COWORKING_FILE_LIST_VERIFIED_HOST_MAX_LIMIT = COWORKING_FILE_LIST_MAX_LIMIT + 256
export const COWORKING_FILE_READ_DEFAULT_BYTES = 512 * 1_024
export const COWORKING_FILE_READ_MAX_BYTES = getCoworkingResourceQuota(
  'worktree',
  'read'
).fileReadMaxBytes
export const COWORKING_FILE_WRITE_MAX_BYTES = 4 * 1_024 * 1_024
export const COWORKING_GIT_DIFF_MAX_BYTES = 4 * 1_024 * 1_024
export const COWORKING_GIT_HISTORY_DEFAULT_LIMIT = 50
export const COWORKING_GIT_HISTORY_MAX_LIMIT = 200

export type CoworkingFileListOperation = {
  kind: 'files.list'
  relativePath: string
  limit?: number
}

export type CoworkingFileReadOperation = {
  kind: 'files.read'
  relativePath: string
  offset?: number
  maxBytes?: number
}

export type CoworkingFileDiffOperation = {
  kind: 'files.diff'
  relativePath: string
  staged: boolean
}

export type CoworkingFileWriteOperation = {
  kind: 'files.write'
  relativePath: string
  content: string
  encoding: 'utf8' | 'base64'
  mode: 'create' | 'replace'
}

export type CoworkingFileCreateDirectoryOperation = {
  kind: 'files.mkdir'
  relativePath: string
}

export type CoworkingFileRenameOperation = {
  kind: 'files.rename'
  relativePath: string
  destinationRelativePath: string
}

export type CoworkingFileDeleteOperation = {
  kind: 'files.delete'
  relativePath: string
  recursive?: boolean
}

export type CoworkingGitStatusOperation = { kind: 'git.status' }

export type CoworkingGitDiffOperation = {
  kind: 'git.diff'
  source: 'working-tree' | 'index' | 'commit'
  relativePath?: string
  commitRef?: string
}

export type CoworkingGitHistoryOperation = {
  kind: 'git.history'
  limit?: number
}

export type CoworkingGitStageOperation = {
  kind: 'git.stage'
  relativePaths: readonly string[]
}

export type CoworkingGitUnstageOperation = {
  kind: 'git.unstage'
  relativePaths: readonly string[]
}

export type CoworkingGitCommitOperation = {
  kind: 'git.commit'
  message: string
}

export type CoworkingChecksReadOperation = { kind: 'checks.read' }

export type CoworkingTerminalInputOperation = {
  kind: 'terminal.input'
  terminalRef: string
  data: string
}

export type CoworkingTerminalResizeOperation = {
  kind: 'terminal.resize'
  terminalRef: string
  cols: number
  rows: number
}

export type CoworkingTerminalLaunchOptionsOperation = {
  kind: 'terminal.launchOptions'
}

export type CoworkingTerminalLaunch =
  | { kind: 'shell' }
  | { kind: 'agent'; agent: CoworkingAgentLaunchId }

export type CoworkingTerminalCreateOperation = {
  kind: 'terminal.create'
  /** Why: retries after an uncertain response must converge on one owner-side PTY. */
  clientMutationId: string
  launch: CoworkingTerminalLaunch
}

export type CoworkingSessionContinueOperation = {
  kind: 'session.continue'
  /** Why: owner-side lookup keeps resume commands out of the wire operation. */
  ownerRecordKey: string
}

export type CoworkingExecutionOperation =
  | CoworkingFileListOperation
  | CoworkingFileReadOperation
  | CoworkingFileDiffOperation
  | CoworkingFileWriteOperation
  | CoworkingFileCreateDirectoryOperation
  | CoworkingFileRenameOperation
  | CoworkingFileDeleteOperation
  | CoworkingGitStatusOperation
  | CoworkingGitDiffOperation
  | CoworkingGitHistoryOperation
  | CoworkingGitStageOperation
  | CoworkingGitUnstageOperation
  | CoworkingGitCommitOperation
  | CoworkingChecksReadOperation
  | CoworkingTerminalInputOperation
  | CoworkingTerminalResizeOperation
  | CoworkingTerminalLaunchOptionsOperation
  | CoworkingTerminalCreateOperation
  | CoworkingSessionContinueOperation

export type CoworkingFileTreeEntry = {
  relativePath: string
  name: string
  kind: 'file' | 'directory' | 'symlink'
  size: number | null
  modifiedAt: number | null
}

export type CoworkingFileListResult = {
  relativePath: string
  entries: readonly CoworkingFileTreeEntry[]
  truncated: boolean
}

export type CoworkingFileReadResult = {
  relativePath: string
  encoding: 'utf8' | 'base64'
  content: string
  offset: number
  bytesRead: number
  totalBytes: number
  truncated: boolean
}

export type CoworkingFileDiffResult = {
  relativePath: string
  staged: boolean
  patch: string
  truncated: boolean
}

export type CoworkingGitStatusEntry = {
  relativePath: string
  oldRelativePath?: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'copied'
  area: 'staged' | 'unstaged' | 'untracked'
  conflicted?: boolean
}

export type CoworkingGitStatusResult = {
  branch: string | null
  upstream: { name: string; ahead: number; behind: number } | null
  entries: readonly CoworkingGitStatusEntry[]
  truncated: boolean
}

export type CoworkingGitDiffResult = {
  source: CoworkingGitDiffOperation['source']
  relativePath: string | null
  patch: string
  truncated: boolean
}

export type CoworkingGitHistoryEntry = {
  commitRef: string
  parentRefs: readonly string[]
  subject: string
  message: string
  author: string | null
  committedAt: number | null
}

export type CoworkingGitHistoryResult = {
  entries: readonly CoworkingGitHistoryEntry[]
  hasMore: boolean
}

export type CoworkingChecksReview = {
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

export type CoworkingCheckEntry = {
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

export type CoworkingChecksReadResult = {
  review: CoworkingChecksReview | null
  checks: readonly CoworkingCheckEntry[]
  truncated: boolean
  detailStatus: 'complete' | 'unavailable' | 'unsupported'
}

export type CoworkingMutationResult = { ok: true }

export type CoworkingTerminalLaunchOptionsResult = {
  agents: readonly CoworkingAgentLaunchId[]
  defaultAgent: CoworkingAgentLaunchId | null
}

/** Internal owner/paired-runtime result; the requester receives only opaque session identity. */
export type CoworkingTerminalCreateHostResult = {
  terminalHandle: string
  sessionKey: string
  provider: 'claude' | 'codex' | 'other'
  title: string
}

/** Internal owner/paired-runtime result; requester RPC retains its connection-scoped opaque ref. */
export type CoworkingSessionContinueHostResult = { terminalHandle: string }

export type CoworkingExecutionResultByKind = {
  'files.list': CoworkingFileListResult
  'files.read': CoworkingFileReadResult
  'files.diff': CoworkingFileDiffResult
  'files.write': CoworkingMutationResult
  'files.mkdir': CoworkingMutationResult
  'files.rename': CoworkingMutationResult
  'files.delete': CoworkingMutationResult
  'git.status': CoworkingGitStatusResult
  'git.diff': CoworkingGitDiffResult
  'git.history': CoworkingGitHistoryResult
  'git.stage': CoworkingMutationResult
  'git.unstage': CoworkingMutationResult
  'git.commit': CoworkingMutationResult
  'checks.read': CoworkingChecksReadResult
  'terminal.input': CoworkingMutationResult
  'terminal.resize': CoworkingMutationResult
  'terminal.launchOptions': CoworkingTerminalLaunchOptionsResult
  'terminal.create': CoworkingTerminalCreateHostResult
  'session.continue': CoworkingSessionContinueHostResult
}

export type CoworkingExecutionResult<TOperation extends CoworkingExecutionOperation> =
  CoworkingExecutionResultByKind[TOperation['kind']]

export type CoworkingTerminalSubscribeOperation = {
  kind: 'terminal.subscribe'
  terminalRef: string
  scrollbackRows?: number
}

export type CoworkingSubscriptionOperation = CoworkingTerminalSubscribeOperation

export type CoworkingTerminalSubscriptionEvent =
  | { kind: 'snapshot'; data: string; cols: number; rows: number; sequence: number }
  | { kind: 'output'; data: string; sequence: number }
  | { kind: 'resized'; cols: number; rows: number; sequence: number }
  | { kind: 'closed'; canContinue?: boolean }
  | { kind: 'unavailable' }

export type CoworkingSubscriptionEvent<TOperation extends CoworkingSubscriptionOperation> =
  TOperation extends CoworkingTerminalSubscribeOperation
    ? CoworkingTerminalSubscriptionEvent
    : never

const COWORKING_MUTATION_OPERATION_KINDS: ReadonlySet<CoworkingExecutionOperation['kind']> =
  new Set([
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

export function isCoworkingMutationKind(kind: CoworkingExecutionOperation['kind']): boolean {
  return COWORKING_MUTATION_OPERATION_KINDS.has(kind)
}

export function isCoworkingMutationOperation(operation: CoworkingExecutionOperation): boolean {
  return isCoworkingMutationKind(operation.kind)
}
