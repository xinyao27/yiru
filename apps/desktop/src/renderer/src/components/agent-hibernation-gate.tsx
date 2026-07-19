import { useEffect } from 'react'

import {
  startAgentHibernationCoordinator,
  stopAgentHibernationCoordinator
} from '@/lib/agent-hibernation-coordinator'
import { useAppStore } from '@/store'

export function AgentHibernationGate(): null {
  const enabled = useAppStore((state) => state.settings?.experimentalAgentHibernation === true)

  useEffect(() => {
    if (!enabled) {
      stopAgentHibernationCoordinator()
      return
    }
    return startAgentHibernationCoordinator()
  }, [enabled])

  return null
}
