import { createContext, useContext, type ReactNode } from 'react'
import { Modal, Platform, View } from 'react-native'
import { FullWindowOverlay } from 'react-native-screens'

const BottomDrawerModalHostContext = createContext(false)

/** True when a BottomDrawer is rendered inside a shared presentation host and
 *  must therefore skip its own full-window presentation layer. */
export function useInsideBottomDrawerModalHost(): boolean {
  return useContext(BottomDrawerModalHostContext)
}

type Props = {
  visible: boolean
  onRequestClose: () => void
  children: ReactNode
}

// Why: sibling drawer flows swap views in one persistent presentation host. Creating
// and dismissing a presentation per step can drop the incoming sheet and leave it
// dead to taps; one host makes those swaps ordinary in-window view changes.
export function BottomDrawerModalHost({ visible, onRequestClose, children }: Props) {
  if (!visible) {
    return null
  }

  const content = (
    <BottomDrawerModalHostContext.Provider value={true}>
      <View className="flex-1" pointerEvents="box-none">
        {children}
      </View>
    </BottomDrawerModalHostContext.Provider>
  )

  // Why: keeping iOS drawers in the active UIWindow lets Liquid Glass sample
  // the underlying screen and also preserves sibling-drawer transitions.
  if (Platform.OS === 'ios') {
    return <FullWindowOverlay>{content}</FullWindowOverlay>
  }

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onRequestClose}
    >
      {content}
    </Modal>
  )
}
