import { Button, Host } from '@expo/ui/swift-ui'
import {
  accessibilityLabel,
  buttonBorderShape,
  controlSize,
  disabled as disabledModifier,
  frame,
  tint,
  type ViewModifier
} from '@expo/ui/swift-ui/modifiers'
import { useMemo } from 'react'
import { View } from 'react-native'
import { useCSSVariable, useUniwind } from 'uniwind'

import { cn } from '~/style/class-names'
import { resolveCssString } from '~/style/resolve-css-variable'

import { useMobileGlassAvailable } from './availability'
import { mobileSwiftUiGlassButtonStyle } from './swift-ui.ios'
import type { MobileGlassTextButtonProps } from './text-button-props'

export function MobileGlassTextButton({
  accessibilityLabel: accessibilityLabelText,
  className,
  disabled = false,
  isDestructive = false,
  isFullWidth = false,
  isProminent = false,
  label,
  onPress,
  size = 'regular'
}: MobileGlassTextButtonProps): React.JSX.Element {
  const isGlassAvailable = useMobileGlassAvailable()
  const { theme } = useUniwind()
  const destructiveColor = resolveCssString(useCSSVariable('--color-destructive'))
  const modifiers = useMemo<ViewModifier[]>(
    () => [
      controlSize(size),
      mobileSwiftUiGlassButtonStyle(isGlassAvailable, isProminent || isDestructive),
      buttonBorderShape('capsule'),
      ...(isFullWidth ? [frame({ maxWidth: Infinity, alignment: 'center' })] : []),
      ...(isDestructive ? [tint(destructiveColor)] : []),
      accessibilityLabel(accessibilityLabelText ?? label),
      disabledModifier(disabled)
    ],
    [
      accessibilityLabelText,
      destructiveColor,
      disabled,
      isDestructive,
      isFullWidth,
      isGlassAvailable,
      isProminent,
      label,
      size
    ]
  )

  return (
    <View className={cn(isFullWidth && 'self-stretch', className)}>
      <Host
        colorScheme={theme}
        matchContents={isFullWidth ? { vertical: true } : true}
        style={{ backgroundColor: 'transparent', width: isFullWidth ? '100%' : undefined }}
      >
        <Button label={label} modifiers={modifiers} onPress={onPress} />
      </Host>
    </View>
  )
}
