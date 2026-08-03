import ExpoBottomSheet, {
  BottomSheetScrollView,
  BottomSheetView
} from '@expo/ui/community/bottom-sheet'
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { Platform, View } from 'react-native'
import { useCSSVariable } from 'uniwind'

import { resolveCssString } from '~/style/resolve-css-variable'

const BottomDrawerModalHostContext = createContext(false)

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
    <NativeBottomSheet visible={visible} onClose={onClose}>
      <BottomDrawerContent contentScrollable={contentScrollable}>{children}</BottomDrawerContent>
    </NativeBottomSheet>
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
    <NativeBottomSheet visible={visible} onClose={onRequestClose} dismissEnabled={dismissEnabled}>
      <BottomSheetView>
        <BottomDrawerModalHostContext.Provider value={true}>
          {children}
        </BottomDrawerModalHostContext.Provider>
      </BottomSheetView>
    </NativeBottomSheet>
  )
}

type NativeBottomSheetProps = {
  visible: boolean
  onClose: () => void
  children: ReactNode
  dismissEnabled?: boolean
}

function NativeBottomSheet({
  visible,
  onClose,
  children,
  dismissEnabled = true
}: NativeBottomSheetProps): React.JSX.Element {
  const popoverColor = resolveCssString(useCSSVariable('--color-popover'))
  const backgroundStyle = useMemo(
    // Why: iOS owns the translucent system sheet material, including Liquid
    // Glass. Android and web need the app's semantic color for theme parity.
    () => (Platform.OS === 'ios' ? undefined : { backgroundColor: popoverColor }),
    [popoverColor]
  )

  return (
    <ExpoBottomSheet
      backgroundStyle={backgroundStyle}
      enableDynamicSizing
      enablePanDownToClose={dismissEnabled}
      index={visible ? 0 : -1}
      onClose={onClose}
    >
      {children}
    </ExpoBottomSheet>
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
        <View className="px-3 pb-4">{children}</View>
      </BottomSheetView>
    )
  }

  return (
    <BottomSheetScrollView
      bounces={false}
      contentContainerClassName="px-3 pb-4"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </BottomSheetScrollView>
  )
}
