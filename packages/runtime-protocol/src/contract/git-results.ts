import type { TuiAgent } from '../model/agent.js'
import type { GitBranchChangeEntry } from '../model/review.js'

export type GitCommitCompareSummary = {
  commitOid: string
  parentOid: string | null
  compareRef: string
  baseRef: string
  changedFiles: number
  status: 'ready' | 'invalid-commit' | 'error'
  errorMessage?: string
}

export type GitCommitCompareResult = {
  summary: GitCommitCompareSummary
  entries: GitBranchChangeEntry[]
}

export type GitDiffLineCounts = {
  original: number
  modified: number
}

export type GitDiffLineCountMinimums = {
  original: boolean
  modified: boolean
}

export type GitLargeDiffRenderLimit =
  | {
      limited: false
      lineCounts: GitDiffLineCounts
      characterCount: number
    }
  | {
      limited: true
      reason: 'line-count' | 'character-count'
      lineCounts: GitDiffLineCounts | null
      lineCountsAreMinimum?: GitDiffLineCountMinimums
      characterCount: number
      limits: {
        maxLinesPerSide: number
        maxCombinedCharacters: number
      }
    }

export type GitDiffResult =
  | {
      kind: 'text'
      originalContent: string
      modifiedContent: string
      originalIsBinary: false
      modifiedIsBinary: false
      largeDiffRenderLimit?: GitLargeDiffRenderLimit
    }
  | ({
      kind: 'binary'
      originalContent: string
      modifiedContent: string
      isImage?: boolean
      mimeType?: string
      modifiedDeleted?: boolean
    } & (
      | { originalIsBinary: true; modifiedIsBinary: boolean }
      | { originalIsBinary: boolean; modifiedIsBinary: true }
    ))

export type GitWriteBlockedReason =
  | 'dirty_working_tree'
  | 'operation_in_progress'
  | 'detached_head'
  | 'unborn_head'
  | 'invalid_commit'
  | 'merge_commit_requires_mainline'
  | 'not_a_merge_commit'
  | 'merge_commit_not_droppable'
  | 'name_exists'
  | 'invalid_name'

export type GitWriteBlockedResult = {
  status: 'blocked'
  reason: GitWriteBlockedReason
  message: string
}

export type GitWriteErrorResult = { status: 'error'; message: string }
export type GitWriteConflictResult = { status: 'conflicts'; paths: string[] }

export type GitAddTagResult =
  | { status: 'ok'; tag: string }
  | GitWriteBlockedResult
  | GitWriteErrorResult

export type GitCreateBranchResult =
  | { status: 'ok'; branch: string; checkedOut: boolean }
  | GitWriteBlockedResult
  | GitWriteErrorResult

export type GitCheckoutCommitResult =
  | { status: 'ok'; commit: string }
  | GitWriteBlockedResult
  | GitWriteErrorResult

export type GitConflictableWriteResult =
  | { status: 'ok' }
  | GitWriteConflictResult
  | GitWriteBlockedResult
  | GitWriteErrorResult

export type GitResetToCommitResult = { status: 'ok' } | GitWriteBlockedResult | GitWriteErrorResult

export type GitForkSyncResult = {
  status: 'up-to-date' | 'synced' | 'blocked'
  reason?:
    | 'missing-origin'
    | 'missing-upstream'
    | 'upstream-mismatch'
    | 'missing-upstream-default-branch'
    | 'missing-origin-branch'
    | 'diverged'
  originRemote: string
  upstreamRemote: string
  branchName?: string
  ahead: number
  behind: number
}

export type GitCheckoutResult = { ok: true; branch: string }
export type GitMutationResult = { ok: true }
export type GitCommitResult = { success: boolean; error?: string }

export type GitThinkingLevel = { id: string; label: string }

export type GitCommitMessageModelCapability = {
  id: string
  label: string
  thinkingLevels?: GitThinkingLevel[]
  defaultThinkingLevel?: string
}

export type GitCommitMessageAgentCapability = {
  id: TuiAgent
  label: string
  modelSource: 'static' | 'dynamic'
  models: GitCommitMessageModelCapability[]
  defaultModelId: string
}

export type GitGenerateCommitMessageResult =
  | { success: true; message: string; agentLabel?: string }
  | { success: false; error: string; canceled?: boolean }

export type GitDiscoverCommitMessageModelsResult =
  | {
      success: true
      capability: GitCommitMessageAgentCapability
      models: GitCommitMessageModelCapability[]
      defaultModelId: string
    }
  | { success: false; error: string }

export type GitGeneratedPullRequestFields = {
  base: string
  title: string
  body: string
  draft: boolean
}

export type GitGeneratePullRequestFieldsResult =
  | {
      success: true
      fields: GitGeneratedPullRequestFields
      agentLabel?: string
      branchChangedByPreparation?: boolean
    }
  | {
      success: false
      error: string
      canceled?: boolean
      branchChangedByPreparation?: boolean
    }
