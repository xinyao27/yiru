import type { TuiAgent } from '@yiru/workbench-model/agent'

import { MOBILE_AGENT_CATALOG } from '../workspace-create/agent-catalog'
import { isMobileTuiAgentEnabled } from '../workspace-create/tui-agents'
import { pickWorkspaceAgent } from '../workspace-create/workspace-agent-selection'

export type NewWorkspaceRuntimeSettings = {
  defaultTuiAgent?: TuiAgent | 'blank' | null
  disabledTuiAgents?: TuiAgent[]
}

export type NewWorkspaceAgentOption = {
  id: TuiAgent | '__blank__'
  label: string
  faviconDomain?: string
}

export const NEW_WORKSPACE_AGENT_OPTIONS: NewWorkspaceAgentOption[] = MOBILE_AGENT_CATALOG

export const NEW_WORKSPACE_BLANK_AGENT: NewWorkspaceAgentOption = {
  id: '__blank__',
  label: 'Blank Terminal'
}

export function newWorkspaceAgentOptionFor(id: string | null | undefined): NewWorkspaceAgentOption {
  if (id === 'blank' || id === '__blank__') {
    return NEW_WORKSPACE_BLANK_AGENT
  }
  return NEW_WORKSPACE_AGENT_OPTIONS.find((agent) => agent.id === id) ?? NEW_WORKSPACE_BLANK_AGENT
}

export function pickPreferredNewWorkspaceAgent(
  settings: NewWorkspaceRuntimeSettings | null,
  detectedAgentIds: Set<string> | null
): NewWorkspaceAgentOption {
  return newWorkspaceAgentOptionFor(
    pickWorkspaceAgent(
      {
        defaultTuiAgent: settings?.defaultTuiAgent,
        disabledTuiAgents: settings?.disabledTuiAgents
      },
      detectedAgentIds
    )
  )
}

function isSelectableAgent(
  agent: NewWorkspaceAgentOption,
  settings: NewWorkspaceRuntimeSettings | null,
  detectedAgentIds: Set<string> | null
): boolean {
  if (agent.id === '__blank__') {
    return true
  }
  if (!isMobileTuiAgentEnabled(agent.id, settings?.disabledTuiAgents)) {
    return false
  }
  return detectedAgentIds === null || detectedAgentIds.has(agent.id)
}

export function resolveNewWorkspaceAgentSelection({
  visible,
  selectedAgent,
  agentOverridden,
  runtimeSettings,
  detectedAgentIds
}: {
  visible: boolean
  selectedAgent: NewWorkspaceAgentOption
  agentOverridden: boolean
  runtimeSettings: NewWorkspaceRuntimeSettings | null
  detectedAgentIds: Set<string> | null
}): { selectedAgent: NewWorkspaceAgentOption; agentOverridden: boolean } {
  if (!visible) {
    return { selectedAgent, agentOverridden }
  }

  const preferred = pickPreferredNewWorkspaceAgent(runtimeSettings, detectedAgentIds)
  if (!agentOverridden) {
    return { selectedAgent: preferred, agentOverridden: false }
  }

  if (
    detectedAgentIds !== null &&
    !isSelectableAgent(selectedAgent, runtimeSettings, detectedAgentIds)
  ) {
    return { selectedAgent: preferred, agentOverridden: false }
  }

  return { selectedAgent, agentOverridden: true }
}
