import { z } from 'zod'

import type { RuntimeCapability } from './protocol-version'

// Why: these names are frozen before implementation, but hosts must advertise
// each one only after the corresponding behavior is actually available.
export const TERMINAL_HOST_AUTHORITY_RUNTIME_CAPABILITY = 'terminal.host-authority.v1' as const
export const TERMINAL_PARSE_ACK_RUNTIME_CAPABILITY = 'terminal.parse-ack.v1' as const
export const TERMINAL_ORPHAN_ADOPTION_RUNTIME_CAPABILITY = 'terminal.orphan-adoption.v1' as const
export const TERMINAL_CLOSE_LIFECYCLE_RUNTIME_CAPABILITY = 'terminal.close-lifecycle.v1' as const
export const QUICK_COMMANDS_REMOTE_RUNTIME_CAPABILITY = 'quick-commands.remote.v1' as const
export const EXTERNAL_EDITOR_REMOTE_SSH_RUNTIME_CAPABILITY =
  'external-editor.remote-ssh.v1' as const
export const REMOTE_UPDATER_CONTROL_RUNTIME_CAPABILITY = 'updater.remote-control.v1' as const
export const CODEX_SUBAGENTS_RUNTIME_CAPABILITY = 'agent.codex-subagents.v1' as const
export const AGENT_USER_INPUT_RUNTIME_CAPABILITY = 'agent.request-user-input.v1' as const
export const SESSION_CONTINUE_NEW_RUNTIME_CAPABILITY = 'session.continue-new.v1' as const

const CapabilityNameSchema = z.string().trim().min(1)

export const RuntimeCapabilityAdvertisementSchema = z
  .object({
    runtimeId: z.string().trim().min(1),
    capabilities: z.array(CapabilityNameSchema).optional()
  })
  .strip()
  .transform(({ runtimeId, capabilities }) => ({
    runtimeId,
    // Why: absence is an old-host advertisement of no optional support, while
    // duplicate and unknown future names are safe additive wire data.
    capabilities: [...new Set(capabilities ?? [])]
  }))

export const RuntimeCapabilityProviderSchema = z.enum([
  'native',
  'wsl',
  'ssh',
  'relay',
  'paired-runtime'
])

export const RuntimeCapabilityHostScopeSchema = z
  .object({
    provider: RuntimeCapabilityProviderSchema,
    hostIdentity: z.string().trim().min(1)
  })
  .strict()

export const RuntimeCapabilityScopeSchema = RuntimeCapabilityHostScopeSchema.extend({
  runtimeIncarnation: z.string().trim().min(1),
  connectionGeneration: z.number().int().nonnegative()
})

export const RuntimeCapabilitySnapshotSchema = RuntimeCapabilityScopeSchema.extend({
  capabilities: z.array(CapabilityNameSchema).transform((values) => [...new Set(values)])
})

export type RuntimeCapabilityScope = z.infer<typeof RuntimeCapabilityScopeSchema>
export type RuntimeCapabilitySnapshot = z.infer<typeof RuntimeCapabilitySnapshotSchema>
export type RuntimeCapabilityVerdict = 'supported' | 'unsupported' | 'unknown'
export type RuntimeCapabilitySnapshotUpdate =
  | 'applied'
  | 'stale-generation'
  | 'incarnation-conflict'

function hostScopeKey(scope: Pick<RuntimeCapabilityScope, 'provider' | 'hostIdentity'>): string {
  return JSON.stringify([scope.provider, scope.hostIdentity])
}

export class RuntimeCapabilityCache {
  private readonly snapshotByHost = new Map<string, RuntimeCapabilitySnapshot>()

  replace(snapshot: RuntimeCapabilitySnapshot): RuntimeCapabilitySnapshotUpdate {
    const normalized = RuntimeCapabilitySnapshotSchema.parse(snapshot)
    const key = hostScopeKey(normalized)
    const current = this.snapshotByHost.get(key)
    if (current && normalized.connectionGeneration < current.connectionGeneration) {
      return 'stale-generation'
    }
    if (
      current &&
      normalized.connectionGeneration === current.connectionGeneration &&
      normalized.runtimeIncarnation !== current.runtimeIncarnation
    ) {
      // Why: runtimes have no ordering inside one transport generation; the
      // caller must advance the generation before a replacement can be trusted.
      return 'incarnation-conflict'
    }
    this.snapshotByHost.set(key, normalized)
    return 'applied'
  }

  verdict(scope: RuntimeCapabilityScope, capability: RuntimeCapability): RuntimeCapabilityVerdict {
    const normalized = RuntimeCapabilityScopeSchema.parse(scope)
    const snapshot = this.snapshotByHost.get(hostScopeKey(normalized))
    if (
      !snapshot ||
      snapshot.runtimeIncarnation !== normalized.runtimeIncarnation ||
      snapshot.connectionGeneration !== normalized.connectionGeneration
    ) {
      return 'unknown'
    }
    return snapshot.capabilities.includes(capability) ? 'supported' : 'unsupported'
  }

  clearHost(scope: Pick<RuntimeCapabilityScope, 'provider' | 'hostIdentity'>): void {
    const normalized = RuntimeCapabilityHostScopeSchema.parse({
      provider: scope.provider,
      hostIdentity: scope.hostIdentity
    })
    this.snapshotByHost.delete(hostScopeKey(normalized))
  }
}
