import type { DashboardAgentRow } from './use-dashboard-data'

/** Why: 'subagent' and 'title' rows are synthesized while building the row list
 *  and own no record in agentStatusByPaneKey / retainedAgentsByPaneKey, so
 *  offering the dismiss X would be a silent no-op — dropAgentStatus finds
 *  nothing to delete and the next render rebuilds the identical row from the
 *  parent entry's subagent list or the pane's terminal title. */
export function isDismissibleAgentRow(agent: Pick<DashboardAgentRow, 'rowSource'>): boolean {
  return agent.rowSource !== 'subagent' && agent.rowSource !== 'title'
}
