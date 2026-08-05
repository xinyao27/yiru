import { BottomSheetScrollView, BottomSheetView } from '@expo/ui/community/bottom-sheet'
import { createContext, useContext, type ReactNode } from 'react'
import { View } from 'react-native'

import { BottomDrawerSheet } from './bottom-drawer-sheet'

const BottomDrawerModalHostContext = createContext(false)
const BOTTOM_DRAWER_CONTENT_CLASS_NAME = 'px-3 pt-3 pb-4'

export type BottomDrawerProps = {
  visible: boolean
  onClose: () => void
  children: ReactNode
  contentScrollable?: boolean
}

export function BottomDrawer({
  visible,
  onClose,
  children,
  contentScrollable = true
}: BottomDrawerProps): React.JSX.Element | null {
  const isInsideModalHost = useContext(BottomDrawerModalHostContext)

  if (isInsideModalHost) {
    return visible ? (
      <BottomDrawerContent contentScrollable={contentScrollable}>{children}</BottomDrawerContent>
    ) : null
  }

  return (
    <BottomDrawerSheet visible={visible} onClose={onClose}>
      <BottomDrawerContent contentScrollable={contentScrollable}>{children}</BottomDrawerContent>
    </BottomDrawerSheet>
  )
}

export type BottomDrawerModalHostProps = {
  visible: boolean
  onRequestClose: () => void
  children: ReactNode
  dismissEnabled?: boolean
}

// Why: sibling drawer steps share one native presentation so changing steps is
// an ordinary content update rather than a dismiss-then-present race.
export function BottomDrawerModalHost({
  visible,
  onRequestClose,
  children,
  dismissEnabled = true
}: BottomDrawerModalHostProps): React.JSX.Element {
  return (
    <BottomDrawerSheet visible={visible} onClose={onRequestClose} dismissEnabled={dismissEnabled}>
      <BottomSheetView>
        <BottomDrawerModalHostContext.Provider value={true}>
          {children}
        </BottomDrawerModalHostContext.Provider>
      </BottomSheetView>
    </BottomDrawerSheet>
  )
}

type BottomDrawerContentProps = {
  children: ReactNode
  contentScrollable: boolean
}

function BottomDrawerContent({
  children,
  contentScrollable
}: BottomDrawerContentProps): React.JSX.Element {
  if (!contentScrollable) {
    return (
      <BottomSheetView>
        <View className={BOTTOM_DRAWER_CONTENT_CLASS_NAME}>{children}</View>
      </BottomSheetView>
    )
  }

  return (
    <BottomSheetScrollView
      bounces={false}
      contentContainerClassName={BOTTOM_DRAWER_CONTENT_CLASS_NAME}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </BottomSheetScrollView>
  )
}
