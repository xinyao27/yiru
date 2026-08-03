import ExpoBottomSheet from '@expo/ui/community/bottom-sheet'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useCSSVariable } from 'uniwind'

import { resolveCssString } from '~/style/resolve-css-variable'

import { resolveBottomDrawerMounted } from './bottom-drawer-mount-state'
import type { BottomDrawerSheetProps } from './bottom-drawer-sheet-props'

const NATIVE_SHEET_EXIT_GRACE_MS = 400

export function BottomDrawerSheet({
  children,
  dismissEnabled = true,
  onClose,
  visible
}: BottomDrawerSheetProps): React.JSX.Element {
  const [contentMounted, setContentMounted] = useState(visible)
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resolvedContentMounted = resolveBottomDrawerMounted(visible, contentMounted)
  const popoverColor = resolveCssString(useCSSVariable('--color-popover'))
  const backgroundStyle = useMemo(
    // Why: Expo UI's native sheet exposes no className path for its presentation paint.
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

  // Why: opening mounts content in the same commit, while closing keeps it
  // alive through Expo UI's native exit animation.
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
