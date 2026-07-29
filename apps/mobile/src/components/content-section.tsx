import type { ReactNode } from 'react'
import { View } from 'react-native'

import { cn } from '../style/class-names'

type MobileContentSectionProps = {
  children: ReactNode
  className?: string
}

export function MobileContentSection({
  children,
  className
}: MobileContentSectionProps): React.JSX.Element {
  return (
    <View
      className={cn('border-hairline border-border bg-card overflow-hidden rounded-2xl', className)}
    >
      {children}
    </View>
  )
}
