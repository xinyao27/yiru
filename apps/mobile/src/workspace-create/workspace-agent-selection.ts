import type { TuiAgent } from '@yiru/workbench-model/agent'

import {
  filterEnabledMobileTuiAgents,
  isMobileTuiAgent,
  isMobileTuiAgentEnabled,
  MOBILE_TUI_AGENT_AUTO_PICK_ORDER,
  pickMobileTuiAgent
} from './tui-agents'

export type WorkspaceAgentChoice = TuiAgent | 'blank'

type WorkspaceAgentSettings = {
  defaultTuiAgent?: TuiAgent | 'blank' | null
  disabledTuiAgents?: unknown
}

export function normalizeWorkspaceAgent(value: unknown): WorkspaceAgentChoice | null {
  if (value === 'blank' || value === '__blank__') {
    return 'blank'
  }
  return isMobileTuiAgent(value) ? value : null
}

export function pickWorkspaceAgent(
  settings: WorkspaceAgentSettings,
  detectedAgentIds: Set<string> | null
): WorkspaceAgentChoice {
  const preferred = normalizeWorkspaceAgent(settings.defaultTuiAgent)
  if (preferred === 'blank') {
    return preferred
  }
  const disabled = settings.disabledTuiAgents
  const enabledAutoPickOrder = filterEnabledMobileTuiAgents(
    MOBILE_TUI_AGENT_AUTO_PICK_ORDER,
    disabled
  )
  if (detectedAgentIds === null) {
    return preferred && isMobileTuiAgentEnabled(preferred, disabled)
      ? preferred
      : (enabledAutoPickOrder[0] ?? 'blank')
  }
  const detectedAgents = enabledAutoPickOrder.filter((agent) => detectedAgentIds.has(agent))
  return pickMobileTuiAgent(preferred, detectedAgents, disabled) ?? 'blank'
}
