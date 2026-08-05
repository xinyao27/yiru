import type { ViewProps } from 'react-native'

type MobileGlassSurfaceBaseProps = Omit<ViewProps, 'className'> & {
  className?: string
  fallbackClassName?: string
  tintColorClassName?: string
}

type MobileGlassSurfaceIntentProps =
  | {
      forceFallback: true
      isFunctional?: boolean
      isInteractive?: boolean
    }
  | {
      forceFallback?: boolean
      isFunctional: true
      isInteractive?: boolean
    }
  | {
      forceFallback?: false
      isFunctional?: boolean
      isInteractive: boolean
    }

export type MobileGlassSurfaceProps = MobileGlassSurfaceBaseProps & MobileGlassSurfaceIntentProps
