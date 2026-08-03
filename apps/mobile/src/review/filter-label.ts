import { translate } from '~/i18n/translate'
import type { MobileDiffReviewQueueFilter } from '~/session/diff/review-queue'

export function mobileReviewFilterLabel(filter: MobileDiffReviewQueueFilter): string {
  switch (filter) {
    case 'all':
      return translate('mobile.review.filters.all', 'All')
    case 'unreviewed':
      return translate('mobile.review.filters.unreviewed', 'Unreviewed')
    case 'notes':
      return translate('mobile.review.filters.notes', 'Notes')
    case 'unstaged':
      return translate('mobile.review.filters.unstaged', 'Unstaged')
    case 'staged':
      return translate('mobile.review.filters.staged', 'Staged')
    case 'branch':
      return translate('mobile.review.filters.branch', 'Branch')
  }
}
