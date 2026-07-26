import { coworkingObservedAgentProvider } from './live-session-display-identity'
import { normalizeCoworkingSessionIdentifier } from './mobile-vault-session-projection'
import type { ObservedWorktreeProvenanceScope } from './observed-worktree-provenance'
import type { CoworkingSessionIdentityAliases } from './session/identity-aliases'
import type { CoworkingSessionProvenanceIndex } from './session/provenance-index'
import type {
  CoworkingMobileSessionTabsResult,
  CoworkingObservedProviderSession
} from './session/source'
import type { CoworkingTerminalSessionBindings } from './terminal-session-bindings'

const MAX_PROVIDER_SESSION_ID_LENGTH = 512

/** Records positive live provider proof while keeping owner session aliases stable. */
export class CoworkingProviderSessionObserver {
  constructor(
    private readonly sessionBindings: CoworkingTerminalSessionBindings,
    private readonly identityAliases: CoworkingSessionIdentityAliases,
    private readonly provenance: CoworkingSessionProvenanceIndex
  ) {}

  observeSnapshot(
    snapshot: CoworkingMobileSessionTabsResult,
    worktree: ObservedWorktreeProvenanceScope
  ): boolean {
    const entries: Parameters<CoworkingSessionProvenanceIndex['attest']>[0][number][] = []
    let aliasChanged = false
    for (const tab of snapshot.tabs) {
      if (tab.type !== 'terminal' || tab.status !== 'ready') {
        continue
      }
      const explicitIdentity = tab.coworkingLiveSessionIdentity
      const provider = explicitIdentity
        ? coworkingObservedAgentProvider(explicitIdentity.provider)
        : coworkingObservedAgentProvider(tab.agentStatus?.agentType)
      const providerSessionId = normalizeCoworkingSessionIdentifier(
        explicitIdentity?.providerSessionId ?? tab.agentStatus?.providerSession?.id,
        MAX_PROVIDER_SESSION_ID_LENGTH
      )
      if (!provider || !providerSessionId || !tab.worktreeInstanceId) {
        continue
      }
      const observedBinding = this.sessionBindings.observeProviderSession(
        tab.terminal,
        provider,
        providerSessionId,
        {
          worktreeId: snapshot.worktree,
          worktreeInstanceId: tab.worktreeInstanceId
        }
      )
      if (
        worktree.worktreeId !== snapshot.worktree ||
        worktree.instanceId !== tab.worktreeInstanceId
      ) {
        continue
      }
      const sessionKey = normalizeCoworkingSessionIdentifier(
        tab.coworkingSessionKey ?? observedBinding?.sessionKey,
        512
      )
      if (sessionKey) {
        aliasChanged =
          this.identityAliases.remember(worktree, provider, providerSessionId, sessionKey) ||
          aliasChanged
      }
      entries.push({
        actualHostScope: worktree.actualHostScope,
        provider,
        providerSessionId,
        worktreeInstanceId: worktree.instanceId,
        coworkingIncarnationId: worktree.coworkingIncarnationId
      })
    }
    return this.attest(entries) || aliasChanged
  }

  observeExplicit(
    sessions: readonly CoworkingObservedProviderSession[],
    worktree: ObservedWorktreeProvenanceScope
  ): boolean {
    let aliasChanged = false
    for (const session of sessions) {
      if (session.sessionKey) {
        aliasChanged =
          this.identityAliases.remember(
            worktree,
            session.provider,
            session.providerSessionId,
            session.sessionKey
          ) || aliasChanged
      }
    }
    return (
      this.attest(
        sessions.map((session) => ({
          actualHostScope: worktree.actualHostScope,
          provider: session.provider,
          providerSessionId: session.providerSessionId,
          worktreeInstanceId: worktree.instanceId,
          coworkingIncarnationId: worktree.coworkingIncarnationId
        }))
      ) || aliasChanged
    )
  }

  private attest(entries: Parameters<CoworkingSessionProvenanceIndex['attest']>[0]): boolean {
    if (entries.length === 0) {
      return false
    }
    try {
      return this.provenance.attest(entries)
    } catch {
      // Why: failed positive proof hides later history but must not break runtime hook delivery.
      console.error('[coworking] Failed to persist created-session provenance')
      return false
    }
  }
}
