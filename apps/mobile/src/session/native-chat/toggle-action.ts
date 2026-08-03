import type { ActionSheetAction } from '~/components/action-sheet-modal'
import { Chat as MessageSquare, TerminalWindow as SquareTerminal } from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'

import { resolveMobileNativeChat, type MobileNativeChatTab } from './eligibility'

type ToggleTab = MobileNativeChatTab & {
  id: string
  terminal: string | null
}

/** Builds the optional terminal/chat switch shown in a terminal's long-press menu. */
export function getMobileNativeChatToggleActions(args: {
  terminalHandle: string | null
  tabs: readonly ToggleTab[]
  isTabChatView: (tabId: string) => boolean
  nativeChatTranscriptIsLocalReadable: boolean
  onToggle: (tabId: string) => void
}): ActionSheetAction[] {
  const { terminalHandle, tabs, isTabChatView, onToggle } = args
  const tab = terminalHandle
    ? tabs.find((candidate) => candidate.terminal === terminalHandle)
    : null
  if (!tab || !resolveMobileNativeChat(tab, args.nativeChatTranscriptIsLocalReadable)) {
    return []
  }
  const isChat = isTabChatView(tab.id)
  return [
    {
      id: 'toggle-terminal-chat-view',
      label: isChat
        ? translate(
            'mobile.session.terminalActions.switchToTerminalView',
            'Switch to terminal view'
          )
        : translate('mobile.session.terminalActions.switchToChatView', 'Switch to chat view'),
      icon: isChat ? SquareTerminal : MessageSquare,
      dismiss: 'immediate',
      onPress: () => onToggle(tab.id)
    }
  ]
}
