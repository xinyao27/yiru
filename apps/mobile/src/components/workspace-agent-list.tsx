import type { RuntimeWorktreeAgentRow } from '@yiru/runtime-protocol/mobile-runtime-types'
import { useMemo } from 'react'
import { View } from 'react-native'

import { flattenAgentRowLineage } from '../workspace/agent-row-lineage'
import { WorkspaceAgentRow } from './workspace-agent-row'

type Props = {
  agents: RuntimeWorktreeAgentRow[]
  now: number
  unvisited: boolean
}

// Inline agent list for one worktree row: flattens the spawn lineage and renders
// a depth-indented WorkspaceAgentRow per agent, mirroring the desktop sidebar's
// WorktreeCardAgents.
export function WorkspaceAgentList({ agents, now, unvisited }: Props) {
  // Why: rebuild the lineage tree only when the agent list changes, not on every
  // re-render (the shared useNow tick re-renders this list every 30s).
  const nodes = useMemo(() => flattenAgentRowLineage(agents), [agents])
  return (
    <View className="mt-1">
      {nodes.map((node) => (
        <WorkspaceAgentRow
          key={node.row.paneKey}
          agent={node.row}
          depth={node.depth}
          now={now}
          unvisited={unvisited}
        />
      ))}
    </View>
  )
}
