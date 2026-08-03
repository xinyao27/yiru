import { FlatList, Text, View } from 'react-native'

import { MobileGlassGroup } from '~/components/glass/group'
import { MobileGlassPressable } from '~/components/glass/pressable'
import { translate } from '~/i18n/translate'
import { REVIEW_FILTERS, mobileReviewCountLabel } from '~/session/diff/review-screen-model'
import { cn } from '~/style/class-names'

import { mobileReviewFilterLabel } from './filter-label'
import type { MobileDiffReviewHeaderProps } from './header-props'
import { mobileDiffReviewStyles as styles } from './screen-styles'

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
          {translate('mobile.review.progress.reviewed', '{{reviewed}}/{{total}} reviewed', {
            reviewed: reviewedCount,
            total: queueLength
          })}
        </Text>
        <Text className={styles.progressText}>
          {mobileReviewCountLabel(
            unsentCount,
            translate('mobile.review.progress.unsentNote', 'unsent note'),
            translate('mobile.review.progress.unsentNotes', 'unsent notes')
          )}
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
              accessibilityLabel={translate(
                'mobile.review.filters.show',
                'Show {{filter}} review files',
                { filter: mobileReviewFilterLabel(item) }
              )}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === item }}
              className="rounded-full"
              contentClassName="items-center justify-center rounded-full px-3"
              isSelected={filter === item}
              onPress={() => onSelectFilter(item)}
              size="small"
            >
              <Text
                className={cn(
                  'text-sm',
                  filter === item ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {mobileReviewFilterLabel(item)}
              </Text>
            </MobileGlassPressable>
          )}
        />
      </MobileGlassGroup>
    </View>
  )
}
