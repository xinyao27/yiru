import { Button, Host, HStack } from '@expo/ui/swift-ui'
import {
  buttonBorderShape,
  controlSize,
  disabled as disabledModifier,
  type ViewModifier
} from '@expo/ui/swift-ui/modifiers'
import { useMemo } from 'react'
import { useUniwind } from 'uniwind'

import { useMobileGlassAvailable } from '../../components/glass/availability'
import {
  MobileSwiftUiGlassGroup,
  mobileSwiftUiGlassButtonStyle
} from '../../components/glass/swift-ui.ios'
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
  const primaryModifiers = useMemo<ViewModifier[]>(
    () => [
      controlSize('regular'),
      mobileSwiftUiGlassButtonStyle(isGlassAvailable, true),
      buttonBorderShape('capsule'),
      disabledModifier(disabled)
    ],
    [disabled, isGlassAvailable]
  )
  const secondaryModifiers = useMemo<ViewModifier[]>(
    () => [
      controlSize('regular'),
      mobileSwiftUiGlassButtonStyle(isGlassAvailable),
      buttonBorderShape('capsule'),
      disabledModifier(disabled)
    ],
    [disabled, isGlassAvailable]
  )

  return (
    <Host colorScheme={theme} matchContents style={{ backgroundColor: 'transparent' }}>
      <MobileSwiftUiGlassGroup spacing={8}>
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
      </MobileSwiftUiGlassGroup>
    </Host>
  )
}
