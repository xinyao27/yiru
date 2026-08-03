import type { MobileDiffReviewQueueItem } from '~/session/diff/review-queue'
import type { GitMutationMethod } from '~/session/diff/review-screen-model'

export type MobileDiffReviewFooterProps = {
  busyAction: string | null
  item: MobileDiffReviewQueueItem
  onAddFileNote: () => void
  onDiscard: (item: MobileDiffReviewQueueItem) => void
  onGitMutation: (method: GitMutationMethod, item: MobileDiffReviewQueueItem) => void
  onMarkReviewed: () => void
  onMoveFile: (direction: 'next' | 'previous') => void
}
