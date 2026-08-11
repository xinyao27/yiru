import type { RuntimeWorktreeAgentRow } from '@yiru/runtime-protocol/mobile-runtime-types'
import { useMemo } from 'react'
import { View } from 'react-native'

import { WorkspaceAgentRow } from './agent-row'
import { buildAgentRowBranches, type AgentRowBranch } from './agent-row-lineage'

type Props = {
  agents: RuntimeWorktreeAgentRow[]
  now: number
  railStartOffsetPt?: number
  unvisited: boolean
}

const AGENT_ROW_HEIGHT_PT = 24
const ROOT_AGENT_RAIL_LEFT_PT = -16
const ROOT_AGENT_RAIL_ELBOW_WIDTH_PT = 10
const CHILD_AGENT_RAIL_LEFT_PT = -4
const CHILD_AGENT_RAIL_ELBOW_WIDTH_PT = 4

type WorkspaceAgentBranchProps = {
  branch: AgentRowBranch
  now: number
  siblingPosition?: 'middle' | 'last'
  unvisited: boolean
}

function WorkspaceAgentBranch({
  branch,
  now,
  siblingPosition,
  unvisited
}: WorkspaceAgentBranchProps): React.JSX.Element {
  return (
    <View className="relative">
      {siblingPosition ? (
        <>
          <View
            pointerEvents="none"
            className="bg-border w-hairline absolute top-0"
            style={
              siblingPosition === 'middle'
                ? { left: CHILD_AGENT_RAIL_LEFT_PT, bottom: 0 }
                : { left: CHILD_AGENT_RAIL_LEFT_PT, height: AGENT_ROW_HEIGHT_PT / 2 }
            }
          />
          <View
            pointerEvents="none"
            className="bg-border h-hairline absolute"
            style={{
              left: CHILD_AGENT_RAIL_LEFT_PT,
              top: AGENT_ROW_HEIGHT_PT / 2,
              width: CHILD_AGENT_RAIL_ELBOW_WIDTH_PT
            }}
          />
        </>
      ) : null}
      <WorkspaceAgentRow agent={branch.row} now={now} unvisited={unvisited} />
      {branch.children.length > 0 ? (
        <View className="ml-3 pl-1">
          {branch.children.map((child, index) => (
            <WorkspaceAgentBranch
              key={child.row.paneKey}
              branch={child}
              now={now}
              siblingPosition={index === branch.children.length - 1 ? 'last' : 'middle'}
              unvisited={unvisited}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}

export function WorkspaceAgentList({ agents, now, railStartOffsetPt = 0, unvisited }: Props) {
  const { branches, rootRowCenters } = useMemo(() => {
    const nextBranches = buildAgentRowBranches(agents)
    let rowsAbove = 0
    return {
      branches: nextBranches,
      rootRowCenters: nextBranches.map((branch) => {
        const center = rowsAbove * AGENT_ROW_HEIGHT_PT + AGENT_ROW_HEIGHT_PT / 2
        rowsAbove += branch.visibleRowCount
        return center
      })
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
      {branches.map((branch) => (
        <WorkspaceAgentBranch
          key={branch.row.paneKey}
          branch={branch}
          now={now}
          unvisited={unvisited}
        />
      ))}
    </View>
  )
}
