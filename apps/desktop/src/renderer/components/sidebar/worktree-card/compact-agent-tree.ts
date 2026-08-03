import { buildAgentRowLineageTree } from '~renderer/components/dashboard/agent-row-lineage-model'
import type { DashboardAgentRow } from '~renderer/components/dashboard/use-dashboard-data'

export type CompactAgentBranch = {
  agent: DashboardAgentRow
  children: CompactAgentBranch[]
  isExpanded: boolean
  visibleRowCount: number
}

export function buildCompactAgentBranches(
  agents: readonly DashboardAgentRow[],
  collapsedParentPaneKeys: ReadonlySet<string>
): CompactAgentBranch[] {
  const { rootRows, childrenByParentPaneKey } = buildAgentRowLineageTree(agents)

  const buildBranch = (
    agent: DashboardAgentRow,
    ancestorPaneKeys: ReadonlySet<string>
  ): CompactAgentBranch | null => {
    if (ancestorPaneKeys.has(agent.paneKey)) {
      return null
    }
    const descendantAncestorPaneKeys = new Set(ancestorPaneKeys)
    descendantAncestorPaneKeys.add(agent.paneKey)
    const children: CompactAgentBranch[] = []
    for (const childAgent of childrenByParentPaneKey.get(agent.paneKey) ?? []) {
      const childBranch = buildBranch(childAgent, descendantAncestorPaneKeys)
      if (childBranch) {
        children.push(childBranch)
      }
    }
    const isExpanded = children.length === 0 || !collapsedParentPaneKeys.has(agent.paneKey)
    const visibleRowCount = isExpanded
      ? 1 + children.reduce((count, child) => count + child.visibleRowCount, 0)
      : 1

    return { agent, children, isExpanded, visibleRowCount }
  }

  const branches: CompactAgentBranch[] = []
  for (const rootRow of rootRows) {
    const branch = buildBranch(rootRow, new Set())
    if (branch) {
      branches.push(branch)
    }
  }
  return branches
}
