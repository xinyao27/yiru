import { ActionSheetIOS, Text, View } from 'react-native'

import { MobileSwiftUiGlassAccessoryButton } from '@/components/glass/swift-ui.ios'

import type { MobileDiffReviewQueueFilter } from '../session/diff/review-queue'
import { REVIEW_FILTERS, mobileReviewCountLabel } from '../session/diff/review-screen-model'
import type { MobileDiffReviewHeaderProps } from './diff-review-header-props'
import { mobileDiffReviewStyles as styles } from './diff-review-screen-styles'

function filterLabel(filter: MobileDiffReviewQueueFilter): string {
  return filter === 'all' ? 'All' : filter[0].toUpperCase() + filter.slice(1)
}

function showFilterActions(
  filter: MobileDiffReviewQueueFilter,
  onSelectFilter: (filter: MobileDiffReviewQueueFilter) => void
): void {
  const cancelButtonIndex = REVIEW_FILTERS.length
  ActionSheetIOS.showActionSheetWithOptions(
    {
      cancelButtonIndex,
      options: [...REVIEW_FILTERS.map(filterLabel), 'Cancel'],
      title: `Filter review files · ${filterLabel(filter)}`
    },
    (selectedIndex) => {
      const selected = REVIEW_FILTERS[selectedIndex]
      if (selected) {
        onSelectFilter(selected)
      }
    }
  )
}

export function MobileDiffReviewHeader({
  filter,
  queueLength,
  reviewedCount,
  unsentCount,
  onSelectFilter
}: MobileDiffReviewHeaderProps): React.JSX.Element {
  return (
    <View className="px-3 py-2">
      <View className="flex-row justify-between gap-3">
        <Text className={styles.progressText}>
          {reviewedCount}/{queueLength} reviewed
        </Text>
        <Text className={styles.progressText}>
          {mobileReviewCountLabel(unsentCount, 'unsent note', 'unsent notes')}
        </Text>
      </View>
      <View className="mt-3 self-start">
        <MobileSwiftUiGlassAccessoryButton
          accessibilityLabel={`Filter review files. ${filterLabel(filter)} selected`}
          label={`Filter · ${filterLabel(filter)}`}
          onPress={() => showFilterActions(filter, onSelectFilter)}
          shape="capsule"
          size="regular"
        />
      </View>
    </View>
  )
}
