import type { RuntimeMobileSessionClientTab } from '@yiru/runtime-protocol/contract'
import type { RuntimeWorktreeAgentRow } from '@yiru/runtime-protocol/mobile-runtime-types'
import { cn } from 'cnfast'
import { useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'

import { MobileAgentIcon } from '~/components/agent-icon'
import { File, FileText, Globe, Terminal } from '~/components/uniwind-icons'
import {
  getMobileSessionTabTitle,
  resolveMobileTerminalTabAgentId
} from '~/session/terminal/tab-agent'

import { WorkspaceAgentRow } from './agent-row'

type WorkspaceOpenTabListProps = {
  agents: readonly RuntimeWorktreeAgentRow[]
  now: number
  onPress: (tab: RuntimeMobileSessionClientTab) => void
  railStartOffsetPt?: number
  tabs: readonly RuntimeMobileSessionClientTab[]
  unvisited: boolean
}

const TAB_ROW_HEIGHT_PT = 24
const ROOT_TAB_RAIL_LEFT_PT = -16
const ROOT_TAB_RAIL_ELBOW_WIDTH_PT = 10

function OpenTabIcon({ tab }: { tab: RuntimeMobileSessionClientTab }): React.JSX.Element {
  switch (tab.type) {
    case 'terminal': {
      const agentId = resolveMobileTerminalTabAgentId(tab)
      return agentId ? (
        <MobileAgentIcon agentId={agentId} size={16} />
      ) : (
        <Terminal size={16} colorClassName="accent-muted-foreground" />
      )
    }
    case 'browser':
      return <Globe size={16} colorClassName="accent-muted-foreground" />
    case 'markdown':
      return <FileText size={16} colorClassName="accent-muted-foreground" />
    case 'file':
      return <File size={16} colorClassName="accent-muted-foreground" />
  }
}

function WorkspaceOpenTabRow(props: {
  agent?: RuntimeWorktreeAgentRow
  now: number
  onPress: (tab: RuntimeMobileSessionClientTab) => void
  tab: RuntimeMobileSessionClientTab
  unvisited: boolean
}): React.JSX.Element {
  const { agent, now, onPress, tab, unvisited } = props
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: tab.isActive }}
      onPress={(event) => {
        event.stopPropagation()
        onPress(tab)
      }}
    >
      {agent ? (
        <WorkspaceAgentRow agent={agent} now={now} unvisited={unvisited} />
      ) : (
        <View className="h-6 flex-row items-center gap-1">
          <OpenTabIcon tab={tab} />
          <Text
            className={cn(
              'flex-1 text-sm leading-4 text-muted-foreground',
              unvisited && 'text-foreground'
            )}
            numberOfLines={1}
          >
            {getMobileSessionTabTitle(tab)}
          </Text>
        </View>
      )}
    </Pressable>
  )
}

function getAgentTabId(paneKey: string): string | null {
  const delimiter = paneKey.indexOf(':')
  if (
    delimiter <= 0 ||
    delimiter !== paneKey.lastIndexOf(':') ||
    delimiter === paneKey.length - 1
  ) {
    return null
  }
  return paneKey.slice(0, delimiter)
}

export function WorkspaceOpenTabList({
  agents,
  now,
  onPress,
  railStartOffsetPt = 0,
  tabs,
  unvisited
}: WorkspaceOpenTabListProps): React.JSX.Element {
  const agentByTabId = useMemo(() => {
    const next = new Map<string, RuntimeWorktreeAgentRow>()
    for (const agent of agents) {
      const tabId = getAgentTabId(agent.paneKey)
      if (!tabId) {
        continue
      }
      const current = next.get(tabId)
      if (!current || (current.parentPaneKey !== null && agent.parentPaneKey === null)) {
        next.set(tabId, agent)
      }
    }
    return next
  }, [agents])
  const rowCenters = useMemo(
    () => tabs.map((_, index) => index * TAB_ROW_HEIGHT_PT + TAB_ROW_HEIGHT_PT / 2),
    [tabs]
  )
  const lastRowCenter = rowCenters.at(-1)

  return (
    <View className="relative mt-1">
      {lastRowCenter === undefined ? null : (
        <View
          pointerEvents="none"
          className="bg-foreground/30 w-hairline absolute"
          style={{
            left: ROOT_TAB_RAIL_LEFT_PT,
            top: -railStartOffsetPt,
            height: lastRowCenter + railStartOffsetPt
          }}
        />
      )}
      {rowCenters.map((center) => (
        <View
          key={center}
          pointerEvents="none"
          className="bg-foreground/30 h-hairline absolute"
          style={{
            left: ROOT_TAB_RAIL_LEFT_PT,
            top: center,
            width: ROOT_TAB_RAIL_ELBOW_WIDTH_PT
          }}
        />
      ))}
      {tabs.map((tab) => (
        <WorkspaceOpenTabRow
          key={tab.id}
          agent={agentByTabId.get(tab.id)}
          now={now}
          tab={tab}
          onPress={onPress}
          unvisited={unvisited}
        />
      ))}
    </View>
  )
}
