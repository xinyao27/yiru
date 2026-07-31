import { useLocalSearchParams } from 'expo-router'

import { MobileAgentSessionHistoryPanel } from '~/agent-history/agent-session-history-panel'
import { firstParam } from '~/source-control/screen-state'

export default function MobileAgentSessionHistoryScreen() {
  const params = useLocalSearchParams<{
    hostId?: string | string[]
    worktreeId?: string | string[]
    name?: string | string[]
  }>()
  return (
    <MobileAgentSessionHistoryPanel
      hostId={firstParam(params.hostId)}
      worktreeId={firstParam(params.worktreeId)}
      name={firstParam(params.name)}
    />
  )
}
