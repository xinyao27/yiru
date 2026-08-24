import { z } from 'zod'

import {
  isRuntimeTuiAgent,
  OptionalBoolean,
  OptionalFiniteNumber,
  OptionalPlainString,
  OptionalString,
  OptionalTuiAgent,
  SleepingAgentLaunchConfigSchema,
  TriStateLinkedReviewNumber,
  WorkspaceSourceSchema
} from './input-schema.js'

const RepoSelectorSchema = z
  .unknown()
  .transform((value) => (typeof value === 'string' ? value : ''))
  .pipe(z.string().min(1, 'Missing repo selector'))

export const WorktreeListInputSchema = z.object({
  repo: OptionalString,
  limit: OptionalFiniteNumber
})

export const WorktreeDetectedListInputSchema = z.object({ repo: RepoSelectorSchema })

export const WorktreePsInputSchema = z.object({ limit: OptionalFiniteNumber })

export const WorktreeSortOrderInputSchema = z.object({ orderedIds: z.array(z.string()) })

export const WorktreeSelectorInputSchema = z.object({
  worktree: z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string().min(1, 'Missing worktree selector'))
})

export const WorktreeActivateInputSchema = WorktreeSelectorInputSchema.extend({
  notifyClients: OptionalBoolean
})

export const WorktreeCreateInputSchema = z
  .object({
    repo: RepoSelectorSchema,
    name: OptionalString,
    baseBranch: OptionalString,
    compareBaseRef: OptionalString,
    branchNameOverride: OptionalString,
    linkedPR: TriStateLinkedReviewNumber,
    linkedGitLabMR: TriStateLinkedReviewNumber,
    linkedBitbucketPR: TriStateLinkedReviewNumber,
    linkedAzureDevOpsPR: TriStateLinkedReviewNumber,
    linkedGiteaPR: TriStateLinkedReviewNumber,
    comment: OptionalString,
    displayName: OptionalString,
    telemetrySource: z
      .unknown()
      .transform((value) => {
        const parsed = WorkspaceSourceSchema.safeParse(value)
        return parsed.success ? parsed.data : undefined
      })
      .optional(),
    workspaceStatus: OptionalString,
    manualOrder: OptionalFiniteNumber,
    sparseCheckout: z
      .object({ directories: z.array(z.string()), presetId: OptionalString })
      .optional(),
    pushTarget: z
      .object({
        remoteName: z.string(),
        branchName: z.string(),
        remoteUrl: OptionalString
      })
      .optional(),
    runHooks: OptionalBoolean,
    activate: OptionalBoolean,
    parentWorkspace: OptionalString,
    envParentWorkspace: OptionalString,
    parentWorktree: OptionalString,
    cwdParentWorktree: OptionalString,
    noParent: OptionalBoolean,
    callerTerminalHandle: OptionalString,
    orchestrationContext: z
      .object({
        parentWorktreeId: OptionalString,
        orchestrationRunId: OptionalString,
        taskId: OptionalString,
        coordinatorHandle: OptionalString
      })
      .optional(),
    setupDecision: z
      .unknown()
      .transform((value) =>
        typeof value === 'string' && ['run', 'skip', 'inherit'].includes(value) ? value : undefined
      )
      .pipe(z.union([z.enum(['run', 'skip', 'inherit']), z.undefined()]))
      .optional(),
    startupCommand: OptionalString,
    startupEnv: z.record(z.string(), z.string()).optional(),
    startupLaunchConfig: SleepingAgentLaunchConfigSchema,
    startupCommandDelivery: z.enum(['fast', 'shell-ready']).optional(),
    startupAgent: OptionalTuiAgent,
    startupPrompt: OptionalString,
    startupDraft: OptionalString,
    createdWithAgent: z
      .unknown()
      .transform((value) => (isRuntimeTuiAgent(value) ? value : undefined))
      .optional(),
    // Why: set when the renderer knows this auto-generated branch should be
    // renamed from the first agent message (see preload's
    // `CreateWorktreeArgs.pendingFirstAgentMessageRename`).
    // `runtime.createManagedWorktree` already accepts this field — only the
    // RPC input schema was missing it.
    pendingFirstAgentMessageRename: OptionalBoolean
  })
  .superRefine((params, context) => {
    if ((params.parentWorkspace || params.parentWorktree) && params.noParent === true) {
      context.addIssue({
        code: 'custom',
        message: 'Choose either one parent selector or --no-parent.'
      })
    }
    if (params.parentWorkspace && params.parentWorktree) {
      context.addIssue({
        code: 'custom',
        message: 'Choose either one parent selector or --no-parent.'
      })
    }
    if (params.startupPrompt !== undefined && params.startupAgent === undefined) {
      context.addIssue({ code: 'custom', message: 'startupPrompt requires startupAgent' })
    }
  })

export const WorktreePrefetchCreateBaseInputSchema = z.object({
  repo: RepoSelectorSchema,
  baseBranch: OptionalString
})

export const WorktreeSetInputSchema = WorktreeSelectorInputSchema.extend({
  displayName: OptionalString,
  comment: OptionalPlainString,
  linkedPR: TriStateLinkedReviewNumber,
  linkedGitLabMR: TriStateLinkedReviewNumber,
  linkedBitbucketPR: TriStateLinkedReviewNumber,
  linkedAzureDevOpsPR: TriStateLinkedReviewNumber,
  linkedGiteaPR: TriStateLinkedReviewNumber,
  isArchived: OptionalBoolean,
  isUnread: OptionalBoolean,
  isPinned: OptionalBoolean,
  sortOrder: OptionalFiniteNumber,
  manualOrder: OptionalFiniteNumber,
  lastActivityAt: OptionalFiniteNumber,
  createdAt: OptionalFiniteNumber,
  sparseDirectories: z.array(z.string()).optional(),
  sparseBaseRef: OptionalString,
  sparsePresetId: OptionalString,
  baseRef: OptionalString,
  workspaceStatus: OptionalString,
  pushTarget: z
    .object({
      remoteName: z.string(),
      branchName: z.string(),
      remoteUrl: OptionalString
    })
    .nullable()
    .optional(),
  diffComments: z.array(z.unknown()).optional(),
  mobileDiffReview: z.unknown().optional(),
  parentWorktree: OptionalString,
  noParent: OptionalBoolean
}).superRefine((params, context) => {
  if (params.parentWorktree && params.noParent === true) {
    context.addIssue({
      code: 'custom',
      message: 'Choose either --parent-worktree or --no-parent, not both.'
    })
  }
})

export const WorktreeRemoveInputSchema = WorktreeSelectorInputSchema.extend({
  force: OptionalBoolean,
  runHooks: OptionalBoolean
})

export const WorktreeForceDeleteBranchInputSchema = WorktreeSelectorInputSchema.extend({
  branchName: z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string().min(1, 'Missing branch name')),
  expectedHead: z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string().min(1, 'Missing expected branch head'))
})

export const WorktreeResolvePrBaseInputSchema = z.object({
  repo: RepoSelectorSchema,
  prNumber: z
    .unknown()
    .transform((value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0))
    .pipe(z.number().int().positive('Missing PR number')),
  headRefName: OptionalString,
  baseRefName: OptionalString,
  isCrossRepository: OptionalBoolean
})

export const WorktreeResolveMrBaseInputSchema = z.object({
  repo: RepoSelectorSchema,
  mrIid: z
    .unknown()
    .transform((value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0))
    .pipe(z.number().int().positive('Missing MR number')),
  sourceBranch: OptionalString,
  targetBranch: OptionalString,
  isCrossRepository: OptionalBoolean
})

export type WorktreeListInput = z.infer<typeof WorktreeListInputSchema>
export type WorktreeDetectedListInput = z.infer<typeof WorktreeDetectedListInputSchema>
export type WorktreePsInput = z.infer<typeof WorktreePsInputSchema>
export type WorktreeSortOrderInput = z.infer<typeof WorktreeSortOrderInputSchema>
export type WorktreeSelectorInput = z.infer<typeof WorktreeSelectorInputSchema>
export type WorktreeActivateInput = z.infer<typeof WorktreeActivateInputSchema>
export type WorktreeCreateInput = z.infer<typeof WorktreeCreateInputSchema>
export type WorktreePrefetchCreateBaseInput = z.infer<typeof WorktreePrefetchCreateBaseInputSchema>
export type WorktreeSetInput = z.infer<typeof WorktreeSetInputSchema>
export type WorktreeRemoveInput = z.infer<typeof WorktreeRemoveInputSchema>
export type WorktreeForceDeleteBranchInput = z.infer<typeof WorktreeForceDeleteBranchInputSchema>
export type WorktreeResolvePrBaseInput = z.infer<typeof WorktreeResolvePrBaseInputSchema>
export type WorktreeResolveMrBaseInput = z.infer<typeof WorktreeResolveMrBaseInputSchema>
