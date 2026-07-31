import { FlatList, Text, View } from 'react-native'

import { MobileGlassGroup } from '~/components/glass/group'
import { MobileGlassPressable } from '~/components/glass/pressable'
import { REVIEW_FILTERS, mobileReviewCountLabel } from '~/session/diff/review-screen-model'
import { cn } from '~/style/class-names'

import type { MobileDiffReviewHeaderProps } from './header-props'
import { mobileDiffReviewStyles as styles } from './screen-styles'

export function MobileDiffReviewHeader({
  filter,
  queueLength,
  reviewedCount,
  unsentCount,
  onSelectFilter
}: MobileDiffReviewHeaderProps) {
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
      <MobileGlassGroup className="mt-3" spacing={8}>
        <FlatList
          data={REVIEW_FILTERS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item}
          contentContainerClassName="gap-2"
          renderItem={({ item }) => (
            <MobileGlassPressable
              accessibilityLabel={`Show ${item} review files`}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === item }}
              className="rounded-full"
              contentClassName="min-h-8 items-center justify-center rounded-full px-3"
              hitSlop={6}
              onPress={() => onSelectFilter(item)}
              tintColorClassName={filter === item ? 'accent-secondary' : undefined}
            >
              <Text
                className={cn(
                  'text-sm',
                  filter === item ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {item === 'all' ? 'All' : item[0]?.toUpperCase() + item.slice(1)}
              </Text>
            </MobileGlassPressable>
          )}
        />
      </MobileGlassGroup>
    </View>
  )
}
