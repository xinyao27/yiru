import { Button, GlassEffectContainer, Host } from '@expo/ui/swift-ui'
import {
  buttonBorderShape,
  controlSize,
  frame,
  type ViewModifier
} from '@expo/ui/swift-ui/modifiers'
import { useMemo } from 'react'
import { useUniwind } from 'uniwind'

import { useMobileGlassAvailable } from '~/components/glass/availability'
import { mobileSwiftUiGlassButtonStyle } from '~/components/glass/swift-ui-button.ios'

import type { HomePrimaryActionButtonProps } from './primary-action-button-props'

export function HomePrimaryActionButton({
  label,
  onPress,
  systemImage
}: HomePrimaryActionButtonProps): React.JSX.Element {
  const { theme } = useUniwind()
  const isGlassAvailable = useMobileGlassAvailable()
  const modifiers = useMemo<ViewModifier[]>(
    () => [
      controlSize('large'),
      mobileSwiftUiGlassButtonStyle(isGlassAvailable),
      buttonBorderShape('capsule'),
      frame({ height: 44, alignment: 'center' })
    ],
    [isGlassAvailable]
  )

  return (
    <Host
      colorScheme={theme}
      ignoreSafeArea="all"
      matchContents
      style={{ alignSelf: 'center', height: 44, backgroundColor: 'transparent' }}
    >
      <GlassEffectContainer spacing={8}>
        <Button label={label} modifiers={modifiers} onPress={onPress} systemImage={systemImage} />
      </GlassEffectContainer>
    </Host>
  )
}
