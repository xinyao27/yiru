import type { ReactNode } from 'react'

import { SafeAreaView } from '../uniwind-native-components'
import { MobileGlassSurface } from './surface'

type MobileGlassHeaderProps = {
  children: ReactNode
  includesTopInset?: boolean
}

export function MobileGlassHeader({
  children,
  includesTopInset = false
}: MobileGlassHeaderProps): React.JSX.Element {
  return (
    <MobileGlassSurface
      fallbackClassName="border-0 border-b-hairline border-b-border bg-background"
      isFunctional
    >
      {includesTopInset ? <SafeAreaView edges={['top']}>{children}</SafeAreaView> : children}
    </MobileGlassSurface>
  )
}
