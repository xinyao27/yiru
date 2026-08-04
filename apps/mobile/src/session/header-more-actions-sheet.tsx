import { MobileAgentSessionHistoryIcon } from '~/agent-history/icon'
import { ListChecks } from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'

import { ActionSheetModal } from '../components/action-sheet-modal'

type Props = {
  visible: boolean
  showAgentSessionHistory: boolean
  showChecks: boolean
  onOpenAgentSessionHistory: () => void
  onOpenChecks: () => void
  onClose: () => void
}

export function MobileSessionHeaderMoreActionsSheet({
  visible,
  showAgentSessionHistory,
  showChecks,
  onOpenAgentSessionHistory,
  onOpenChecks,
  onClose
}: Props): React.JSX.Element {
  return (
    <ActionSheetModal
      visible={visible}
      actions={[
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
