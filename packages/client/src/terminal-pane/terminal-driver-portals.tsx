import { createPortal } from 'react-dom'
import { usesBrowserUiRenderer } from '~renderer/runtime/renderer-host'

import { MobileDriverOverlay } from './mobile-driver-overlay'
import { shouldShowMobileDriverOverlay } from './mobile-driver-overlay-visibility'
import { getDriverForPty } from './pane-manager/mobile-driver-state'
import { getFitOverrideForPty } from './pane-manager/mobile-fit-overrides'
import type { ManagedPane } from './pane-manager/pane-manager'
import type { PtyTransport } from './pty/transport-types'

type TerminalDriverPortalsProps = {
  panes: ManagedPane[]
  paneTransportsRef: React.RefObject<Map<number, PtyTransport>>
  restoreAllTerminalFits: (focusPane: ManagedPane) => Promise<void>
  restorePaneTerminalFit: (
    pane: ManagedPane,
    ptyId: string,
    fitMode: 'mobile-fit' | 'remote-desktop-fit'
  ) => Promise<void>
}

export function TerminalDriverPortals({
  panes,
  paneTransportsRef,
  restoreAllTerminalFits,
  restorePaneTerminalFit
}: TerminalDriverPortalsProps): React.JSX.Element {
  const isBrowserRenderer = usesBrowserUiRenderer()
  return (
    <>
      {panes.map((pane) => {
        // Why: pane IDs collide across tabs; the transport's PTY identity is global.
        const ptyId = paneTransportsRef.current.get(pane.id)?.getPtyId()
        if (!ptyId) {
          return null
        }
        const driver = getDriverForPty(ptyId)
        const fitMode = getFitOverrideForPty(ptyId)?.mode ?? null
        if (!shouldShowMobileDriverOverlay(driver.kind, fitMode, isBrowserRenderer)) {
          return null
        }
        return createPortal(
          <MobileDriverOverlay
            key={`mobile-driver-${pane.id}-${ptyId}`}
            driver={driver}
            fitMode={fitMode}
            rootClassName="mobile-driver-banner"
            onAction={() =>
              restorePaneTerminalFit(
                pane,
                ptyId,
                fitMode === 'remote-desktop-fit' ? 'remote-desktop-fit' : 'mobile-fit'
              )
            }
            onAllAction={
              fitMode === 'remote-desktop-fit' ? undefined : () => restoreAllTerminalFits(pane)
            }
          />,
          pane.container,
          `mobile-driver-banner-${pane.id}`
        )
      })}
    </>
  )
}
