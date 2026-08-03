import ExpoBottomSheet, {
  BottomSheetScrollView,
  BottomSheetView
} from '@expo/ui/community/bottom-sheet'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { View } from 'react-native'

import { useInsideBottomDrawerModalHost } from './bottom-drawer-modal-host'

export const BOTTOM_DRAWER_HIDE_DURATION_MS = 150

type Props = {
  visible: boolean
  onClose: () => void
  onAfterClose?: () => void
  children: ReactNode
  // Why: retained at the shared boundary while callers move to native sheet
  // semantics; Expo owns content/handle gesture arbitration and modal stacking.
  dragContentToDismiss?: boolean
  contentScrollable?: boolean
  zIndex?: number
}

export function BottomDrawer({
  visible,
  onClose,
  onAfterClose,
  children,
  contentScrollable = true
}: Props): React.JSX.Element | null {
  const isInsideModalHost = useInsideBottomDrawerModalHost()

  if (isInsideModalHost) {
    return (
      <HostedBottomDrawer visible={visible} contentScrollable={contentScrollable}>
        {children}
      </HostedBottomDrawer>
    )
  }

  return (
    <ExpoBottomSheet
      enableDynamicSizing
      enablePanDownToClose
      index={visible ? 0 : -1}
      onClose={() => {
        onClose()
        onAfterClose?.()
      }}
    >
      <BottomDrawerContent contentScrollable={contentScrollable}>{children}</BottomDrawerContent>
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
    }, BOTTOM_DRAWER_HIDE_DURATION_MS)

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
