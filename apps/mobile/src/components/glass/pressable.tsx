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
  isProminent?: boolean
  isSelected?: boolean
  onPress: NonNullable<PressableProps['onPress']>
  size?: 'large' | 'regular' | 'small'
  tintColorClassName?: string
}

export function MobileGlassPressable({
  accessibilityState,
  accessibilityRole = 'button',
  children,
  className,
  containerClassName,
  contentClassName,
  disabled = false,
  fallbackClassName,
  hitSlop,
  isProminent = false,
  isSelected,
  onPress,
  size,
  tintColorClassName,
  ...pressableProps
}: MobileGlassPressableProps): React.JSX.Element {
  const isGlassAvailable = useMobileGlassAvailable()
  const resolvedFallbackClassName = cn(
    isProminent && 'border-transparent bg-primary',
    isSelected && !isProminent && 'bg-accent',
    fallbackClassName
  )
  const resolvedTintColorClassName =
    isProminent || isSelected ? 'accent-primary' : tintColorClassName

  return (
    <Pressable
      {...pressableProps}
      accessibilityRole={accessibilityRole}
      accessibilityState={{
        ...accessibilityState,
        disabled,
        ...(isSelected === undefined ? {} : { selected: isSelected })
      }}
      className={cn('min-h-11 min-w-11 justify-center', containerClassName)}
      disabled={disabled}
      hitSlop={hitSlop}
      onPress={onPress}
    >
      {({ pressed }) => (
        <MobileGlassSurface
          className={cn('overflow-hidden', className)}
          fallbackClassName={resolvedFallbackClassName}
          isFunctional
          isInteractive={!disabled}
          pointerEvents="none"
          tintColorClassName={resolvedTintColorClassName}
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
