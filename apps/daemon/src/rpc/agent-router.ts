import type { AgentSessionService } from '../sessions/service'
import { daemonImplementation } from './contract'

export function createAgentSessionRouter(agentSessions: AgentSessionService) {
  return {
    providers: daemonImplementation.agentSession.providers.handler(async ({ input }) => ({
      providers: await agentSessions.providers(input.hostId)
    })),
    list: daemonImplementation.agentSession.list.handler(async ({ input }) => ({
      sessions: await agentSessions.list(input.worktreeId)
    })),
    start: daemonImplementation.agentSession.start.handler(async ({ input }) => ({
      session: await agentSessions.start(input)
    })),
    followup: daemonImplementation.agentSession.followup.handler(({ input }) =>
      agentSessions.followup(input)
    ),
    stop: daemonImplementation.agentSession.stop.handler(async ({ input }) => ({
      session: await agentSessions.stop(input.sessionId)
    }))
  }
}
