import { Button, GlassEffectContainer, Host, HStack } from '@expo/ui/swift-ui'
import {
  buttonBorderShape,
  controlSize,
  disabled as disabledModifier,
  frame,
  tint,
  type ViewModifier
} from '@expo/ui/swift-ui/modifiers'
import { useMemo } from 'react'
import { useCSSVariable, useUniwind } from 'uniwind'

import { useMobileGlassAvailable } from '~/components/glass/availability'
import { mobileSwiftUiGlassButtonStyle } from '~/components/glass/swift-ui-button.ios'
import { resolveCssString } from '~/style/resolve-css-variable'

import type { MobileChatPermission } from './permission'

type MobileNativeChatPermissionActionsProps = {
  disabled: boolean
  options: MobileChatPermission['options']
  onRespond: (send: string) => void
}

export function MobileNativeChatPermissionActions({
  disabled,
  options,
  onRespond
}: MobileNativeChatPermissionActionsProps): React.JSX.Element {
  const isGlassAvailable = useMobileGlassAvailable()
  const { theme } = useUniwind()
  const primaryColor = resolveCssString(useCSSVariable('--color-primary'))
  const primaryModifiers = useMemo<ViewModifier[]>(
    () => [
      controlSize('regular'),
      mobileSwiftUiGlassButtonStyle(isGlassAvailable, true),
      buttonBorderShape('capsule'),
      frame({ minWidth: 44, minHeight: 44, alignment: 'center' }),
      tint(primaryColor),
      disabledModifier(disabled)
    ],
    [disabled, isGlassAvailable, primaryColor]
  )
  const secondaryModifiers = useMemo<ViewModifier[]>(
    () => [
      controlSize('regular'),
      mobileSwiftUiGlassButtonStyle(isGlassAvailable),
      buttonBorderShape('capsule'),
      frame({ minWidth: 44, minHeight: 44, alignment: 'center' }),
      disabledModifier(disabled)
    ],
    [disabled, isGlassAvailable]
  )

  return (
    <Host colorScheme={theme} matchContents style={{ backgroundColor: 'transparent' }}>
      <GlassEffectContainer spacing={8}>
        <HStack spacing={8}>
          {options.map((option, index) => (
            <Button
              key={`${option.send}:${option.label}`}
              label={option.label}
              modifiers={index === 0 ? primaryModifiers : secondaryModifiers}
              onPress={() => onRespond(option.send)}
            />
          ))}
        </HStack>
      </GlassEffectContainer>
    </Host>
  )
}
