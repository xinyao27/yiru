import type { RuntimeWorktreeAgentRow } from '@yiru/runtime-protocol/mobile-runtime-types'
import { Text, View } from 'react-native'

import { cn } from '@/style/class-names'

import { agentDisplayLabel, agentDotState, formatTimeAgo } from '../worktree/agent-row-display'
import { AgentStateDot } from './agent-state-dot'
import { MobileAgentIcon } from './mobile-agent-icon'

const INDENT_PER_DEPTH = 14

type Props = {
  agent: RuntimeWorktreeAgentRow
  depth: number
  now: number
  // Bold/foreground until the user has visited the worktree, mirroring desktop's
  // unvisited rule (the workspace title and its agent rows share one signal).
  unvisited: boolean
}

// One inline agent row: state dot → identity → last message/prompt → time ago.
// Mirrors desktop DashboardAgentRow's compact in-card layout.
export function WorktreeAgentRow({ agent, depth, now, unvisited }: Props) {
  const dotState = agentDotState(agent, now)
  const label = agentDisplayLabel(agent, now)
  const ts = formatTimeAgo(agent.stateStartedAt, now)

  return (
    <View className={styles.row} style={[{ paddingLeft: depth * INDENT_PER_DEPTH }]}>
      <AgentStateDot state={dotState} />
      {/* Agent identity logo (Claude/Codex/…), matching the desktop sidebar's
          agent icons instead of a two-letter text code. */}
      {agent.agentType ? <MobileAgentIcon agentId={agent.agentType} size={13} /> : null}
      <Text className={cn(styles.label, unvisited && styles.labelUnvisited)} numberOfLines={1}>
        {label}
      </Text>
      <Text className={styles.time}>{ts}</Text>
    </View>
  )
}

const styles = {
  row: cn('flex-row items-center gap-1 mt-[3px]'),
  label: cn('flex-1 text-[11px] text-muted-foreground/60'),
  labelUnvisited: cn('text-foreground font-semibold'),
  time: cn('text-[10px] text-muted-foreground/60')
} as const
