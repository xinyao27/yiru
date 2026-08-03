import type { MobileDiffReviewQueueFilter } from '~/session/diff/review-queue'

export type MobileDiffReviewHeaderProps = {
  filter: MobileDiffReviewQueueFilter
  onSelectFilter: (filter: MobileDiffReviewQueueFilter) => void
  queueLength: number
  reviewedCount: number
  unsentCount: number
}
