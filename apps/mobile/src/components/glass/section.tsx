import type { ReactNode } from 'react'

import { cn } from '../../style/class-names'
import { MobileGlassSurface } from './surface'

type MobileGlassSectionProps = {
  children: ReactNode
  className?: string
}

export function MobileGlassSection({
  children,
  className
}: MobileGlassSectionProps): React.JSX.Element {
  return (
    <MobileGlassSurface className={cn('overflow-hidden rounded-2xl', className)}>
      {children}
    </MobileGlassSurface>
  )
}
