import ExpoBottomSheet from '@expo/ui/community/bottom-sheet'
import { useMemo } from 'react'
import { useCSSVariable } from 'uniwind'

import { resolveCssString } from '~/style/resolve-css-variable'

import type { BottomDrawerSheetProps } from './bottom-drawer-sheet-props'

export function BottomDrawerSheet({
  children,
  dismissEnabled = true,
  onClose,
  visible
}: BottomDrawerSheetProps): React.JSX.Element {
  const popoverColor = resolveCssString(useCSSVariable('--color-popover'))
  const backgroundStyle = useMemo(
    // Why: Expo UI's web sheet exposes no className path for its presentation paint.
    () => ({ backgroundColor: popoverColor }),
    [popoverColor]
  )

  return (
    <ExpoBottomSheet
      backgroundStyle={backgroundStyle}
      enableDynamicSizing
      enablePanDownToClose={dismissEnabled}
      index={visible ? 0 : -1}
      onClose={() => {
        if (visible) {
          onClose()
        }
      }}
    >
      {visible ? children : null}
    </ExpoBottomSheet>
  )
}
