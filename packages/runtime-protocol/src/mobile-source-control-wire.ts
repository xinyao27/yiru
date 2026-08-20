import type { GitHistoryResult, GitStatusResult } from '@yiru/workbench-model/review'
import type { GitBranchCompareResult } from '@yiru/workbench-model/review'
import { z } from 'zod'

import type {
  GitCheckoutResult,
  GitCommitCompareResult,
  GitCommitResult,
  GitDiffResult,
  GitGenerateCommitMessageResult,
  GitMutationResult
} from './contract/git-results.js' with {
  'resolution-mode': 'import'
}
import type { RuntimeGitLocalBranches } from './mobile-runtime-types.js' with {
  'resolution-mode': 'import'
}

export const MOBILE_GIT_STATUS_ORPC_PATH = '/git/status'
export const MOBILE_GIT_STAGE_ORPC_PATH = '/git/stage'
export const MOBILE_GIT_UNSTAGE_ORPC_PATH = '/git/unstage'
export const MOBILE_GIT_DISCARD_ORPC_PATH = '/git/discard'
export const MOBILE_GIT_BULK_STAGE_ORPC_PATH = '/git/bulkStage'
export const MOBILE_GIT_BULK_UNSTAGE_ORPC_PATH = '/git/bulkUnstage'
export const MOBILE_GIT_COMMIT_ORPC_PATH = '/git/commit'
export const MOBILE_GIT_FETCH_ORPC_PATH = '/git/fetch'
export const MOBILE_GIT_PULL_ORPC_PATH = '/git/pull'
export const MOBILE_GIT_PUSH_ORPC_PATH = '/git/push'
export const MOBILE_GIT_HISTORY_ORPC_PATH = '/git/history'
export const MOBILE_GIT_COMMIT_COMPARE_ORPC_PATH = '/git/commitCompare'
export const MOBILE_GIT_ABORT_MERGE_ORPC_PATH = '/git/abortMerge'
export const MOBILE_GIT_ABORT_REBASE_ORPC_PATH = '/git/abortRebase'
export const MOBILE_GIT_ABORT_REVERT_ORPC_PATH = '/git/abortRevert'
export const MOBILE_GIT_FAST_FORWARD_ORPC_PATH = '/git/fastForward'
export const MOBILE_GIT_REBASE_FROM_BASE_ORPC_PATH = '/git/rebaseFromBase'
export const MOBILE_GIT_CHECKOUT_ORPC_PATH = '/git/checkout'
export const MOBILE_GIT_LOCAL_BRANCHES_ORPC_PATH = '/git/localBranches'
export const MOBILE_GIT_BRANCH_COMPARE_ORPC_PATH = '/git/branchCompare'
export const MOBILE_GIT_BRANCH_DIFF_ORPC_PATH = '/git/branchDiff'
export const MOBILE_GIT_GENERATE_COMMIT_MESSAGE_ORPC_PATH = '/git/generateCommitMessage'
export const MOBILE_GIT_CANCEL_GENERATE_COMMIT_MESSAGE_ORPC_PATH =
  '/git/cancelGenerateCommitMessage'

// Why: branchCompare has no entry cap on the desktop path (a repo diffing
// thousands of files against base is normal there); an uncapped entries array
// for a huge monorepo branch could still grow large enough to matter on a
// mobile connection. The mobile client now explicitly configures
// URLSessionWebSocketTask.maximumMessageSize to 8 MiB (previously left at its
// unconfigured 1 MiB default, which is what actually caused the "Desktop
// returned an invalid response" failures traced to this feature — not this
// cap; see AuthenticatedRuntimeConnection.swift). Measured: this schema's
// entries serialize at ~140 bytes each, so even a 20,000-file comparison is
// only ~2.8 MB raw (~3.5-4 MB after envelope/E2EE framing) — comfortably
// under half the configured ceiling, well past any repo exercised so far
// (the largest real one measured here was ~4,300 files), while still bounded
// rather than unbounded. Cap it the same way git status caps entries,
// mobile-only — desktop keeps the full list.
export const MOBILE_GIT_BRANCH_COMPARE_MAX_ENTRIES = 20_000

export const MobileGitWorktreeRequestSchema = z.object({ worktree: z.string().min(1) })
export const MobileGitFileRequestSchema = MobileGitWorktreeRequestSchema.extend({
  filePath: z.string().min(1)
})
export const MobileGitBulkRequestSchema = MobileGitWorktreeRequestSchema.extend({
  filePaths: z.array(z.string().min(1))
})
export const MobileGitCommitRequestSchema = MobileGitWorktreeRequestSchema.extend({
  message: z.string().min(1)
})
export const MobileGitPushRequestSchema = MobileGitWorktreeRequestSchema.extend({
  publish: z.boolean().optional(),
  forceWithLease: z.boolean().optional()
})
export const MobileGitHistoryRequestSchema = MobileGitWorktreeRequestSchema.extend({
  limit: z.number().int().min(1).max(200).optional()
})
export const MobileGitCommitCompareRequestSchema = MobileGitWorktreeRequestSchema.extend({
  commitId: z.string().min(1)
})
export const MobileGitRebaseRequestSchema = MobileGitWorktreeRequestSchema.extend({
  baseRef: z.string().min(1)
})
export const MobileGitCheckoutRequestSchema = MobileGitWorktreeRequestSchema.extend({
  branch: z.string().min(1)
})
export const MobileGitBranchCompareRequestSchema = MobileGitWorktreeRequestSchema.extend({
  baseRef: z.string().min(1)
})
export const MobileGitBranchDiffRequestSchema = MobileGitFileRequestSchema.extend({
  compare: z.object({
    baseRef: z.string().optional(),
    baseOid: z.string().optional(),
    headOid: z.string().min(1),
    mergeBase: z.string().min(1)
  }),
  oldPath: z.string().optional()
})

export const MobileGitUpstreamStatusSchema = z.object({
  hasUpstream: z.boolean(),
  upstreamName: z.string().optional(),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  hasConfiguredPushTarget: z.boolean().optional(),
  behindCommitsArePatchEquivalent: z.boolean().optional()
})

export const MobileGitStatusEntrySchema = z.object({
  path: z.string(),
  status: z.enum(['modified', 'added', 'deleted', 'renamed', 'untracked', 'copied']),
  area: z.enum(['staged', 'unstaged', 'untracked']),
  oldPath: z.string().optional(),
  conflictKind: z
    .enum([
      'both_modified',
      'both_added',
      'both_deleted',
      'added_by_us',
      'added_by_them',
      'deleted_by_us',
      'deleted_by_them'
    ])
    .optional(),
  conflictStatus: z.enum(['unresolved', 'resolved_locally']).optional(),
  added: z.number().int().nonnegative().optional(),
  removed: z.number().int().nonnegative().optional()
})

export const MobileGitStatusResultSchema = z.object({
  entries: z.array(MobileGitStatusEntrySchema),
  conflictOperation: z.enum(['merge', 'rebase', 'cherry-pick', 'revert', 'unknown']),
  head: z.string().optional(),
  branch: z.string().optional(),
  upstreamStatus: MobileGitUpstreamStatusSchema.optional(),
  didHitLimit: z.boolean().optional(),
  statusLength: z.number().int().nonnegative().optional()
})

export const MobileGitMutationResultSchema = z.object({ ok: z.literal(true) })
export const MobileGitCommitResultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional()
})

export const MobileGitHistoryItemSchema = z.object({
  id: z.string(),
  parentIds: z.array(z.string()),
  subject: z.string(),
  message: z.string(),
  displayId: z.string().optional(),
  author: z.string().optional(),
  timestamp: z.number().optional()
})
export const MobileGitHistoryResultSchema = z.object({
  items: z.array(MobileGitHistoryItemSchema),
  hasMore: z.boolean(),
  limit: z.number().int().nonnegative()
})

export const MobileGitBranchChangeEntrySchema = z.object({
  path: z.string(),
  status: z.enum(['modified', 'added', 'deleted', 'renamed', 'copied']),
  oldPath: z.string().optional(),
  added: z.number().int().nonnegative().optional(),
  removed: z.number().int().nonnegative().optional()
})
export const MobileGitCommitCompareResultSchema = z.object({
  summary: z.object({
    commitOid: z.string(),
    parentOid: z.string().nullable(),
    compareRef: z.string(),
    baseRef: z.string(),
    changedFiles: z.number().int().nonnegative(),
    status: z.enum(['ready', 'invalid-commit', 'error']),
    errorMessage: z.string().optional()
  }),
  entries: z.array(MobileGitBranchChangeEntrySchema)
})
export const MobileGitCheckoutResultSchema = z.object({
  ok: z.literal(true),
  branch: z.string()
})
export const MobileGitLocalBranchesResultSchema = z.object({
  current: z.string().nullable(),
  branches: z.array(z.string())
})
export const MobileGitBranchCompareResultSchema = z.object({
  summary: z.object({
    baseRef: z.string(),
    baseOid: z.string().nullable(),
    compareRef: z.string(),
    headOid: z.string().nullable(),
    mergeBase: z.string().nullable(),
    changedFiles: z.number().int().nonnegative(),
    commitsAhead: z.number().int().nonnegative().optional(),
    status: z.enum(['ready', 'invalid-base', 'unborn-head', 'no-merge-base', 'loading', 'error']),
    errorMessage: z.string().optional()
  }),
  entries: z.array(MobileGitBranchChangeEntrySchema),
  // Set when the mobile RPC handler truncated `entries` to
  // MOBILE_GIT_BRANCH_COMPARE_MAX_ENTRIES. `summary.changedFiles` still carries
  // the true total; only the array sent over the wire is bounded.
  didHitLimit: z.boolean().optional()
})
export const MobileGitDiffResultSchema = z.union([
  z.object({
    kind: z.literal('text'),
    originalContent: z.string(),
    modifiedContent: z.string(),
    originalIsBinary: z.literal(false),
    modifiedIsBinary: z.literal(false)
  }),
  z.object({
    kind: z.literal('binary'),
    originalContent: z.string(),
    modifiedContent: z.string(),
    originalIsBinary: z.boolean(),
    modifiedIsBinary: z.boolean(),
    isImage: z.boolean().optional(),
    mimeType: z.string().optional(),
    modifiedDeleted: z.boolean().optional()
  })
])
export const MobileGitGenerateCommitMessageResultSchema = z.union([
  z.object({
    success: z.literal(true),
    message: z.string(),
    agentLabel: z.string().optional()
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
    canceled: z.boolean().optional()
  })
])

export const MOBILE_GIT_STATUS_WIRE_IS_COMPATIBLE: GitStatusResult extends z.infer<
  typeof MobileGitStatusResultSchema
>
  ? true
  : false = true
export const MOBILE_GIT_MUTATION_WIRE_IS_COMPATIBLE: GitMutationResult extends z.infer<
  typeof MobileGitMutationResultSchema
>
  ? true
  : false = true
export const MOBILE_GIT_COMMIT_WIRE_IS_COMPATIBLE: GitCommitResult extends z.infer<
  typeof MobileGitCommitResultSchema
>
  ? true
  : false = true
export const MOBILE_GIT_HISTORY_WIRE_IS_COMPATIBLE: GitHistoryResult extends z.infer<
  typeof MobileGitHistoryResultSchema
>
  ? true
  : false = true
export const MOBILE_GIT_COMMIT_COMPARE_WIRE_IS_COMPATIBLE: GitCommitCompareResult extends z.infer<
  typeof MobileGitCommitCompareResultSchema
>
  ? true
  : false = true
export const MOBILE_GIT_CHECKOUT_WIRE_IS_COMPATIBLE: GitCheckoutResult extends z.infer<
  typeof MobileGitCheckoutResultSchema
>
  ? true
  : false = true
export const MOBILE_GIT_LOCAL_BRANCHES_WIRE_IS_COMPATIBLE: RuntimeGitLocalBranches extends z.infer<
  typeof MobileGitLocalBranchesResultSchema
>
  ? true
  : false = true
export const MOBILE_GIT_BRANCH_COMPARE_WIRE_IS_COMPATIBLE: GitBranchCompareResult extends z.infer<
  typeof MobileGitBranchCompareResultSchema
>
  ? true
  : false = true
export const MOBILE_GIT_DIFF_WIRE_IS_COMPATIBLE: GitDiffResult extends z.infer<
  typeof MobileGitDiffResultSchema
>
  ? true
  : false = true
export const MOBILE_GIT_GENERATE_MESSAGE_WIRE_IS_COMPATIBLE: GitGenerateCommitMessageResult extends z.infer<
  typeof MobileGitGenerateCommitMessageResultSchema
>
  ? true
  : false = true
