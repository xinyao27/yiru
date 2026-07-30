import { GlassView, type GlassViewProps } from 'expo-glass-effect'
import { View } from 'react-native'
import { useUniwind, withUniwind } from 'uniwind'

import { cn } from '../../style/class-names'
import { useMobileGlassAvailable } from './availability'

const UniwindGlassView = withUniwind(GlassView)

type MobileGlassSurfaceBaseProps = Omit<
  GlassViewProps,
  'colorScheme' | 'glassEffectStyle' | 'isInteractive' | 'ref' | 'tintColor'
> & {
  className?: string
  fallbackClassName?: string
  tintColor?: string
  tintColorClassName?: string
}

type MobileGlassSurfaceIntentProps =
  | {
      forceFallback: true
      isFunctional?: boolean
      isInteractive?: boolean
    }
  | {
      forceFallback?: false
      isFunctional: true
      isInteractive?: boolean
    }
  | {
      forceFallback?: false
      isFunctional?: boolean
      isInteractive: boolean
    }

type MobileGlassSurfaceProps = MobileGlassSurfaceBaseProps & MobileGlassSurfaceIntentProps

export function MobileGlassSurface({
  className,
  fallbackClassName,
  forceFallback = false,
  isFunctional = false,
  isInteractive = false,
  tintColor,
  tintColorClassName,
  ...viewProps
}: MobileGlassSurfaceProps): React.JSX.Element {
  const isAvailable = useMobileGlassAvailable() && !forceFallback && (isFunctional || isInteractive)
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
      tintColor={tintColor}
      tintColorClassName={tintColorClassName}
    />
  )
}
