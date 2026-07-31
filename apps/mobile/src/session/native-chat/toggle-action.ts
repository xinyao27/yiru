import type { ActionSheetAction } from '~/components/action-sheet-modal'
import { Chat as MessageSquare, TerminalWindow as SquareTerminal } from '~/components/uniwind-icons'

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
  onClose: () => void
  onToggle: (tabId: string) => void
}): ActionSheetAction[] {
  const { terminalHandle, tabs, isTabChatView, onClose, onToggle } = args
  const tab = terminalHandle
    ? tabs.find((candidate) => candidate.terminal === terminalHandle)
    : null
  if (!tab || !resolveMobileNativeChat(tab, args.nativeChatTranscriptIsLocalReadable)) {
    return []
  }
  const isChat = isTabChatView(tab.id)
  return [
    {
      label: isChat ? 'Switch to terminal view' : 'Switch to chat view',
      icon: isChat ? SquareTerminal : MessageSquare,
      onPress: () => {
        onClose()
        onToggle(tab.id)
      }
    }
  ]
}
