import {
  Button,
  type ButtonProps,
  GlassEffectContainer,
  Host,
  HStack,
  Image,
  Text
} from '@expo/ui/swift-ui'
import {
  accessibilityLabel,
  backgroundOverlay,
  buttonBorderShape,
  buttonStyle,
  clipShape,
  controlSize,
  disabled as disabledModifier,
  font,
  foregroundStyle,
  frame,
  glassEffect,
  labelStyle,
  onLongPressGesture,
  padding,
  strokeBorder,
  tint,
  type ViewModifier
} from '@expo/ui/swift-ui/modifiers'
import { type ReactNode, useMemo } from 'react'
import { Pressable, type PressableProps, View } from 'react-native'
import { useCSSVariable, useUniwind } from 'uniwind'

import { resolveCssString } from '~/style/resolve-css-variable'

import { useMobileGlassAvailable } from './availability'

type MobileSwiftUiGlassGroupProps = {
  children: ReactNode
  modifiers?: ViewModifier[]
  spacing?: number
}

type MobileSwiftUiGlassCircleButtonProps = {
  disabled?: boolean
  isProminent?: boolean
  label: string
  onLongPress?: () => void
  onPress: () => void
  size?: 'large' | 'regular' | 'small'
  systemImage: NonNullable<ButtonProps['systemImage']>
  tintColor?: string
}

type MobileSwiftUiGlassInputShellProps = {
  alignment?: 'bottom' | 'center'
  children: ReactNode
  hasTrailingAction: boolean
  minHeight?: number
}

export type MobileSwiftUiGlassAccessoryButtonProps = Omit<
  PressableProps,
  'children' | 'disabled'
> & {
  disabled?: boolean
  appearance?: 'destructive' | 'normal'
  iconSize?: number
  isSelected?: boolean
  label?: string
  shape?: 'capsule' | 'circle'
  size?: 'large' | 'regular' | 'small'
  systemImage?: NonNullable<ButtonProps['systemImage']>
}

export function MobileSwiftUiGlassGroup({
  children,
  modifiers,
  spacing
}: MobileSwiftUiGlassGroupProps): React.JSX.Element {
  return (
    <GlassEffectContainer modifiers={modifiers} spacing={spacing}>
      {children}
    </GlassEffectContainer>
  )
}

export function MobileSwiftUiGlassInputShell({
  alignment = 'center',
  children,
  hasTrailingAction,
  minHeight = 40
}: MobileSwiftUiGlassInputShellProps): React.JSX.Element {
  const isGlassAvailable = useMobileGlassAvailable()
  const [inputValue, borderValue] = useCSSVariable(['--color-input', '--color-border'])
  const inputColor = resolveCssString(inputValue)
  const borderColor = resolveCssString(borderValue)
  const modifiers = useMemo<ViewModifier[]>(
    () => [
      frame({ minWidth: 160, maxWidth: Infinity, minHeight, alignment: 'center' }),
      padding({ leading: 16, trailing: hasTrailingAction ? 4 : 16, vertical: 2 }),
      ...(isGlassAvailable
        ? mobileSwiftUiGlassEffect(true)
        : [
            backgroundOverlay({ color: inputColor }),
            clipShape('capsule'),
            strokeBorder({ color: borderColor, style: { lineWidth: 1 }, shape: 'capsule' })
          ])
    ],
    [borderColor, hasTrailingAction, inputColor, isGlassAvailable, minHeight]
  )

  return (
    <HStack alignment={alignment} spacing={8} modifiers={modifiers}>
      {children}
    </HStack>
  )
}

export function MobileSwiftUiGlassCircleButton({
  disabled = false,
  isProminent = false,
  label,
  onLongPress,
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
      ...(tintColor ? [tint(tintColor)] : []),
      ...(onLongPress ? [onLongPressGesture(onLongPress, 0.35)] : []),
      disabledModifier(disabled)
    ],
    [circleSize, disabled, isGlassAvailable, isProminent, onLongPress, size, tintColor]
  )

  return <Button label={label} systemImage={systemImage} modifiers={modifiers} onPress={onPress} />
}

export function MobileSwiftUiGlassAccessoryButton({
  accessibilityLabel: accessibilityLabelText,
  appearance = 'normal',
  disabled = false,
  iconSize: iconSizeOverride,
  isSelected = false,
  label,
  shape = 'capsule',
  size = 'small',
  systemImage,
  ...pressableProps
}: MobileSwiftUiGlassAccessoryButtonProps): React.JSX.Element {
  const isGlassAvailable = useMobileGlassAvailable()
  const { theme } = useUniwind()
  const [destructiveValue, mutedForegroundValue, primaryValue, primaryForegroundValue] =
    useCSSVariable([
      '--color-destructive',
      '--color-muted-foreground',
      '--color-primary',
      '--color-primary-foreground'
    ])
  const foregroundColor = resolveCssString(
    appearance === 'destructive'
      ? destructiveValue
      : isSelected
        ? primaryForegroundValue
        : mutedForegroundValue
  )
  const primaryColor = resolveCssString(primaryValue)
  const circleSize = size === 'large' ? 44 : size === 'small' ? 32 : 36
  const iconSize = iconSizeOverride ?? (size === 'large' ? 20 : size === 'small' ? 16 : 18)
  const buttonModifiers = useMemo(
    () => [
      controlSize(size),
      mobileSwiftUiGlassButtonStyle(isGlassAvailable, isSelected),
      buttonBorderShape(shape),
      ...(shape === 'circle'
        ? [frame({ width: circleSize, height: circleSize, alignment: 'center' })]
        : [frame({ height: circleSize, alignment: 'center' })]),
      ...(appearance === 'destructive'
        ? [tint(foregroundColor)]
        : isSelected
          ? [tint(primaryColor)]
          : []),
      accessibilityLabel(accessibilityLabelText ?? label ?? systemImage ?? ''),
      disabledModifier(disabled)
    ],
    [
      accessibilityLabelText,
      appearance,
      disabled,
      circleSize,
      isGlassAvailable,
      isSelected,
      label,
      primaryColor,
      foregroundColor,
      shape,
      size,
      systemImage
    ]
  )
  const textModifiers = useMemo(
    () => [font({ textStyle: 'caption' }), foregroundStyle(foregroundColor)],
    [foregroundColor]
  )

  return (
    <View>
      <Host
        colorScheme={theme}
        matchContents
        pointerEvents="none"
        style={{ backgroundColor: 'transparent' }}
      >
        <Button modifiers={buttonModifiers}>
          {systemImage ? (
            <Image systemName={systemImage} size={iconSize} color={foregroundColor} />
          ) : (
            <Text modifiers={textModifiers}>{label}</Text>
          )}
        </Button>
      </Host>
      <Pressable
        {...pressableProps}
        accessibilityLabel={accessibilityLabelText}
        accessibilityRole="button"
        className="absolute inset-0 rounded-full"
        disabled={disabled}
      />
    </View>
  )
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

export function mobileSwiftUiGlassEffect(isGlassAvailable: boolean): ViewModifier[] {
  if (!isGlassAvailable) {
    return []
  }
  return [
    glassEffect({
      glass: { variant: 'regular', interactive: true },
      shape: 'capsule'
    })
  ]
}
