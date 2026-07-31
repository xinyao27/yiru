import {
  isPositiveHostedReviewNumber,
  type HostedReviewProvider
} from '@yiru/workbench-model/review'
import React from 'react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  localizedHostedReviewCopy,
  resolveSupportedHostedReviewCopyProvider
} from '@/i18n/hosted-review-localized-copy'
import { translate } from '@/i18n/i18n'
import { getWorktreeGitIdentityDisplay } from '@/lib/worktree-git-identity-display'
import { useAppStore } from '@/store'
import { useActiveWorktree, useRepoById } from '@/store/selectors'
import { getGitHubPRCacheKey } from '@/store/slices/github-cache-key'
import { getHostedReviewCacheKey } from '@/store/slices/hosted-review'

import type { GitStatusEntry, Worktree } from '../../../../../../shared/types'
import ChecksPanel from '../../checks-panel'
import {
  LOCAL_RIGHT_SIDEBAR_PANEL_SOURCE,
  type RightSidebarPanelSource
} from '../../right-sidebar-panel-source'
import SourceControl from '../../source-control'
import { DiffLineCounts } from '../entry-details'
import type { SourceControlPanelView } from './state'

type SourceControlWorkspacePanelProps = {
  source?: RightSidebarPanelSource
  isVisible?: boolean
  workspacePanelTabId?: string
  view?: SourceControlPanelView
  onViewChange?: (view: SourceControlPanelView) => void
}

type ReviewTabDetails = {
  provider: HostedReviewProvider
  number: number
}

type ChangeLineCounts = {
  added: number
  removed: number
}

export default function SourceControlWorkspacePanel({
  source = LOCAL_RIGHT_SIDEBAR_PANEL_SOURCE,
  isVisible = true,
  workspacePanelTabId,
  view: controlledView,
  onViewChange
}: SourceControlWorkspacePanelProps): React.JSX.Element {
  const storedView = useAppStore((state) =>
    workspacePanelTabId ? state.sourceControlPanelViewByTab[workspacePanelTabId] : undefined
  )
  const setStoredView = useAppStore((state) => state.setSourceControlPanelView)
  const view = controlledView ?? storedView ?? 'changes'
  const { changeLineCounts, reviewDetails } = useSourceControlTabDetails(source)

  const handleViewChange = (value: string): void => {
    if (value !== 'changes' && value !== 'review') {
      return
    }
    if (onViewChange) {
      onViewChange(value)
      return
    }
    if (workspacePanelTabId) {
      setStoredView(workspacePanelTabId, value)
    }
  }

  return (
    <Tabs value={view} onValueChange={handleViewChange} className="h-full min-h-0 gap-0">
      <div className="border-border shrink-0 border-b p-2">
        <TabsList
          aria-label={translate(
            'auto.components.workspace.panel.source.control.workspace.panel.views',
            'Changes and review'
          )}
        >
          <TabsTrigger value="changes">
            <span>
              {translate(
                'auto.components.workspace.panel.source.control.workspace.panel.changes',
                'Changes'
              )}
            </span>
            {changeLineCounts ? <DiffLineCounts {...changeLineCounts} /> : null}
          </TabsTrigger>
          <TabsTrigger value="review">
            <span>
              {reviewDetails
                ? formatReviewTabLabel(reviewDetails)
                : translate(
                    'auto.components.workspace.panel.source.control.workspace.panel.review',
                    'Review'
                  )}
            </span>
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="changes" className="min-h-0 overflow-hidden">
        <SourceControl
          source={source}
          isVisible={isVisible && view === 'changes'}
          workspacePanelTabId={workspacePanelTabId}
        />
      </TabsContent>
      <TabsContent value="review" className="min-h-0 overflow-hidden">
        <ChecksPanel
          source={source}
          isVisible={isVisible && view === 'review'}
          workspacePanelTabId={workspacePanelTabId}
        />
      </TabsContent>
    </Tabs>
  )
}

function useSourceControlTabDetails(source: RightSidebarPanelSource): {
  changeLineCounts: ChangeLineCounts | null
  reviewDetails: ReviewTabDetails | null
} {
  const activeWorktree = useActiveWorktree()
  const activeWorktreeId = activeWorktree?.id ?? null
  const entries = useAppStore((state) =>
    activeWorktreeId ? state.gitStatusByWorktree[activeWorktreeId] : undefined
  )
  const activeRepo = useRepoById(activeWorktree?.repoId ?? null)
  const settings = useAppStore((state) => state.settings)
  const gitIdentity = activeWorktree ? getWorktreeGitIdentityDisplay(activeWorktree) : null
  const branch = gitIdentity?.kind === 'branch' ? gitIdentity.branchName : ''
  const hostedReviewCacheKey =
    activeRepo && branch
      ? getHostedReviewCacheKey(
          activeRepo.path,
          branch,
          settings,
          activeRepo.id,
          activeRepo.connectionId,
          activeRepo.executionHostId,
          true
        )
      : null
  const githubReviewCacheKey =
    activeRepo && branch
      ? getGitHubPRCacheKey(
          activeRepo.path,
          activeRepo.id,
          branch,
          settings,
          activeRepo.connectionId,
          activeRepo.executionHostId,
          true
        )
      : null
  const hostedReview = useAppStore((state) =>
    hostedReviewCacheKey ? (state.hostedReviewCache[hostedReviewCacheKey]?.data ?? null) : null
  )
  const githubReview = useAppStore((state) =>
    githubReviewCacheKey ? (state.prCache[githubReviewCacheKey]?.data ?? null) : null
  )

  if (source.kind === 'coworking') {
    const review = source.checksState.result?.review
    return {
      changeLineCounts: null,
      reviewDetails:
        review && isPositiveHostedReviewNumber(review.number)
          ? { provider: review.provider, number: review.number }
          : null
    }
  }

  return {
    changeLineCounts: summarizeChangeLines(entries),
    reviewDetails: resolveLocalReviewDetails(activeWorktree, hostedReview, githubReview)
  }
}

function summarizeChangeLines(
  entries: readonly GitStatusEntry[] | undefined
): ChangeLineCounts | null {
  if (!entries) {
    return null
  }
  let added = 0
  let removed = 0
  for (const entry of entries) {
    added += entry.added ?? 0
    removed += entry.removed ?? 0
  }
  return added > 0 || removed > 0 ? { added, removed } : null
}

function resolveLocalReviewDetails(
  worktree: Worktree | null,
  hostedReview: ReviewTabDetails | null,
  githubReview: { number: number } | null
): ReviewTabDetails | null {
  if (hostedReview?.provider === 'gitlab' && isPositiveHostedReviewNumber(hostedReview.number)) {
    return hostedReview
  }
  const linkedReview = resolveLinkedReviewDetails(worktree)
  if (linkedReview && linkedReview.provider !== 'github') {
    return linkedReview
  }
  if (githubReview && isPositiveHostedReviewNumber(githubReview.number)) {
    return { provider: 'github', number: githubReview.number }
  }
  if (hostedReview && isPositiveHostedReviewNumber(hostedReview.number)) {
    return hostedReview
  }
  return linkedReview
}

function resolveLinkedReviewDetails(worktree: Worktree | null): ReviewTabDetails | null {
  if (!worktree) {
    return null
  }
  const linkedReviews: readonly ReviewTabDetails[] = [
    { provider: 'gitlab', number: worktree.linkedGitLabMR ?? 0 },
    { provider: 'bitbucket', number: worktree.linkedBitbucketPR ?? 0 },
    { provider: 'azure-devops', number: worktree.linkedAzureDevOpsPR ?? 0 },
    { provider: 'gitea', number: worktree.linkedGiteaPR ?? 0 },
    { provider: 'github', number: worktree.linkedPR ?? 0 }
  ]
  return linkedReviews.find((review) => isPositiveHostedReviewNumber(review.number)) ?? null
}

function formatReviewTabLabel(review: ReviewTabDetails): string {
  const copy = localizedHostedReviewCopy(resolveSupportedHostedReviewCopyProvider(review.provider))
  return review.provider === 'gitlab'
    ? translate(
        'auto.components.workspace.panel.source.control.workspace.panel.mergeRequestNumber',
        '{{value0}} !{{value1}}',
        { value0: copy.shortLabel, value1: review.number }
      )
    : translate(
        'auto.components.workspace.panel.source.control.workspace.panel.pullRequestNumber',
        '{{value0}} #{{value1}}',
        { value0: copy.shortLabel, value1: review.number }
      )
}
