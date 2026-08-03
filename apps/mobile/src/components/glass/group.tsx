import { View } from 'react-native'

import type { MobileGlassGroupProps } from './group-props'

export function MobileGlassGroup({
  className,
  spacing: _spacing,
  ...viewProps
}: MobileGlassGroupProps): React.JSX.Element {
  return <View {...viewProps} className={className} />
}
