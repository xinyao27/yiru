import {
  isCoworkingAgentLaunchId,
  type CoworkingAgentLaunchId
} from '../../shared/coworking/agent-launch-contract'

export type CoworkingLiveSessionDisplayIdentity =
  | { sessionKind: 'terminal'; agent: null }
  | { sessionKind: 'agent'; agent: CoworkingAgentLaunchId | null }

export type CoworkingLiveSessionProvider = 'claude' | 'codex' | 'other'

export type CoworkingLiveSessionIdentity = {
  provider: CoworkingLiveSessionProvider
  providerSessionId: string | null
} & CoworkingLiveSessionDisplayIdentity

export function resolveCoworkingLiveSessionIdentity(args: {
  observedAgentType?: string | null
  observedProviderSessionId?: string | null
  binding?: CoworkingLiveSessionIdentity | null
  launchAgent?: string | null
}): CoworkingLiveSessionIdentity {
  const displayIdentity = resolveCoworkingLiveSessionDisplayIdentity({
    observedAgentType: args.observedAgentType,
    boundSessionKind: args.binding?.sessionKind,
    boundAgent: args.binding?.agent,
    launchAgent: args.launchAgent
  })
  const observedAgentType = args.observedAgentType?.trim()
  if (observedAgentType) {
    const provider = coworkingObservedAgentProvider(observedAgentType) ?? 'other'
    return {
      provider,
      providerSessionId: provider === 'other' ? null : (args.observedProviderSessionId ?? null),
      ...displayIdentity
    }
  }
  if (args.binding) {
    return {
      provider: args.binding.provider,
      providerSessionId: args.binding.providerSessionId,
      ...displayIdentity
    }
  }
  const launchProvider = coworkingObservedAgentProvider(args.launchAgent)
  return {
    provider: launchProvider ?? 'other',
    providerSessionId: null,
    ...displayIdentity
  }
}

export function coworkingObservedAgentProvider(
  agentType: string | null | undefined
): 'claude' | 'codex' | null {
  const normalized = agentType?.trim()
  return normalized === 'claude' || normalized === 'codex' ? normalized : null
}

export function resolveCoworkingLiveSessionDisplayIdentity(args: {
  observedAgentType?: string | null
  boundSessionKind?: 'terminal' | 'agent'
  boundAgent?: CoworkingAgentLaunchId | null
  launchAgent?: string | null
}): CoworkingLiveSessionDisplayIdentity {
  const observedAgentType = args.observedAgentType?.trim()
  if (
    args.boundSessionKind === 'agent' &&
    args.boundAgent === 'claude-agent-teams' &&
    observedAgentType === 'claude'
  ) {
    // Why: Agent Teams uses Claude hooks, but its launch identity is the more precise UI label.
    return { sessionKind: 'agent', agent: args.boundAgent }
  }
  if (observedAgentType) {
    return {
      sessionKind: 'agent',
      // Why: custom agents stay distinguishable from shells without silently widening the wire enum.
      agent: isCoworkingAgentLaunchId(observedAgentType) ? observedAgentType : null
    }
  }
  if (args.boundSessionKind === 'agent') {
    return { sessionKind: 'agent', agent: args.boundAgent ?? null }
  }
  const launchAgent = args.launchAgent?.trim()
  if (launchAgent) {
    return {
      sessionKind: 'agent',
      agent: isCoworkingAgentLaunchId(launchAgent) ? launchAgent : null
    }
  }
  return { sessionKind: 'terminal', agent: null }
}
