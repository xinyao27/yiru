import { translate } from '~renderer/i18n/i18n'
import { WebRuntimeStatusSegment } from '~renderer/web/connect/status'

import { DesktopRuntimeStatusSegment } from './desktop-segment'

export function YiruRuntimeStatusSegment(): React.JSX.Element {
  return (
    <>
      <DesktopRuntimeStatusSegment />
      <WebRuntimeStatusSegment />
    </>
  )
}

export function YiruRuntimeStatusOnlyFooter(): React.JSX.Element {
  return (
    <footer
      aria-label={translate(
        'auto.components.status.bar.YiruRuntimeStatus.footer',
        'Yiru Runtime status'
      )}
      className="border-border bg-background flex h-6 min-h-[24px] shrink-0 items-center justify-end border-t pr-3"
    >
      <YiruRuntimeStatusSegment />
    </footer>
  )
}
