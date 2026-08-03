import type { ReactNode } from 'react'
import { Pressable, View, type PressableProps } from 'react-native'

import { cn } from '~/style/class-names'

import { useMobileGlassAvailable } from './availability'
import { MobileGlassSurface } from './surface'

type MobileGlassPressableProps = Omit<
  PressableProps,
  'children' | 'className' | 'disabled' | 'onPress' | 'style'
> & {
  children: ReactNode
  className?: string
  containerClassName?: string
  contentClassName?: string
  disabled?: boolean
  fallbackClassName?: string
  onPress: NonNullable<PressableProps['onPress']>
  size?: 'large' | 'regular' | 'small'
  tintColorClassName?: string
}

export function MobileGlassPressable({
  accessibilityRole = 'button',
  children,
  className,
  containerClassName,
  contentClassName,
  disabled = false,
  fallbackClassName,
  hitSlop,
  onPress,
  size,
  tintColorClassName,
  ...pressableProps
}: MobileGlassPressableProps): React.JSX.Element {
  const isGlassAvailable = useMobileGlassAvailable()
  const resolvedHitSlop =
    hitSlop ?? (size === 'large' ? 0 : size === 'regular' ? 4 : size === 'small' ? 6 : 6)

  const surface = (
    <MobileGlassSurface
      className={cn('overflow-hidden', className)}
      fallbackClassName={fallbackClassName}
      isFunctional
      isInteractive={!disabled}
      tintColorClassName={tintColorClassName}
    >
      <Pressable
        {...pressableProps}
        accessibilityRole={accessibilityRole}
        className={cn(
          !disabled && !isGlassAvailable && 'active:bg-accent',
          disabled && 'opacity-40',
          size === 'large'
            ? 'min-h-11'
            : size === 'regular'
              ? 'min-h-9'
              : size === 'small'
                ? 'min-h-8'
                : undefined,
          contentClassName
        )}
        disabled={disabled}
        hitSlop={resolvedHitSlop}
        onPress={onPress}
      >
        {children}
      </Pressable>
    </MobileGlassSurface>
  )

  if (!size) {
    return surface
  }

  return <View className={cn('min-h-11 justify-center', containerClassName)}>{surface}</View>
}
