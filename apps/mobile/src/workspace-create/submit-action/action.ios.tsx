import { Button, GlassEffectContainer, Host } from '@expo/ui/swift-ui'
import {
  buttonBorderShape,
  controlSize,
  disabled as disabledModifier,
  frame,
  type ViewModifier
} from '@expo/ui/swift-ui/modifiers'
import { useMemo } from 'react'
import { useUniwind } from 'uniwind'

import { useMobileGlassAvailable } from '~/components/glass/availability'
import { mobileSwiftUiGlassButtonStyle } from '~/components/glass/swift-ui-button.ios'

import type { SubmitActionProps } from './props'

export function SubmitAction({ disabled, label, onPress }: SubmitActionProps): React.JSX.Element {
  const { theme } = useUniwind()
  const isGlassAvailable = useMobileGlassAvailable()
  const modifiers = useMemo<ViewModifier[]>(
    () => [
      controlSize('large'),
      mobileSwiftUiGlassButtonStyle(isGlassAvailable, true),
      buttonBorderShape('capsule'),
      frame({ height: 44, alignment: 'center' }),
      disabledModifier(disabled)
    ],
    [disabled, isGlassAvailable]
  )

  return (
    <Host
      colorScheme={theme}
      ignoreSafeArea="all"
      matchContents
      style={{ alignSelf: 'flex-end', height: 44, backgroundColor: 'transparent' }}
    >
      <GlassEffectContainer spacing={8}>
        <Button label={label} modifiers={modifiers} onPress={onPress} />
      </GlassEffectContainer>
    </Host>
  )
}
