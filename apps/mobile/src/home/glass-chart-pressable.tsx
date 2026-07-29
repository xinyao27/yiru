import type { ReactNode } from 'react'
import { Pressable } from 'react-native'

import { MobileGlassSurface } from '../components/glass/surface'
import { cn } from '../style/class-names'

type HomeGlassChartPressableProps = {
  accessibilityLabel: string
  children: ReactNode
  className?: string
  contentClassName?: string
  onPress: () => void
}

export function HomeGlassChartPressable({
  accessibilityLabel,
  children,
  className,
  contentClassName,
  onPress
}: HomeGlassChartPressableProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className={cn('rounded-2xl active:opacity-80', className)}
      onPress={onPress}
    >
      {/* Why: the native Glass view can intercept touches from a nested Pressable;
          the outer chart owns interaction while this layer owns material. */}
      <MobileGlassSurface
        className={cn('overflow-hidden rounded-2xl', contentClassName)}
        isFunctional
        isInteractive
        pointerEvents="none"
      >
        {children}
      </MobileGlassSurface>
    </Pressable>
  )
}
