import { GlassContainer, type GlassContainerProps } from 'expo-glass-effect'
import { View } from 'react-native'
import { withUniwind } from 'uniwind'

import { useMobileGlassAvailable } from './availability'

const UniwindGlassContainer = withUniwind(GlassContainer)

type MobileGlassGroupProps = Omit<GlassContainerProps, 'ref'> & {
  className?: string
}

export function MobileGlassGroup({
  className,
  spacing = 8,
  ...viewProps
}: MobileGlassGroupProps): React.JSX.Element {
  const isAvailable = useMobileGlassAvailable()

  if (!isAvailable) {
    return <View {...viewProps} className={className} />
  }

  return <UniwindGlassContainer {...viewProps} className={className} spacing={spacing} />
}
