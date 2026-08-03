import { Button, Menu } from '@expo/ui/swift-ui'
import {
  accessibilityAddTraits,
  accessibilityLabel,
  accessibilityValue,
  buttonBorderShape,
  controlSize,
  frame,
  type ViewModifier
} from '@expo/ui/swift-ui/modifiers'
import { useMemo } from 'react'
import { Text, View } from 'react-native'

import { ExpoUiHost } from '~/components/expo-ui-host'
import { useMobileGlassAvailable } from '~/components/glass/availability'
import { mobileSwiftUiGlassButtonStyle } from '~/components/glass/swift-ui-button.ios'
import { translate } from '~/i18n/translate'
import { REVIEW_FILTERS, mobileReviewCountLabel } from '~/session/diff/review-screen-model'

import { mobileReviewFilterLabel } from './filter-label'
import type { MobileDiffReviewHeaderProps } from './header-props'
import { mobileDiffReviewStyles as styles } from './screen-styles'

const SELECTED_FILTER_MODIFIERS = [accessibilityAddTraits(['isSelected'])]

export function MobileDiffReviewHeader({
  filter,
  queueLength,
  reviewedCount,
  unsentCount,
  onSelectFilter
}: MobileDiffReviewHeaderProps): React.JSX.Element {
  const isGlassAvailable = useMobileGlassAvailable()
  const selectedFilterLabel = mobileReviewFilterLabel(filter)
  const menuLabel = translate('mobile.review.filters.button', 'Filter · {{filter}}', {
    filter: selectedFilterLabel
  })
  const menuModifiers = useMemo<ViewModifier[]>(
    () => [
      controlSize('regular'),
      mobileSwiftUiGlassButtonStyle(isGlassAvailable),
      buttonBorderShape('capsule'),
      frame({ minWidth: 44, minHeight: 44, alignment: 'center' }),
      accessibilityLabel(
        translate('mobile.review.filters.accessibilityLabel', 'Filter review files')
      ),
      accessibilityValue(
        translate('mobile.review.filters.selectedValue', '{{filter}} selected', {
          filter: selectedFilterLabel
        })
      )
    ],
    [isGlassAvailable, selectedFilterLabel]
  )

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
      <View className="mt-3 min-h-11 justify-center self-start">
        <ExpoUiHost>
          <Menu
            label={menuLabel}
            systemImage="line.3.horizontal.decrease"
            modifiers={menuModifiers}
          >
            {REVIEW_FILTERS.map((option) => (
              <Button
                key={option}
                label={mobileReviewFilterLabel(option)}
                systemImage={filter === option ? 'checkmark' : undefined}
                modifiers={filter === option ? SELECTED_FILTER_MODIFIERS : undefined}
                onPress={() => onSelectFilter(option)}
              />
            ))}
          </Menu>
        </ExpoUiHost>
      </View>
    </View>
  )
}
