import { View } from 'react-native'

import { cn } from '~/style/class-names'

import type { MobileGlassSurfaceProps } from './surface-props'

export function MobileGlassSurface({
  className,
  fallbackClassName,
  forceFallback: _forceFallback,
  isFunctional: _isFunctional,
  isInteractive: _isInteractive,
  tintColorClassName: _tintColorClassName,
  ...viewProps
}: MobileGlassSurfaceProps): React.JSX.Element {
  return (
    <View
      {...viewProps}
      className={cn('border-hairline border-border bg-card', className, fallbackClassName)}
    />
  )
}
