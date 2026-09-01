import { z } from 'zod'

import type { GitHubListWorkItemsInputSchema } from '../contract/github-inputs.js' with {
  'resolution-mode': 'import'
}
import type { GitHubListWorkItemsResult } from '../contract/github.js' with {
  'resolution-mode': 'import'
}
import type { GitLabListMrsInputSchema } from '../contract/gitlab-inputs.js' with {
  'resolution-mode': 'import'
}
import type { PreflightStatus } from '../contract/preflight.js' with {
  'resolution-mode': 'import'
}
import type {
  RuntimeRepoBaseRefDefaultResult,
  RuntimeRepoHooksResult,
  RuntimeRepoSearchRefsResult
} from '../contract/repo-types.js' with { 'resolution-mode': 'import' }
import type { RepoBaseRefDefaultInput, RepoSearchRefsInput } from '../contract/repo.js' with {
  'resolution-mode': 'import'
}
import type { UIUpdateInput } from '../contract/ui-input.js' with { 'resolution-mode': 'import' }
import type { RuntimeUIResult } from '../contract/ui-types.js' with { 'resolution-mode': 'import' }
import type {
  WorktreeResolveMrBaseInput,
  WorktreeResolvePrBaseInput
} from '../contract/worktree-input.js' with { 'resolution-mode': 'import' }
import type {
  RuntimeWorktreeMrBaseResult,
  RuntimeWorktreePrBaseResult
} from '../contract/worktree-types.js' with { 'resolution-mode': 'import' }
import type { ListMergeRequestsResult } from '../model/review.js' with {
  'resolution-mode': 'import'
}

export const MOBILE_REPO_BASE_REF_DEFAULT_ORPC_PATH = '/repo/baseRefDefault'
export const MOBILE_REPO_SEARCH_REFS_ORPC_PATH = '/repo/searchRefs'
export const MOBILE_REPO_HOOKS_ORPC_PATH = '/repo/hooks'
export const MOBILE_UI_GET_ORPC_PATH = '/ui/get'
export const MOBILE_UI_SET_ORPC_PATH = '/ui/set'
export const MOBILE_WORKTREE_RESOLVE_PR_BASE_ORPC_PATH = '/worktree/resolvePrBase'
export const MOBILE_WORKTREE_RESOLVE_MR_BASE_ORPC_PATH = '/worktree/resolveMrBase'
export const MOBILE_GITHUB_LIST_WORK_ITEMS_ORPC_PATH = '/github/listWorkItems'
export const MOBILE_GITHUB_WORK_ITEM_ORPC_PATH = '/github/workItem'
export const MOBILE_GITHUB_WORK_ITEM_BY_OWNER_REPO_ORPC_PATH = '/github/workItemByOwnerRepo'
export const MOBILE_GITHUB_REPO_SLUG_ORPC_PATH = '/github/repoSlug'
export const MOBILE_GITLAB_LIST_MRS_ORPC_PATH = '/gitlab/listMRs'
export const MOBILE_GITLAB_WORK_ITEM_BY_PATH_ORPC_PATH = '/gitlab/workItemByPath'
export const MOBILE_PREFLIGHT_CHECK_ORPC_PATH = '/preflight/check'

export const MobileRepoSelectorRequestSchema = z.object({ repo: z.string().min(1) })

export const MobileRepoBaseRefDefaultRequestSchema = MobileRepoSelectorRequestSchema

export const MobileRepoBaseRefDefaultResultSchema = z.object({
  defaultBaseRef: z.string().nullable(),
  remoteCount: z.number().int().nonnegative()
})

export const MobileRepoSearchRefsRequestSchema = MobileRepoSelectorRequestSchema.extend({
  query: z.string(),
  limit: z.number().int().positive().optional()
})

export const MobileRepoRefDetailSchema = z.object({
  refName: z.string(),
  localBranchName: z.string()
})

export const MobileRepoSearchRefsResultSchema = z.object({
  refs: z.array(z.string()),
  refDetails: z.array(MobileRepoRefDetailSchema).optional(),
  truncated: z.boolean()
})

export const MobileRepoHooksResultSchema = z.object({
  hooks: z.object({ scripts: z.object({ setup: z.string().optional() }) }).nullable(),
  setupRunPolicy: z.enum(['ask', 'run-by-default', 'skip-by-default']),
  source: z.enum(['yiru.yaml', 'legacy']).nullable(),
  setupTrust: z.object({ contentHash: z.string(), scriptContent: z.string() }).optional()
})

const MobileTrustedYiruHookEntrySchema = z.object({
  contentHash: z.string(),
  approvedAt: z.number().finite()
})

const MobileTrustedYiruHookRepoSchema = z.object({
  all: z.object({ approvedAt: z.number().finite() }).optional(),
  setup: MobileTrustedYiruHookEntrySchema.optional(),
  archive: MobileTrustedYiruHookEntrySchema.optional()
})

const MobileTrustedYiruHooksSchema = z.record(z.string(), MobileTrustedYiruHookRepoSchema)

export const MobileWorkspaceUIResultSchema = z.object({
  ui: z.object({ trustedYiruHooks: MobileTrustedYiruHooksSchema.optional() })
})

export const MobileWorkspaceUISetRequestSchema = z.object({
  trustedYiruHooks: MobileTrustedYiruHooksSchema
})

const MobileGitPushTargetSchema = z.object({
  remoteName: z.string(),
  branchName: z.string(),
  remoteUrl: z.string().optional(),
  remoteCreated: z.boolean().optional()
})

export const MobileWorkspaceResolvePrBaseRequestSchema = z.object({
  repo: z.string().min(1),
  prNumber: z.number().int().positive(),
  headRefName: z.string().min(1).optional(),
  baseRefName: z.string().min(1).optional(),
  isCrossRepository: z.boolean().optional()
})

export const MobileWorkspaceResolveMrBaseRequestSchema = z.object({
  repo: z.string().min(1),
  mrIid: z.number().int().positive(),
  sourceBranch: z.string().min(1).optional(),
  targetBranch: z.string().min(1).optional(),
  isCrossRepository: z.boolean().optional()
})

export const MobileWorkspaceHostedBaseResultSchema = z.union([
  z.object({ error: z.string() }),
  z.object({
    baseBranch: z.string(),
    compareBaseRef: z.string().optional(),
    pushTarget: MobileGitPushTargetSchema.optional(),
    headSha: z.string().optional(),
    branchNameOverride: z.string().optional(),
    maintainerCanModify: z.boolean().optional()
  })
])

export const MobileWorkspaceSourceItemSchema = z.object({
  id: z.string(),
  type: z.enum(['pr', 'mr']),
  number: z.number().int().positive(),
  title: z.string(),
  state: z.string(),
  url: z.string(),
  branchName: z.string().optional(),
  baseRefName: z.string().optional(),
  isCrossRepository: z.boolean().optional()
})

export const MobileGitHubWorkItemsRequestSchema = z.object({
  repo: z.string().min(1),
  limit: z.number().int().positive().optional(),
  query: z.string().min(1).optional()
})

export const MobileGitHubWorkItemsResultSchema = z.object({
  items: z.array(MobileWorkspaceSourceItemSchema),
  source: z.object({ owner: z.string(), repo: z.string() }).nullable()
})

export const MobileGitHubWorkItemRequestSchema = z.object({
  repo: z.string().min(1),
  number: z.number().int().positive(),
  type: z.literal('pr').optional()
})

export const MobileGitHubWorkItemByOwnerRepoRequestSchema = z.object({
  repo: z.string().min(1),
  owner: z.string().min(1),
  ownerRepo: z.string().min(1),
  number: z.number().int().positive(),
  type: z.literal('pr')
})

export const MobileGitHubRepoSlugRequestSchema = z.object({ repo: z.string().min(1) })
export const MobileGitHubRepoSlugResultSchema = z
  .object({ owner: z.string(), repo: z.string() })
  .nullable()

export const MobileGitLabMergeRequestsRequestSchema = z.object({
  repo: z.string().min(1),
  state: z.enum(['opened', 'merged', 'closed', 'all']).optional(),
  page: z.number().int().positive().optional(),
  perPage: z.number().int().positive().optional(),
  query: z.string().min(1).optional()
})

export const MobileGitLabMergeRequestsResultSchema = z.object({
  items: z.array(MobileWorkspaceSourceItemSchema),
  error: z
    .object({
      type: z.enum([
        'permission_denied',
        'not_found',
        'validation_error',
        'rate_limited',
        'network_error',
        'unknown'
      ]),
      message: z.string()
    })
    .optional()
})

export const MobileGitLabWorkItemByPathRequestSchema = z.object({
  repo: z.string().min(1),
  host: z.string().min(1),
  path: z.string().min(1),
  iid: z.number().int().positive(),
  type: z.literal('mr')
})

export const MobileWorkspaceSourceItemResultSchema = MobileWorkspaceSourceItemSchema.nullable()

export const MobileWorkspacePreflightSchema = z.object({
  glab: z.object({ installed: z.boolean() }).optional()
})

export const MOBILE_REPO_BASE_REF_DEFAULT_REQUEST_WIRE_IS_COMPATIBLE: z.infer<
  typeof MobileRepoBaseRefDefaultRequestSchema
> extends RepoBaseRefDefaultInput
  ? true
  : false = true

export const MOBILE_REPO_BASE_REF_DEFAULT_RESULT_WIRE_IS_COMPATIBLE: RuntimeRepoBaseRefDefaultResult extends z.infer<
  typeof MobileRepoBaseRefDefaultResultSchema
>
  ? true
  : false = true

export const MOBILE_REPO_SEARCH_REFS_REQUEST_WIRE_IS_COMPATIBLE: z.infer<
  typeof MobileRepoSearchRefsRequestSchema
> extends RepoSearchRefsInput
  ? true
  : false = true

export const MOBILE_REPO_SEARCH_REFS_RESULT_WIRE_IS_COMPATIBLE: RuntimeRepoSearchRefsResult extends z.infer<
  typeof MobileRepoSearchRefsResultSchema
>
  ? true
  : false = true

export const MOBILE_REPO_HOOKS_RESULT_WIRE_IS_COMPATIBLE: RuntimeRepoHooksResult extends z.infer<
  typeof MobileRepoHooksResultSchema
>
  ? true
  : false = true

export const MOBILE_UI_GET_WIRE_IS_COMPATIBLE: RuntimeUIResult extends z.infer<
  typeof MobileWorkspaceUIResultSchema
>
  ? true
  : false = true

export const MOBILE_UI_SET_REQUEST_WIRE_IS_COMPATIBLE: z.infer<
  typeof MobileWorkspaceUISetRequestSchema
> extends UIUpdateInput
  ? true
  : false = true

export const MOBILE_RESOLVE_PR_BASE_REQUEST_WIRE_IS_COMPATIBLE: z.infer<
  typeof MobileWorkspaceResolvePrBaseRequestSchema
> extends WorktreeResolvePrBaseInput
  ? true
  : false = true

export const MOBILE_RESOLVE_MR_BASE_REQUEST_WIRE_IS_COMPATIBLE: z.infer<
  typeof MobileWorkspaceResolveMrBaseRequestSchema
> extends WorktreeResolveMrBaseInput
  ? true
  : false = true

export const MOBILE_RESOLVE_PR_BASE_RESULT_WIRE_IS_COMPATIBLE: RuntimeWorktreePrBaseResult extends z.infer<
  typeof MobileWorkspaceHostedBaseResultSchema
>
  ? true
  : false = true

export const MOBILE_RESOLVE_MR_BASE_RESULT_WIRE_IS_COMPATIBLE: RuntimeWorktreeMrBaseResult extends z.infer<
  typeof MobileWorkspaceHostedBaseResultSchema
>
  ? true
  : false = true

export const MOBILE_GITHUB_WORK_ITEMS_REQUEST_WIRE_IS_COMPATIBLE: z.infer<
  typeof MobileGitHubWorkItemsRequestSchema
> extends z.output<typeof GitHubListWorkItemsInputSchema>
  ? true
  : false = true

export const MOBILE_GITHUB_WORK_ITEMS_RESULT_WIRE_IS_COMPATIBLE: GitHubListWorkItemsResult extends z.infer<
  typeof MobileGitHubWorkItemsResultSchema
>
  ? true
  : false = true

export const MOBILE_GITLAB_MRS_REQUEST_WIRE_IS_COMPATIBLE: z.infer<
  typeof MobileGitLabMergeRequestsRequestSchema
> extends z.output<typeof GitLabListMrsInputSchema>
  ? true
  : false = true

export const MOBILE_GITLAB_MRS_RESULT_WIRE_IS_COMPATIBLE: ListMergeRequestsResult extends z.infer<
  typeof MobileGitLabMergeRequestsResultSchema
>
  ? true
  : false = true

export const MOBILE_WORKSPACE_PREFLIGHT_WIRE_IS_COMPATIBLE: PreflightStatus extends z.infer<
  typeof MobileWorkspacePreflightSchema
>
  ? true
  : false = true
