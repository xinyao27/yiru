import type { ReactNode } from 'react'
import { Pressable, type PressableProps } from 'react-native'

import { cn } from '../../style/class-names'
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
  onPress,
  tintColorClassName,
  ...pressableProps
}: MobileGlassPressableProps): React.JSX.Element {
  return (
    <MobileGlassSurface
      className={cn('overflow-hidden', disabled && 'opacity-40', className)}
      fallbackClassName={fallbackClassName}
      isInteractive={!disabled}
      tintColorClassName={tintColorClassName}
    >
      <Pressable
        {...pressableProps}
        className={cn(!disabled && 'active:bg-accent', contentClassName)}
        disabled={disabled}
        onPress={onPress}
      >
        {children}
      </Pressable>
    </MobileGlassSurface>
  )
}
