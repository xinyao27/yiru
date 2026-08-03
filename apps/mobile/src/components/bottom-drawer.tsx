import ExpoBottomSheet, {
  BottomSheetScrollView,
  BottomSheetView
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
import { View } from 'react-native'
import { useCSSVariable } from 'uniwind'

import { resolveCssString } from '~/style/resolve-css-variable'

import { resolveBottomDrawerMounted } from './bottom-drawer-mount-state'

const BottomDrawerModalHostContext = createContext(false)
const NATIVE_SHEET_EXIT_GRACE_MS = 400

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
  const [contentMounted, setContentMounted] = useState(visible)
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resolvedContentMounted = resolveBottomDrawerMounted(visible, contentMounted)
  const popoverColor = resolveCssString(useCSSVariable('--color-popover'))
  const backgroundStyle = useMemo(
    // Why: the community sheet API has no className path for its native
    // presentation background, so this adapter supplies the semantic surface.
    () => ({ backgroundColor: popoverColor }),
    [popoverColor]
  )

  useEffect(() => {
    if (visible && unmountTimerRef.current) {
      clearTimeout(unmountTimerRef.current)
      unmountTimerRef.current = null
    }
  }, [visible])

  useEffect(
    () => () => {
      if (unmountTimerRef.current) {
        clearTimeout(unmountTimerRef.current)
      }
    },
    []
  )

  // Why: opening must mount content in the same commit. Closing stays mounted
  // briefly because Expo's controlled onClose fires before the native exit animation ends.
  if (resolvedContentMounted !== contentMounted) {
    setContentMounted(resolvedContentMounted)
  }

  return (
    <ExpoBottomSheet
      backgroundStyle={backgroundStyle}
      enableDynamicSizing
      enablePanDownToClose={dismissEnabled}
      index={visible ? 0 : -1}
      onClose={() => {
        if (unmountTimerRef.current) {
          clearTimeout(unmountTimerRef.current)
        }
        unmountTimerRef.current = setTimeout(() => {
          setContentMounted(false)
          unmountTimerRef.current = null
        }, NATIVE_SHEET_EXIT_GRACE_MS)
        if (visible) {
          onClose()
        }
      }}
    >
      {resolvedContentMounted ? children : null}
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
