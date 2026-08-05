import { MobileAgentSessionHistoryIcon } from '~/agent-history/icon'
import {
  ArrowSquareRight,
  Chat,
  Files,
  GitMerge,
  ListChecks,
  TerminalWindow
} from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'

import { ActionSheetModal } from '../components/action-sheet-modal'

type Props = {
  visible: boolean
  showChatTerminalSwitch: boolean
  isChatView: boolean
  showQuickCommands: boolean
  showFileExplorer: boolean
  showSourceControl: boolean
  showAgentSessionHistory: boolean
  showChecks: boolean
  onToggleChatTerminal: () => void
  onOpenQuickCommands: () => void
  onOpenFileExplorer: () => void
  onOpenSourceControl: () => void
  onOpenAgentSessionHistory: () => void
  onOpenChecks: () => void
  onClose: () => void
}

export function MobileSessionHeaderMoreActionsSheet({
  visible,
  showChatTerminalSwitch,
  isChatView,
  showQuickCommands,
  showFileExplorer,
  showSourceControl,
  showAgentSessionHistory,
  showChecks,
  onToggleChatTerminal,
  onOpenQuickCommands,
  onOpenFileExplorer,
  onOpenSourceControl,
  onOpenAgentSessionHistory,
  onOpenChecks,
  onClose
}: Props): React.JSX.Element {
  return (
    <ActionSheetModal
      visible={visible}
      actions={[
        ...(showChatTerminalSwitch
          ? [
              {
                id: 'toggle-terminal-chat-view',
                label: isChatView
                  ? translate(
                      'mobile.session.terminalActions.switchToTerminalView',
                      'Switch to terminal view'
                    )
                  : translate(
                      'mobile.session.terminalActions.switchToChatView',
                      'Switch to chat view'
                    ),
                icon: isChatView ? TerminalWindow : Chat,
                dismiss: 'immediate' as const,
                onPress: onToggleChatTerminal
              }
            ]
          : []),
        ...(showQuickCommands
          ? [
              {
                id: 'quick-commands',
                label: translate('mobile.session.quickCommands', 'Quick commands'),
                icon: ArrowSquareRight,
                dismiss: 'immediate' as const,
                onPress: onOpenQuickCommands
              }
            ]
          : []),
        ...(showFileExplorer
          ? [
              {
                id: 'file-explorer',
                label: translate('mobile.session.header.openFileExplorer', 'Open file explorer'),
                icon: Files,
                dismiss: 'immediate' as const,
                onPress: onOpenFileExplorer
              }
            ]
          : []),
        ...(showSourceControl
          ? [
              {
                id: 'source-control',
                label: translate('mobile.session.header.openSourceControl', 'Open source control'),
                icon: GitMerge,
                dismiss: 'immediate' as const,
                onPress: onOpenSourceControl
              }
            ]
          : []),
        ...(showAgentSessionHistory
          ? [
              {
                id: 'agent-history',
                label: translate('mobile.session.headerActions.agentHistory', 'Agent History'),
                hint: translate(
                  'mobile.session.headerActions.agentHistoryHint',
                  'Browse and resume agent sessions'
                ),
                renderIcon: () => (
                  <MobileAgentSessionHistoryIcon
                    size={16}
                    colorClassName="accent-muted-foreground"
                  />
                ),
                dismiss: 'immediate' as const,
                onPress: onOpenAgentSessionHistory
              }
            ]
          : []),
        ...(showChecks
          ? [
              {
                id: 'checks',
                label: translate('mobile.session.headerActions.checks', 'Checks'),
                hint: translate(
                  'mobile.session.headerActions.checksHint',
                  'Open pull request checks'
                ),
                icon: ListChecks,
                dismiss: 'immediate' as const,
                onPress: onOpenChecks
              }
            ]
          : [])
      ]}
      onClose={onClose}
    />
  )
}
