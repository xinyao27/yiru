import type { RuntimeWorktreeAgentRow } from '@yiru/runtime-protocol/mobile-runtime-types'
import { useMemo } from 'react'
import { View } from 'react-native'

import { WorkspaceAgentRow } from './agent-row'
import { flattenAgentRowLineage } from './agent-row-lineage'

type Props = {
  agents: RuntimeWorktreeAgentRow[]
  now: number
  railStartOffsetPt?: number
  unvisited: boolean
}

const AGENT_ROW_HEIGHT_PT = 24
const ROOT_AGENT_RAIL_LEFT_PT = -16
const ROOT_AGENT_RAIL_ELBOW_WIDTH_PT = 10

export function WorkspaceAgentList({ agents, now, railStartOffsetPt = 0, unvisited }: Props) {
  const { nodes, rootRowCenters } = useMemo(() => {
    const nextNodes = flattenAgentRowLineage(agents)
    return {
      nodes: nextNodes,
      rootRowCenters: nextNodes.flatMap((node, index) =>
        node.depth === 0 ? [index * AGENT_ROW_HEIGHT_PT + AGENT_ROW_HEIGHT_PT / 2] : []
      )
    }
  }, [agents])
  const lastRootRowCenter = rootRowCenters.at(-1)

  return (
    <View className="relative mt-1">
      {lastRootRowCenter === undefined ? null : (
        <View
          pointerEvents="none"
          className="bg-border w-hairline absolute"
          style={{
            left: ROOT_AGENT_RAIL_LEFT_PT,
            top: -railStartOffsetPt,
            height: lastRootRowCenter + railStartOffsetPt
          }}
        />
      )}
      {rootRowCenters.map((center) => (
        <View
          key={center}
          pointerEvents="none"
          className="bg-border h-hairline absolute"
          style={{
            left: ROOT_AGENT_RAIL_LEFT_PT,
            top: center,
            width: ROOT_AGENT_RAIL_ELBOW_WIDTH_PT
          }}
        />
      ))}
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
