import type { ReactNode } from 'react'
import type { ViewProps } from 'react-native'

export type MobileGlassGroupProps = Omit<ViewProps, 'children' | 'className'> & {
  children: ReactNode
  className?: string
  spacing?: number
}
