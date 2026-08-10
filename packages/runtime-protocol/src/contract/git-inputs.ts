import { z } from 'zod'

function requiredString(message: string) {
  return z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string().min(1, message))
}

function requiredNonOptionString(message: string, optionMessage: string) {
  return z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(
      z
        .string()
        .min(1, message)
        .refine((value) => !value.startsWith('-'), optionMessage)
    )
}

export const GitWorktreeSelectorInputSchema = z.object({
  worktree: requiredString('Missing worktree selector')
})

export const GitStatusInputSchema = GitWorktreeSelectorInputSchema.extend({
  includeIgnored: z.boolean().optional(),
  bypassEffectiveUpstreamNegativeCache: z.boolean().optional(),
  reuseLineStats: z.boolean().optional()
})

export const GitCheckIgnoredInputSchema = GitWorktreeSelectorInputSchema.extend({
  paths: z.array(z.string().min(1, 'Missing path')).max(2000)
})

export const GitSubmoduleStatusInputSchema = GitWorktreeSelectorInputSchema.extend({
  submodulePath: requiredNonOptionString(
    'Missing submodule path',
    'Submodule path must not start with -'
  ),
  area: z.enum(['staged', 'unstaged', 'untracked']).optional()
})

export const GitFilePathInputSchema = GitWorktreeSelectorInputSchema.extend({
  filePath: requiredString('Missing file path')
})

export const GitDiffInputSchema = GitFilePathInputSchema.extend({
  staged: z.boolean(),
  compareAgainstHead: z.boolean().optional()
})

export const GitBranchCompareInputSchema = GitWorktreeSelectorInputSchema.extend({
  baseRef: requiredNonOptionString('Missing base ref', 'Base ref must not start with -')
})

const FullGitObjectId = z
  .string()
  .regex(/^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/, 'Expected a full git object id')

const GitObjectIdFromUnknown = z
  .unknown()
  .transform((value) => (typeof value === 'string' ? value : ''))
  .pipe(FullGitObjectId)

export const GitCommitCompareInputSchema = GitWorktreeSelectorInputSchema.extend({
  commitId: GitObjectIdFromUnknown
})

export const GitHistoryInputSchema = GitWorktreeSelectorInputSchema.extend({
  limit: z.number().int().min(1).max(200).optional(),
  baseRef: z.string().nullable().optional(),
  refScope: z.enum(['head', 'all']).optional(),
  includeRemoteBranches: z.boolean().optional(),
  skip: z.number().int().min(0).optional()
})

export const GitBranchDiffInputSchema = GitFilePathInputSchema.extend({
  compare: z.object({
    baseRef: z.string().optional(),
    baseOid: FullGitObjectId.optional(),
    headOid: FullGitObjectId,
    mergeBase: FullGitObjectId
  }),
  oldPath: z.string().optional()
})

export const GitCommitDiffInputSchema = GitFilePathInputSchema.extend({
  commitOid: FullGitObjectId,
  parentOid: FullGitObjectId.nullable().optional(),
  oldPath: z.string().optional()
})

export const GitCommitInputSchema = GitWorktreeSelectorInputSchema.extend({
  message: requiredString('Missing commit message')
})

export const GitBulkPathsInputSchema = GitWorktreeSelectorInputSchema.extend({
  filePaths: z.array(z.string().min(1, 'Missing file path'))
})

const GitPushTargetParam = z.object({
  remoteName: z.string(),
  branchName: z.string(),
  remoteUrl: z.string().optional(),
  remoteCreated: z.boolean().optional()
})

export const GitPushInputSchema = GitWorktreeSelectorInputSchema.extend({
  publish: z.boolean().optional(),
  forceWithLease: z.boolean().optional(),
  pushTarget: GitPushTargetParam.optional()
})

export const GitTargetedRemoteInputSchema = GitWorktreeSelectorInputSchema.extend({
  pushTarget: GitPushTargetParam.optional()
})

export type GitBulkPathsInput = z.output<typeof GitBulkPathsInputSchema>
export type GitPushInput = z.output<typeof GitPushInputSchema>
export type GitTargetedRemoteInput = z.output<typeof GitTargetedRemoteInputSchema>

export const GitForkSyncInputSchema = GitWorktreeSelectorInputSchema.extend({
  expectedUpstream: z.object({
    owner: z.string().trim().min(1),
    repo: z.string().trim().min(1)
  })
})

export const GitRebaseFromBaseInputSchema = GitWorktreeSelectorInputSchema.extend({
  baseRef: requiredNonOptionString('Missing base ref', 'Base ref must not start with -')
})

export const GitCheckoutInputSchema = GitWorktreeSelectorInputSchema.extend({
  branch: requiredNonOptionString('Missing branch', 'Branch must not start with -')
})

export const GitRemoteFileUrlInputSchema = GitWorktreeSelectorInputSchema.extend({
  relativePath: requiredString('Missing relative path'),
  line: z.number().int().min(1)
})

export const GitRemoteCommitUrlInputSchema = GitWorktreeSelectorInputSchema.extend({
  sha: GitObjectIdFromUnknown
})

const GitRefName = requiredNonOptionString('Missing name', 'Name must not start with -')

const GitCommitTarget = GitWorktreeSelectorInputSchema.extend({
  commit: GitObjectIdFromUnknown
})

export const GitAddTagInputSchema = GitCommitTarget.extend({
  name: GitRefName,
  message: z.string().optional(),
  force: z.boolean().optional()
})

export const GitCreateBranchInputSchema = GitCommitTarget.extend({
  name: GitRefName,
  checkout: z.boolean().optional()
})

export const GitCheckoutCommitInputSchema = GitCommitTarget

const GitMainlineOption = z.number().int().min(1).max(64).optional()

export const GitCherryPickInputSchema = GitCommitTarget.extend({ mainline: GitMainlineOption })
export const GitRevertCommitInputSchema = GitCommitTarget.extend({ mainline: GitMainlineOption })
export const GitDropCommitInputSchema = GitCommitTarget

export const GitMergeCommitInputSchema = GitCommitTarget.extend({
  noFf: z.boolean().optional(),
  squash: z.boolean().optional(),
  message: z.string().optional()
})

export const GitRebaseOntoCommitInputSchema = GitCommitTarget

export const GitResetToCommitInputSchema = GitCommitTarget.extend({
  mode: z.enum(['soft', 'mixed', 'hard'])
})
