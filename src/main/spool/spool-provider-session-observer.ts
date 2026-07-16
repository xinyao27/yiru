import type {
  SpoolMobileSessionTabsResult,
  SpoolObservedProviderSession
} from './spool-session-source'
import type { ObservedWorktreeProvenanceScope } from './spool-observed-worktree-provenance'
import { spoolObservedAgentProvider } from './spool-live-session-display-identity'
import { normalizeSpoolSessionIdentifier } from './spool-mobile-vault-session-projection'
import type { SpoolSessionIdentityAliases } from './spool-session-identity-aliases'
import type { SpoolSessionProvenanceIndex } from './spool-session-provenance-index'
import type { SpoolTerminalSessionBindings } from './spool-terminal-session-bindings'

const MAX_PROVIDER_SESSION_ID_LENGTH = 512

/** Records positive live provider proof while keeping owner session aliases stable. */
export class SpoolProviderSessionObserver {
  constructor(
    private readonly sessionBindings: SpoolTerminalSessionBindings,
    private readonly identityAliases: SpoolSessionIdentityAliases,
    private readonly provenance: SpoolSessionProvenanceIndex
  ) {}

  observeSnapshot(
    snapshot: SpoolMobileSessionTabsResult,
    worktree: ObservedWorktreeProvenanceScope
  ): void {
    const entries: Parameters<SpoolSessionProvenanceIndex['attest']>[0][number][] = []
    for (const tab of snapshot.tabs) {
      if (tab.type !== 'terminal' || tab.status !== 'ready') {
        continue
      }
      const explicitIdentity = tab.spoolLiveSessionIdentity
      const provider = explicitIdentity
        ? spoolObservedAgentProvider(explicitIdentity.provider)
        : spoolObservedAgentProvider(tab.agentStatus?.agentType)
      const providerSessionId = normalizeSpoolSessionIdentifier(
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
      const sessionKey = normalizeSpoolSessionIdentifier(
        tab.spoolSessionKey ?? observedBinding?.sessionKey,
        512
      )
      if (sessionKey) {
        this.identityAliases.remember(worktree, provider, providerSessionId, sessionKey)
      }
      entries.push({
        actualHostScope: worktree.actualHostScope,
        provider,
        providerSessionId,
        worktreeInstanceId: worktree.instanceId,
        spoolIncarnationId: worktree.spoolIncarnationId
      })
    }
    this.attest(entries)
  }

  observeExplicit(
    sessions: readonly SpoolObservedProviderSession[],
    worktree: ObservedWorktreeProvenanceScope
  ): void {
    for (const session of sessions) {
      if (session.sessionKey) {
        this.identityAliases.remember(
          worktree,
          session.provider,
          session.providerSessionId,
          session.sessionKey
        )
      }
    }
    this.attest(
      sessions.map((session) => ({
        actualHostScope: worktree.actualHostScope,
        provider: session.provider,
        providerSessionId: session.providerSessionId,
        worktreeInstanceId: worktree.instanceId,
        spoolIncarnationId: worktree.spoolIncarnationId
      }))
    )
  }

  private attest(entries: Parameters<SpoolSessionProvenanceIndex['attest']>[0]): void {
    if (entries.length === 0) {
      return
    }
    try {
      this.provenance.attest(entries)
    } catch {
      // Why: failed positive proof hides later history but must not break runtime hook delivery.
      console.error('[spool] Failed to persist created-session provenance')
    }
  }
}
