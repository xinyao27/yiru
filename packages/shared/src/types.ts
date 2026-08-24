// Why: this compatibility façade preserves the historic ~shared/types import
// surface while domain modules own the actual declarations.
export type { WorkspaceSource as WorkspaceCreateTelemetrySource } from './workspace/source'
export type {
  GitBranchChangeStatus,
  GitConflictKind,
  GitConflictOperation,
  GitConflictResolutionStatus,
  GitConflictStatusSource,
  GitFileStatus,
  GitStagingArea,
  GitStatusEntry,
  GitStatusResult,
  GitSubmoduleStatus,
  GitUncommittedEntry,
  GitUpstreamStatus
} from '@yiru/workbench-model/review'
export type * from './project-types'
export type * from './repository-workspace-types'
export type * from './worktree-types'
export type * from './tab-types'
export type * from './workspace-session-types'
export type {
  GitLabAssignableUser,
  GitLabAuthDiagnostic,
  GitLabCommentResult,
  GitLabDiscussionResolveResult,
  GitLabJobTraceResult,
  GitLabRateLimitBucket,
  GitLabRateLimitSnapshot,
  GitLabMRApprovalRule,
  GitLabMRApprovalState,
  GitLabMRFile,
  GitLabMRInlineCommentInput,
  GitLabMRReviewersUpdateResult,
  GitLabMRUpdate,
  GitLabPagedResult,
  GitLabPipelineJob,
  GitLabProjectRef,
  GitLabRetryJobResult,
  GitLabReaction,
  GitLabViewer,
  GitLabWorkItem,
  GitLabWorkItemDetails,
  GetGitLabRateLimitResult,
  ListMergeRequestsResult,
  MRCheckDetail,
  MRComment,
  MRInfo,
  MRListState,
  MRMergeableState,
  MRState
} from '@yiru/workbench-model/review'
export type * from './github-review-types'
export type * from './worktree-operation-types'
export type {
  ChangelogData,
  ChangelogRelease,
  UpdateCheckOptions,
  UpdateStatus
} from '@yiru/runtime-protocol/updater'
export type * from './settings-foundation-types'
export type { GlobalSettings } from './global-settings'
export type * from './settings-model'
export type * from './onboarding-notification-types'
export type * from './ui-state-types'
export type * from './persisted-state-types'
export type * from './runtime-data-types'
