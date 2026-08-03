import type { ActionSheetAction } from '~/components/action-sheet-modal'
import {
  Eraser,
  Monitor,
  PencilSimple,
  DeviceMobile as Smartphone,
  X
} from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'

import type { MobileNativeChatTab } from '../native-chat/eligibility'
import { getMobileNativeChatToggleActions } from '../native-chat/toggle-action'

type TerminalTab = MobileNativeChatTab & { id: string; terminal: string | null }

/** Builds the terminal long-press menu without adding another action block to the
 *  already dense session route. Native chat stays first as the view switch. */
export function getMobileTerminalActionSheetActions<Target extends { handle: string }>(args: {
  target: Target | null
  tabs: readonly TerminalTab[]
  isTabChatView: (tabId: string) => boolean
  nativeChatTranscriptIsLocalReadable: boolean
  onToggleChat: (tabId: string) => void
  isPhoneMode: (handle: string) => boolean
  onToggleDisplayMode: (handle: string) => void
  onRename: (target: Target) => void
  onClear: (target: Target) => void
  onClose: (target: Target) => void
}): ActionSheetAction[] {
  const { target } = args
  if (!target) {
    return []
  }
  const phoneMode = args.isPhoneMode(target.handle)
  return [
    ...getMobileNativeChatToggleActions({
      terminalHandle: target.handle,
      tabs: args.tabs,
      isTabChatView: args.isTabChatView,
      nativeChatTranscriptIsLocalReadable: args.nativeChatTranscriptIsLocalReadable,
      onToggle: args.onToggleChat
    }),
    {
      id: 'toggle-display-mode',
      label: phoneMode
        ? translate('mobile.session.terminalActions.switchToDesktop', 'Switch to Desktop')
        : translate('mobile.session.terminalActions.switchToPhone', 'Switch to Phone'),
      icon: phoneMode ? Monitor : Smartphone,
      dismiss: 'immediate',
      onPress: () => args.onToggleDisplayMode(target.handle)
    },
    {
      id: 'rename-terminal',
      label: translate('mobile.session.terminalActions.rename', 'Rename'),
      icon: PencilSimple,
      dismiss: 'immediate',
      onPress: () => args.onRename(target)
    },
    {
      id: 'clear-terminal',
      label: translate('mobile.session.terminalActions.clear', 'Clear Terminal'),
      icon: Eraser,
      destructive: true,
      dismiss: 'immediate',
      onPress: () => args.onClear(target)
    },
    {
      id: 'close-terminal',
      label: translate('mobile.session.terminalActions.close', 'Close'),
      icon: X,
      dismiss: 'immediate',
      onPress: () => args.onClose(target)
    }
  ]
}
