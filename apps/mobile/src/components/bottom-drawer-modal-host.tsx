import ExpoBottomSheet, { BottomSheetView } from '@expo/ui/community/bottom-sheet'
import { createContext, useContext, type ReactNode } from 'react'

const BottomDrawerModalHostContext = createContext(false)

export function useInsideBottomDrawerModalHost(): boolean {
  return useContext(BottomDrawerModalHostContext)
}

type Props = {
  visible: boolean
  onRequestClose: () => void
  children: ReactNode
}

// Why: SwiftUI cannot reliably swap sibling sheet presentations. Keeping the
// entire flow in one native sheet turns each step into an in-sheet content swap.
export function BottomDrawerModalHost({
  visible,
  onRequestClose,
  children
}: Props): React.JSX.Element {
  return (
    <ExpoBottomSheet
      enableDynamicSizing
      enablePanDownToClose
      index={visible ? 0 : -1}
      onClose={onRequestClose}
    >
      <BottomSheetView>
        <BottomDrawerModalHostContext.Provider value={true}>
          {children}
        </BottomDrawerModalHostContext.Provider>
      </BottomSheetView>
    </ExpoBottomSheet>
  )
}
