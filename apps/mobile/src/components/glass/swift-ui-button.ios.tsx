import { Button, type ButtonProps } from '@expo/ui/swift-ui'
import {
  buttonBorderShape,
  buttonStyle,
  controlSize,
  disabled as disabledModifier,
  frame,
  labelStyle,
  tint,
  type ViewModifier
} from '@expo/ui/swift-ui/modifiers'
import { useMemo } from 'react'

import { useMobileGlassAvailable } from './availability'

type MobileSwiftUiGlassCircleButtonProps = {
  disabled?: boolean
  isProminent?: boolean
  label: string
  onPress: () => void
  size?: 'large' | 'regular' | 'small'
  systemImage: NonNullable<ButtonProps['systemImage']>
  tintColor?: string
}

export function MobileSwiftUiGlassCircleButton({
  disabled = false,
  isProminent = false,
  label,
  onPress,
  size = 'large',
  systemImage,
  tintColor
}: MobileSwiftUiGlassCircleButtonProps): React.JSX.Element {
  const isGlassAvailable = useMobileGlassAvailable()
  const circleSize = size === 'large' ? 44 : size === 'small' ? 32 : 36
  const modifiers = useMemo<ViewModifier[]>(
    () => [
      labelStyle('iconOnly'),
      controlSize(size),
      mobileSwiftUiGlassButtonStyle(isGlassAvailable, isProminent),
      buttonBorderShape('circle'),
      frame({ width: circleSize, height: circleSize, alignment: 'center' }),
      frame({ minWidth: 44, minHeight: 44, alignment: 'center' }),
      ...(tintColor ? [tint(tintColor)] : []),
      disabledModifier(disabled)
    ],
    [circleSize, disabled, isGlassAvailable, isProminent, size, tintColor]
  )

  return <Button label={label} systemImage={systemImage} modifiers={modifiers} onPress={onPress} />
}

export function mobileSwiftUiGlassButtonStyle(
  isGlassAvailable: boolean,
  isProminent = false
): ViewModifier {
  if (isGlassAvailable) {
    return buttonStyle(isProminent ? 'glassProminent' : 'glass')
  }
  return buttonStyle(isProminent ? 'borderedProminent' : 'bordered')
}
