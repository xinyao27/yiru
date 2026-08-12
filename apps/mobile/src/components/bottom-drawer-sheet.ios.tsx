import { BottomSheet as ExpoBottomSheet, Group, Host, RNHostView } from '@expo/ui/swift-ui'
import {
  interactiveDismissDisabled,
  presentationDragIndicator,
  presentationSizing
} from '@expo/ui/swift-ui/modifiers'
import { useCallback, useMemo, useState } from 'react'
import { useWindowDimensions, View, type ViewStyle } from 'react-native'

import { resolveBottomDrawerMounted } from './bottom-drawer-mount-state'
import type { BottomDrawerSheetProps } from './bottom-drawer-sheet-props'

const IOS_PAGE_SHEET_MODIFIERS = [presentationSizing('page'), presentationDragIndicator('hidden')]

export function BottomDrawerSheet({
  children,
  dismissEnabled = true,
  onClose,
  visible
}: BottomDrawerSheetProps): React.JSX.Element {
  const [contentMounted, setContentMounted] = useState(visible)
  const resolvedContentMounted = resolveBottomDrawerMounted(visible, contentMounted)
  const { width } = useWindowDimensions()
  const hostStyle = useMemo(() => ({ position: 'absolute', width }) satisfies ViewStyle, [width])
  const modifiers = useMemo(
    () => [...IOS_PAGE_SHEET_MODIFIERS, interactiveDismissDisabled(!dismissEnabled)],
    [dismissEnabled]
  )

  const handlePresentedChange = useCallback(
    (isPresented: boolean) => {
      if (!isPresented && visible) {
        onClose()
      }
    },
    [onClose, visible]
  )

  const handleDismiss = useCallback(() => {
    setContentMounted(false)
  }, [])

  // Why: opening mounts content in the same commit, while Expo UI keeps it
  // alive until SwiftUI reports that the native dismissal animation finished.
  if (resolvedContentMounted !== contentMounted) {
    setContentMounted(resolvedContentMounted)
  }

  return (
    <Host style={hostStyle} pointerEvents="none">
      <ExpoBottomSheet
        isPresented={visible}
        onDismiss={handleDismiss}
        onIsPresentedChange={handlePresentedChange}
      >
        <Group modifiers={modifiers}>
          <RNHostView>
            <View className="flex-1">{resolvedContentMounted ? children : null}</View>
          </RNHostView>
        </Group>
      </ExpoBottomSheet>
    </Host>
  )
}
