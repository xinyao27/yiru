import { useEffect } from 'react'
import { useAppStore } from '~renderer/store'

import {
  startAgentHibernationCoordinator,
  stopAgentHibernationCoordinator
} from './agent-hibernation-coordinator'

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
