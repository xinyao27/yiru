import { BottomSheetScrollView, BottomSheetView } from '@expo/ui/community/bottom-sheet'
import { createContext, useContext, type ReactNode } from 'react'
import { View, type ViewStyle } from 'react-native'

import { translate } from '~/i18n/translate'

import { BottomDrawerHeader } from './bottom-drawer-header'
import type { BottomDrawerHeaderAction } from './bottom-drawer-header-props'
import { BottomDrawerSheet } from './bottom-drawer-sheet'

const BottomDrawerModalHostContext = createContext(false)
const BOTTOM_DRAWER_CONTENT_CLASS_NAME = 'px-4 pb-4'
const BOTTOM_DRAWER_FRAME_STYLE = { flex: 1 } satisfies ViewStyle

export type BottomDrawerProps = {
  children: ReactNode
  contentScrollable?: boolean
  headerAction?: BottomDrawerHeaderAction
  leadingAccessibilityLabel?: string
  onBack?: () => void
  onClose: () => void
  title: string
  visible: boolean
}

export function BottomDrawer({
  children,
  contentScrollable = true,
  headerAction,
  leadingAccessibilityLabel,
  onBack,
  onClose,
  title,
  visible
}: BottomDrawerProps): React.JSX.Element | null {
  const isInsideModalHost = useContext(BottomDrawerModalHostContext)
  const content = (
    <BottomDrawerContent
      contentScrollable={contentScrollable}
      headerAction={headerAction}
      leadingAccessibilityLabel={leadingAccessibilityLabel}
      onBack={onBack}
      onClose={onClose}
      title={title}
    >
      {children}
    </BottomDrawerContent>
  )

  if (isInsideModalHost) {
    return visible ? content : null
  }

  return (
    <BottomDrawerSheet visible={visible} onClose={onClose}>
      {content}
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
      <BottomSheetView style={BOTTOM_DRAWER_FRAME_STYLE}>
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
  headerAction?: BottomDrawerHeaderAction
  leadingAccessibilityLabel?: string
  onBack?: () => void
  onClose: () => void
  title: string
}

function BottomDrawerContent({
  children,
  contentScrollable,
  headerAction,
  leadingAccessibilityLabel,
  onBack,
  onClose,
  title
}: BottomDrawerContentProps): React.JSX.Element {
  const header = (
    <BottomDrawerHeader
      action={headerAction}
      leadingAccessibilityLabel={
        leadingAccessibilityLabel ??
        (onBack
          ? translate('mobile.common.back', 'Back')
          : translate('mobile.common.closeSheet', 'Close sheet'))
      }
      onLeadingPress={onBack ?? onClose}
      title={title}
    />
  )

  if (!contentScrollable) {
    return (
      <BottomSheetView style={BOTTOM_DRAWER_FRAME_STYLE}>
        {header}
        <View className={BOTTOM_DRAWER_CONTENT_CLASS_NAME}>{children}</View>
      </BottomSheetView>
    )
  }

  return (
    <BottomSheetView style={BOTTOM_DRAWER_FRAME_STYLE}>
      {header}
      <BottomSheetScrollView
        bounces={false}
        className="flex-1"
        contentContainerClassName={BOTTOM_DRAWER_CONTENT_CLASS_NAME}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </BottomSheetScrollView>
    </BottomSheetView>
  )
}
