import type { ReactNode } from 'react'
import { Pressable, type PressableProps } from 'react-native'

import { cn } from '~/style/class-names'

import { useMobileGlassAvailable } from './availability'
import { MobileGlassSurface } from './surface'

type MobileGlassPressableProps = Omit<
  PressableProps,
  'children' | 'className' | 'disabled' | 'onPress' | 'style'
> & {
  children: ReactNode
  className?: string
  contentClassName?: string
  disabled?: boolean
  fallbackClassName?: string
  onPress: NonNullable<PressableProps['onPress']>
  tintColorClassName?: string
}

export function MobileGlassPressable({
  children,
  className,
  contentClassName,
  disabled = false,
  fallbackClassName,
  hitSlop = 6,
  onPress,
  tintColorClassName,
  ...pressableProps
}: MobileGlassPressableProps): React.JSX.Element {
  const isGlassAvailable = useMobileGlassAvailable()

  return (
    <MobileGlassSurface
      className={cn('overflow-hidden', className)}
      fallbackClassName={fallbackClassName}
      isFunctional
      isInteractive={!disabled}
      tintColorClassName={tintColorClassName}
    >
      <Pressable
        {...pressableProps}
        className={cn(
          !disabled && !isGlassAvailable && 'active:bg-accent',
          disabled && 'opacity-40',
          contentClassName
        )}
        disabled={disabled}
        hitSlop={hitSlop}
        onPress={onPress}
      >
        {children}
      </Pressable>
    </MobileGlassSurface>
  )
}
