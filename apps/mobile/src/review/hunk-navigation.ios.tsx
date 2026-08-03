import { Button, GlassEffectContainer, HStack } from '@expo/ui/swift-ui'
import {
  accessibilityLabel,
  buttonBorderShape,
  controlSize,
  disabled as disabledModifier,
  frame,
  type ViewModifier
} from '@expo/ui/swift-ui/modifiers'
import { useMemo } from 'react'
import { View } from 'react-native'

import { ExpoUiHost } from '~/components/expo-ui-host'
import { useMobileGlassAvailable } from '~/components/glass/availability'
import { mobileSwiftUiGlassButtonStyle } from '~/components/glass/swift-ui-button.ios'
import { translate } from '~/i18n/translate'

import type { MobileDiffReviewHunkNavigationProps } from './hunk-navigation-props'

function HunkButton({
  direction,
  disabled,
  onJumpHunk
}: MobileDiffReviewHunkNavigationProps & {
  direction: 'next' | 'previous'
}): React.JSX.Element {
  const isGlassAvailable = useMobileGlassAvailable()
  const label =
    direction === 'previous'
      ? translate('mobile.review.hunks.previous', 'Previous hunk')
      : translate('mobile.review.hunks.next', 'Next hunk')
  const modifiers = useMemo<ViewModifier[]>(
    () => [
      controlSize('small'),
      mobileSwiftUiGlassButtonStyle(isGlassAvailable),
      buttonBorderShape('capsule'),
      frame({ minHeight: 44, alignment: 'center' }),
      accessibilityLabel(label),
      disabledModifier(disabled)
    ],
    [disabled, isGlassAvailable, label]
  )

  return (
    <Button
      label={translate('mobile.review.hunks.label', 'Hunk')}
      modifiers={modifiers}
      onPress={() => onJumpHunk(direction)}
      systemImage={direction === 'previous' ? 'arrow.up' : 'arrow.down'}
    />
  )
}

export function MobileDiffReviewHunkNavigation({
  disabled,
  onJumpHunk
}: MobileDiffReviewHunkNavigationProps): React.JSX.Element {
  return (
    <View className="mt-2">
      <ExpoUiHost>
        <GlassEffectContainer spacing={8}>
          <HStack spacing={8}>
            <HunkButton direction="previous" disabled={disabled} onJumpHunk={onJumpHunk} />
            <HunkButton direction="next" disabled={disabled} onJumpHunk={onJumpHunk} />
          </HStack>
        </GlassEffectContainer>
      </ExpoUiHost>
    </View>
  )
}
