import { GlassView, type GlassViewProps } from 'expo-glass-effect'
import { View } from 'react-native'
import { useUniwind, withUniwind } from 'uniwind'

import { cn } from '../../style/class-names'
import { useMobileGlassAvailable } from './availability'

const UniwindGlassView = withUniwind(GlassView)

type MobileGlassSurfaceProps = Omit<
  GlassViewProps,
  'colorScheme' | 'glassEffectStyle' | 'isInteractive' | 'ref' | 'tintColor'
> & {
  className?: string
  forceFallback?: boolean
  isInteractive?: boolean
  tintColor?: string
}

export function MobileGlassSurface({
  className,
  forceFallback = false,
  isInteractive = false,
  tintColor,
  ...viewProps
}: MobileGlassSurfaceProps): React.JSX.Element {
  const isAvailable = useMobileGlassAvailable() && !forceFallback
  const { theme } = useUniwind()

  if (!isAvailable) {
    return (
      <View {...viewProps} className={cn('border-hairline border-border bg-card', className)} />
    )
  }

  return (
    <UniwindGlassView
      {...viewProps}
      className={cn('border-hairline border-border', className)}
      colorScheme={theme}
      glassEffectStyle="regular"
      isInteractive={isInteractive}
      tintColor={tintColor}
    />
  )
}
