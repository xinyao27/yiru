import type { AgentStatusState } from '@yiru/workbench-model/agent'

import type { AgentDotState } from '../../agent-state-dot'
import type { DashboardAgentRow as DashboardAgentRowData } from '../../dashboard/use-dashboard-data'

function asDotState(state: AgentStatusState | 'idle'): AgentDotState {
  switch (state) {
    case 'working':
    case 'blocked':
    case 'waiting':
    case 'done':
    case 'idle':
      return state
  }
  return 'idle'
}

export function getAgentDotState(agent: DashboardAgentRowData): AgentDotState {
  return agent.entry.interrupted === true ? 'interrupted' : asDotState(agent.state)
}
