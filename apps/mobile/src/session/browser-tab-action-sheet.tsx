import {
  CaretLeft as ChevronLeft,
  CaretRight as ChevronRight,
  ArrowClockwise as RefreshCw,
  X
} from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'

import { ActionSheetModal } from '../components/action-sheet-modal'
import type { MobileSessionTab } from './screen-state'
import { getMobileSessionTabTitle } from './terminal/tab-agent'

type BrowserTab = Extract<MobileSessionTab, { type: 'browser' }>
export type MobileBrowserNavigationMethod = 'back' | 'forward' | 'reload'

/** Keeps browser-tab navigation actions out of the session route while preserving
 *  the target captured at the moment each drawer action is pressed. */
export function MobileBrowserTabActionSheet(props: {
  target: BrowserTab | null
  onClose: () => void
  onNavigate: (target: BrowserTab, method: MobileBrowserNavigationMethod) => void
  onCloseTab: (target: BrowserTab) => void
}): React.JSX.Element {
  const { target, onClose, onNavigate, onCloseTab } = props
  return (
    <ActionSheetModal
      visible={target != null}
      title={
        target
          ? getMobileSessionTabTitle(target)
          : translate('mobile.session.browserActions.fallbackTitle', 'Browser')
      }
      actions={[
        ...(target?.canGoBack
          ? [
              {
                id: 'browser-back',
                label: translate('mobile.session.browserActions.back', 'Back'),
                icon: ChevronLeft,
                dismiss: 'immediate' as const,
                onPress: () => {
                  const current = target
                  if (current) {
                    onNavigate(current, 'back')
                  }
                }
              }
            ]
          : []),
        ...(target?.canGoForward
          ? [
              {
                id: 'browser-forward',
                label: translate('mobile.session.browserActions.forward', 'Forward'),
                icon: ChevronRight,
                dismiss: 'immediate' as const,
                onPress: () => {
                  const current = target
                  if (current) {
                    onNavigate(current, 'forward')
                  }
                }
              }
            ]
          : []),
        {
          id: 'browser-reload',
          label: translate('mobile.session.browserActions.reload', 'Reload'),
          icon: RefreshCw,
          dismiss: 'immediate',
          onPress: () => {
            const current = target
            if (current) {
              onNavigate(current, 'reload')
            }
          }
        },
        {
          id: 'browser-close',
          label: translate('mobile.session.browserActions.close', 'Close'),
          icon: X,
          dismiss: 'immediate',
          onPress: () => {
            const current = target
            if (current) {
              onCloseTab(current)
            }
          }
        }
      ]}
      onClose={onClose}
    />
  )
}
