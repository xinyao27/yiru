import type { HostedReviewCreationEligibility } from '@yiru/workbench-model/review'

import type { PRCommentGroup } from '@/lib/pr-comment-groups'

import type { SourceControlLaunchActionId } from '../../../../shared/source-control-ai-actions'
import type { ChecksPanelReview } from './checks-panel-review'

export const RUNTIME_SSH_STATUS_REFRESH_MS = 3000
export const GIT_STATUS_FAILURE_RETRY_MS = 3000

export type HostedReviewCreationSnapshot = {
  requestKey: string
  repoId: string
  worktreeId: string | null
  branch: string
  data: HostedReviewCreationEligibility
}

export type ChecksAgentComposerState = {
  actionId: SourceControlLaunchActionId
  title: string
  description: string
  prompt: string
  launchSource: 'conflict_resolution' | 'task_page'
  commentResolution?: {
    reviewContextKey: string
    provider: ChecksPanelReview['provider']
    selectedThreadIds: string[]
    selectedGroups: PRCommentGroup[]
  }
}
