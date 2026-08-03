import type { ActionSheetAction } from '~/components/action-sheet-modal'
import { MobileAgentIcon } from '~/components/agent-icon'
import { Robot as Bot } from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'

import type { MobileNewTabAgentOption } from './new-tab-agent-options'
import type { MobileNewTabAgentLoadState } from './screen-state'

type AgentActionsArgs = {
  loadState: MobileNewTabAgentLoadState
  options: readonly MobileNewTabAgentOption[]
}

type CreateAgentActionsArgs = AgentActionsArgs & {
  onCreate: (agent: MobileNewTabAgentOption['agent']) => void
}

type SendNotesAgentActionsArgs = AgentActionsArgs & {
  onSelect: (agent: MobileNewTabAgentOption['agent']) => void
}

function unavailableAgentAction(hint: string): ActionSheetAction {
  return {
    id: 'agent-presets-unavailable',
    label: translate('mobile.session.newTab.agentPresetsUnavailable', 'Agent Presets Unavailable'),
    hint,
    icon: Bot,
    disabled: true,
    dismiss: 'manual',
    onPress: () => {}
  }
}

function unavailableAgentActions(
  loadState: MobileNewTabAgentLoadState,
  unavailableHint: string
): ActionSheetAction[] {
  if (loadState === 'loading') {
    return [
      {
        id: 'detecting-agents',
        label: translate('mobile.session.newTab.detectingAgents', 'Detecting Agents'),
        icon: Bot,
        disabled: true,
        loading: true,
        dismiss: 'manual',
        onPress: () => {}
      }
    ]
  }
  if (loadState === 'loaded') {
    return [
      {
        id: 'no-enabled-agents',
        label: translate('mobile.session.newTab.noEnabledAgents', 'No Enabled Agents'),
        icon: Bot,
        disabled: true,
        dismiss: 'manual',
        onPress: () => {}
      }
    ]
  }
  return loadState === 'error' ? [unavailableAgentAction(unavailableHint)] : []
}

export function buildCreateTabAgentActions({
  loadState,
  options,
  onCreate
}: CreateAgentActionsArgs): ActionSheetAction[] {
  if (loadState === 'loading' || options.length === 0) {
    return unavailableAgentActions(
      loadState,
      translate('mobile.session.newTab.checkHostConnection', 'Check the host connection')
    )
  }
  return options.map((option) => ({
    id: `new-agent:${option.agent}`,
    label: option.label,
    renderIcon: () => <MobileAgentIcon agentId={option.agent} size={16} />,
    dismiss: 'immediate',
    onPress: () => onCreate(option.agent)
  }))
}

export function buildSendReviewNotesAgentActions({
  loadState,
  options,
  onSelect
}: SendNotesAgentActionsArgs): ActionSheetAction[] {
  if (loadState === 'loading' || options.length === 0) {
    return unavailableAgentActions(
      loadState,
      translate('mobile.session.reviewNotes.copyInstead', 'Copy notes instead')
    )
  }
  return options.map((option) => ({
    id: `send-notes-agent:${option.agent}`,
    label: option.label,
    hint: translate('mobile.session.reviewNotes.newAgentSession', 'New agent session'),
    icon: Bot,
    dismiss: 'immediate',
    onPress: () => onSelect(option.agent)
  }))
}
