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
  const resolvedHitSlop = hitSlop ?? (size ? 0 : 6)

  return (
    <Pressable
      {...pressableProps}
      accessibilityRole={accessibilityRole}
      className={size ? cn('min-h-11 min-w-11 justify-center', containerClassName) : undefined}
      disabled={disabled}
      hitSlop={resolvedHitSlop}
      onPress={onPress}
    >
      {({ pressed }) => (
        <MobileGlassSurface
          className={cn('overflow-hidden', className)}
          fallbackClassName={fallbackClassName}
          isFunctional
          isInteractive={!disabled}
          pointerEvents="none"
          tintColorClassName={tintColorClassName}
        >
          <View
            className={cn(
              pressed && !disabled && !isGlassAvailable && 'bg-accent',
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
          >
            {children}
          </View>
        </MobileGlassSurface>
      )}
    </Pressable>
  )
}
