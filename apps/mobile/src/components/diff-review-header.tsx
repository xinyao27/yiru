import { FlatList, Pressable, Text, View } from 'react-native'

import { cn } from '@/style/class-names'

import type { MobileDiffReviewQueueFilter } from '../session/diff/review-queue'
import { REVIEW_FILTERS, mobileReviewCountLabel } from '../session/diff/review-screen-model'
import { mobileDiffReviewStyles as styles } from './diff-review-screen-styles'

type Props = {
  filter: MobileDiffReviewQueueFilter
  queueLength: number
  reviewedCount: number
  unsentCount: number
  onSelectFilter: (filter: MobileDiffReviewQueueFilter) => void
}

export function MobileDiffReviewHeader({
  filter,
  queueLength,
  reviewedCount,
  unsentCount,
  onSelectFilter
}: Props) {
  return (
    <View className="border-b-hairline border-b-border px-4 pt-2 pb-2">
      <View className="flex-row justify-between gap-3">
        <Text className={styles.progressText}>
          {reviewedCount}/{queueLength} reviewed
        </Text>
        <Text className={styles.progressText}>
          {mobileReviewCountLabel(unsentCount, 'unsent note', 'unsent notes')}
        </Text>
      </View>
      <FlatList
        data={REVIEW_FILTERS}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item}
        contentContainerClassName="gap-2 pt-3 pb-1"
        renderItem={({ item }) => (
          <Pressable
            className={cn(
              'border-hairline border-border bg-card min-h-9 items-center justify-center rounded-full px-3',
              filter === item && 'border-border bg-accent',
              'active:bg-accent'
            )}
            onPress={() => onSelectFilter(item)}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === item }}
            accessibilityLabel={`Show ${item} review files`}
          >
            <Text
              className={cn(
                'text-muted-foreground text-xs font-bold',
                filter === item && 'text-accent-foreground'
              )}
            >
              {item === 'all' ? 'All' : item[0]?.toUpperCase() + item.slice(1)}
            </Text>
          </Pressable>
        )}
      />
    </View>
  )
}
