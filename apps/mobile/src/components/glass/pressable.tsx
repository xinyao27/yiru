import { cn } from 'cnfast'
import type { ReactNode } from 'react'
import { Pressable, View, type PressableProps } from 'react-native'

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
  variant?: 'default' | 'tab'
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
  variant = 'default',
  ...pressableProps
}: MobileGlassPressableProps): React.JSX.Element {
  const isGlassAvailable = useMobileGlassAvailable()
  const isTab = variant === 'tab'
  const resolvedFallbackClassName = cn(
    isProminent && 'border-transparent bg-primary',
    isSelected && !isProminent && 'bg-accent',
    fallbackClassName
  )
  const resolvedTintColorClassName = isProminent
    ? 'accent-primary'
    : isSelected
      ? isTab
        ? 'accent-accent'
        : 'accent-primary'
      : tintColorClassName

  return (
    <Pressable
      {...pressableProps}
      accessibilityRole={accessibilityRole}
      accessibilityState={{
        ...accessibilityState,
        disabled,
        ...(isSelected === undefined ? {} : { selected: isSelected })
      }}
      className={cn(
        'min-h-11 min-w-11 justify-center',
        isTab && 'max-w-40 min-w-24',
        containerClassName
      )}
      disabled={disabled}
      hitSlop={hitSlop}
      onPress={onPress}
    >
      {({ pressed }) => {
        const content = (
          <View
            className={cn(
              pressed && !disabled && (isTab || !isGlassAvailable) && 'bg-accent',
              disabled && 'opacity-40',
              size === 'large'
                ? 'min-h-11'
                : size === 'regular'
                  ? 'min-h-9'
                  : size === 'small'
                    ? 'min-h-8'
                    : undefined,
              isTab && 'min-h-9 items-center justify-center rounded-full px-3',
              contentClassName
            )}
          >
            {children}
          </View>
        )

        if (isTab && !isSelected) {
          return (
            <View className={cn('max-w-40 overflow-hidden', className)} pointerEvents="none">
              {content}
            </View>
          )
        }

        return (
          <MobileGlassSurface
            className={cn('overflow-hidden', isTab && 'max-w-40 rounded-full', className)}
            fallbackClassName={resolvedFallbackClassName}
            // Why: dynamic tab labels need a deterministic capsule shape across iOS Glass
            // and fallback paths.
            forceFallback={isTab}
            isFunctional
            isInteractive={!disabled}
            pointerEvents="none"
            tintColorClassName={resolvedTintColorClassName}
          >
            {content}
          </MobileGlassSurface>
        )
      }}
    </Pressable>
  )
}
