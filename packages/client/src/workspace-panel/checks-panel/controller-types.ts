import type { HostedReviewCreationEligibility } from '@yiru/runtime-protocol/model/review'
import type { SourceControlLaunchActionId } from '@yiru/runtime-protocol/workbench/source-control/ai-actions'
import type { PRCommentGroup } from '~renderer/source-control/pr-comment-groups'

import type { ChecksPanelReview } from './review'

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
