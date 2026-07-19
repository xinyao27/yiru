import {
  isSpoolAgentLaunchId,
  type SpoolAgentLaunchId
} from '../../shared/spool/spool-agent-launch-contract'

export type SpoolLiveSessionDisplayIdentity =
  | { sessionKind: 'terminal'; agent: null }
  | { sessionKind: 'agent'; agent: SpoolAgentLaunchId | null }

export type SpoolLiveSessionProvider = 'claude' | 'codex' | 'other'

export type SpoolLiveSessionIdentity = {
  provider: SpoolLiveSessionProvider
  providerSessionId: string | null
} & SpoolLiveSessionDisplayIdentity

export function resolveSpoolLiveSessionIdentity(args: {
  observedAgentType?: string | null
  observedProviderSessionId?: string | null
  binding?: SpoolLiveSessionIdentity | null
  launchAgent?: string | null
}): SpoolLiveSessionIdentity {
  const displayIdentity = resolveSpoolLiveSessionDisplayIdentity({
    observedAgentType: args.observedAgentType,
    boundSessionKind: args.binding?.sessionKind,
    boundAgent: args.binding?.agent,
    launchAgent: args.launchAgent
  })
  const observedAgentType = args.observedAgentType?.trim()
  if (observedAgentType) {
    const provider = spoolObservedAgentProvider(observedAgentType) ?? 'other'
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
  const launchProvider = spoolObservedAgentProvider(args.launchAgent)
  return {
    provider: launchProvider ?? 'other',
    providerSessionId: null,
    ...displayIdentity
  }
}

export function spoolObservedAgentProvider(
  agentType: string | null | undefined
): 'claude' | 'codex' | null {
  const normalized = agentType?.trim()
  return normalized === 'claude' || normalized === 'codex' ? normalized : null
}

export function resolveSpoolLiveSessionDisplayIdentity(args: {
  observedAgentType?: string | null
  boundSessionKind?: 'terminal' | 'agent'
  boundAgent?: SpoolAgentLaunchId | null
  launchAgent?: string | null
}): SpoolLiveSessionDisplayIdentity {
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
      agent: isSpoolAgentLaunchId(observedAgentType) ? observedAgentType : null
    }
  }
  if (args.boundSessionKind === 'agent') {
    return { sessionKind: 'agent', agent: args.boundAgent ?? null }
  }
  const launchAgent = args.launchAgent?.trim()
  if (launchAgent) {
    return {
      sessionKind: 'agent',
      agent: isSpoolAgentLaunchId(launchAgent) ? launchAgent : null
    }
  }
  return { sessionKind: 'terminal', agent: null }
}
