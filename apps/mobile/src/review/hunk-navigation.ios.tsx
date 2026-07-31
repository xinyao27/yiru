import { Button, Host, HStack } from '@expo/ui/swift-ui'
import {
  accessibilityLabel,
  buttonBorderShape,
  controlSize,
  disabled as disabledModifier,
  type ViewModifier
} from '@expo/ui/swift-ui/modifiers'
import { useMemo } from 'react'
import { useUniwind } from 'uniwind'

import { useMobileGlassAvailable } from '~/components/glass/availability'
import {
  mobileSwiftUiGlassButtonStyle,
  MobileSwiftUiGlassGroup
} from '~/components/glass/swift-ui.ios'

import type { MobileDiffReviewHunkNavigationProps } from './hunk-navigation-props'

function HunkButton({
  direction,
  disabled,
  onJumpHunk
}: MobileDiffReviewHunkNavigationProps & {
  direction: 'next' | 'previous'
}): React.JSX.Element {
  const isGlassAvailable = useMobileGlassAvailable()
  const label = `${direction === 'previous' ? 'Previous' : 'Next'} hunk`
  const modifiers = useMemo<ViewModifier[]>(
    () => [
      controlSize('small'),
      mobileSwiftUiGlassButtonStyle(isGlassAvailable),
      buttonBorderShape('capsule'),
      accessibilityLabel(label),
      disabledModifier(disabled)
    ],
    [disabled, isGlassAvailable, label]
  )

  return (
    <Button
      label="Hunk"
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
  const { theme } = useUniwind()
  return (
    <Host
      colorScheme={theme}
      matchContents
      style={{ backgroundColor: 'transparent', marginTop: 8 }}
    >
      <MobileSwiftUiGlassGroup spacing={8}>
        <HStack spacing={8}>
          <HunkButton direction="previous" disabled={disabled} onJumpHunk={onJumpHunk} />
          <HunkButton direction="next" disabled={disabled} onJumpHunk={onJumpHunk} />
        </HStack>
      </MobileSwiftUiGlassGroup>
    </Host>
  )
}
