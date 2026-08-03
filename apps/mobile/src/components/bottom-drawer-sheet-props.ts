import type { ReactNode } from 'react'

export type BottomDrawerSheetProps = {
  children: ReactNode
  dismissEnabled?: boolean
  onClose: () => void
  visible: boolean
}
