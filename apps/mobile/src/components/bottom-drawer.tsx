import ExpoBottomSheet, {
  BottomSheetScrollView,
  BottomSheetView,
  type BottomSheetMethods
} from '@expo/ui/community/bottom-sheet'
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { Platform, View } from 'react-native'
import { useCSSVariable } from 'uniwind'

import { resolveCssString } from '~/style/resolve-css-variable'

export const BOTTOM_DRAWER_HIDE_MS = 150
const IOS_SHEET_DISMISS_SETTLE_MS = 350

const BottomDrawerModalHostContext = createContext(false)

export type BottomDrawerProps = {
  visible: boolean
  onClose: () => void
  onAfterClose?: () => void
  children: ReactNode
  contentScrollable?: boolean
}

export function BottomDrawer({
  visible,
  onClose,
  onAfterClose,
  children,
  contentScrollable = true
}: BottomDrawerProps): React.JSX.Element | null {
  const isInsideModalHost = useContext(BottomDrawerModalHostContext)
  const afterCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (afterCloseTimerRef.current) {
        clearTimeout(afterCloseTimerRef.current)
      }
    }
  }, [])

  if (isInsideModalHost) {
    return (
      <HostedBottomDrawer visible={visible} contentScrollable={contentScrollable}>
        {children}
      </HostedBottomDrawer>
    )
  }

  const handleClose = (): void => {
    onClose()
    if (!onAfterClose) {
      return
    }

    // Why: Expo reports a JS-driven iOS close before the SwiftUI dismissal
    // finishes, while chained native modals need that presentation to be gone.
    if (!visible && Platform.OS === 'ios') {
      if (afterCloseTimerRef.current) {
        clearTimeout(afterCloseTimerRef.current)
      }
      afterCloseTimerRef.current = setTimeout(() => {
        afterCloseTimerRef.current = null
        onAfterClose()
      }, IOS_SHEET_DISMISS_SETTLE_MS)
      return
    }

    onAfterClose()
  }

  return (
    <NativeBottomSheet visible={visible} onClose={handleClose}>
      <BottomDrawerContent contentScrollable={contentScrollable}>{children}</BottomDrawerContent>
    </NativeBottomSheet>
  )
}

export type BottomDrawerModalHostProps = {
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
}: BottomDrawerModalHostProps): React.JSX.Element {
  return (
    <NativeBottomSheet visible={visible} onClose={onRequestClose} reopensWhileVisible>
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
  reopensWhileVisible?: boolean
}

function NativeBottomSheet({
  visible,
  onClose,
  children,
  reopensWhileVisible = false
}: NativeBottomSheetProps): React.JSX.Element {
  const sheetRef = useRef<BottomSheetMethods>(null)
  const visibleRef = useRef(visible)
  const reopenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  visibleRef.current = visible
  const popoverColor = resolveCssString(useCSSVariable('--color-popover'))
  const backgroundStyle = useMemo(
    // Why: iOS owns the translucent system sheet material, including Liquid
    // Glass. Android and web need the app's semantic color for theme parity.
    () => (Platform.OS === 'ios' ? undefined : { backgroundColor: popoverColor }),
    [popoverColor]
  )

  useEffect(() => {
    return () => {
      if (reopenTimerRef.current) {
        clearTimeout(reopenTimerRef.current)
      }
    }
  }, [])

  const handleClose = (): void => {
    onClose()
    if (!reopensWhileVisible) {
      return
    }

    if (reopenTimerRef.current) {
      clearTimeout(reopenTimerRef.current)
    }
    reopenTimerRef.current = setTimeout(() => {
      reopenTimerRef.current = null
      if (visibleRef.current) {
        sheetRef.current?.present()
      }
    }, 0)
  }

  return (
    <ExpoBottomSheet
      ref={sheetRef}
      backgroundStyle={backgroundStyle}
      enableDynamicSizing
      enablePanDownToClose
      index={visible ? 0 : -1}
      onClose={handleClose}
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

type HostedBottomDrawerProps = BottomDrawerContentProps & {
  visible: boolean
}

function HostedBottomDrawer({
  visible,
  children,
  contentScrollable
}: HostedBottomDrawerProps): React.JSX.Element | null {
  const [mounted, setMounted] = useState(visible)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  if (visible && !mounted) {
    setMounted(true)
  }

  useEffect(() => {
    if (visible) {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
      return
    }

    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null
      setMounted(false)
    }, BOTTOM_DRAWER_HIDE_MS)

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
    }
  }, [visible])

  if (!mounted) {
    return null
  }

  return <BottomDrawerContent contentScrollable={contentScrollable}>{children}</BottomDrawerContent>
}
