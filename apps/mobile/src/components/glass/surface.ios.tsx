import { GlassView } from 'expo-glass-effect'
import { View } from 'react-native'
import { useUniwind, withUniwind } from 'uniwind'

import { cn } from '~/style/class-names'

import { useMobileGlassAvailable } from './availability'
import type { MobileGlassSurfaceProps } from './surface-props'

const UniwindGlassView = withUniwind(GlassView)

export function MobileGlassSurface({
  className,
  fallbackClassName,
  forceFallback = false,
  isFunctional: _isFunctional,
  isInteractive = false,
  tintColorClassName,
  ...viewProps
}: MobileGlassSurfaceProps): React.JSX.Element {
  const isAvailable = useMobileGlassAvailable() && !forceFallback
  const { theme } = useUniwind()

  if (!isAvailable) {
    return (
      <View
        {...viewProps}
        className={cn('border-hairline border-border bg-card', className, fallbackClassName)}
      />
    )
  }

  return (
    <UniwindGlassView
      {...viewProps}
      className={className}
      colorScheme={theme}
      glassEffectStyle="regular"
      isInteractive={isInteractive}
      tintColorClassName={tintColorClassName}
    />
  )
}
