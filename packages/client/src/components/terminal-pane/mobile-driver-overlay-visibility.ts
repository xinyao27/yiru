import type { FitHoldMode } from '~renderer/lib/pane-manager/mobile-fit-overrides'

export function shouldShowMobileDriverOverlay(
  driverKind: 'idle' | 'desktop' | 'mobile',
  fitMode: FitHoldMode | null,
  isWebClient: boolean
): boolean {
  return (
    driverKind === 'mobile' ||
    fitMode === 'mobile-fit' ||
    (!isWebClient && fitMode === 'remote-desktop-fit')
  )
}
