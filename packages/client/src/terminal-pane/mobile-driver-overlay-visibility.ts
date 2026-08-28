import type { FitHoldMode } from '~renderer/terminal-pane/pane-manager/mobile-fit-overrides'

export function shouldShowMobileDriverOverlay(
  driverKind: 'idle' | 'desktop' | 'mobile',
  fitMode: FitHoldMode | null,
  isBrowserRenderer: boolean
): boolean {
  return (
    driverKind === 'mobile' ||
    fitMode === 'mobile-fit' ||
    (!isBrowserRenderer && fitMode === 'remote-desktop-fit')
  )
}
