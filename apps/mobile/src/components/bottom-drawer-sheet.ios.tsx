import ExpoBottomSheet from '@expo/ui/community/bottom-sheet'
import { useEffect, useRef, useState } from 'react'

import { resolveBottomDrawerMounted } from './bottom-drawer-mount-state'
import type { BottomDrawerSheetProps } from './bottom-drawer-sheet-props'

const IOS_SHEET_EXIT_GRACE_MS = 400

export function BottomDrawerSheet({
  children,
  dismissEnabled = true,
  onClose,
  visible
}: BottomDrawerSheetProps): React.JSX.Element {
  const [contentMounted, setContentMounted] = useState(visible)
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resolvedContentMounted = resolveBottomDrawerMounted(visible, contentMounted)

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

  // Why: opening mounts content in the same commit, while closing keeps it
  // alive through Expo UI's native exit animation.
  if (resolvedContentMounted !== contentMounted) {
    setContentMounted(resolvedContentMounted)
  }

  return (
    <ExpoBottomSheet
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
        }, IOS_SHEET_EXIT_GRACE_MS)
        if (visible) {
          onClose()
        }
      }}
    >
      {/* Why: omitting backgroundStyle preserves the iOS system sheet material and Liquid Glass. */}
      {resolvedContentMounted ? children : null}
    </ExpoBottomSheet>
  )
}
