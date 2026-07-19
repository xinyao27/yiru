import type {
  SpoolHistoricalSessionCandidate,
  SpoolSessionWorktreeIdentity
} from './spool-session-source'

const MAX_SESSION_IDENTITY_ALIASES = 2_000

type AliasScope = Pick<
  SpoolSessionWorktreeIdentity,
  'instanceId' | 'spoolIncarnationId' | 'actualHostScope'
>

type SessionIdentityAlias = {
  sessionKey: string
  instanceId: string
  spoolIncarnationId: string
  actualHostScope: string
}

/** Preserves one requester identity as a created agent moves from live PTY to history. */
export class SpoolSessionIdentityAliases {
  private readonly aliases = new Map<string, SessionIdentityAlias>()

  remember(
    worktree: AliasScope,
    provider: 'claude' | 'codex',
    providerSessionId: string,
    sessionKey: string
  ): boolean {
    if (!isBoundedIdentity(providerSessionId, 512) || !isBoundedIdentity(sessionKey, 512)) {
      return false
    }
    const key = aliasKey(worktree, provider, providerSessionId)
    if (this.aliases.get(key)?.sessionKey === sessionKey) {
      return false
    }
    for (const [existingKey, alias] of this.aliases) {
      if (
        existingKey !== key &&
        alias.sessionKey === sessionKey &&
        alias.instanceId === worktree.instanceId &&
        alias.spoolIncarnationId === worktree.spoolIncarnationId &&
        alias.actualHostScope === worktree.actualHostScope
      ) {
        // Why: a PTY can launch consecutive agents; only its current provider inherits the live ref.
        this.aliases.delete(existingKey)
      }
    }
    this.aliases.delete(key)
    this.aliases.set(key, {
      sessionKey,
      instanceId: worktree.instanceId,
      spoolIncarnationId: worktree.spoolIncarnationId,
      actualHostScope: worktree.actualHostScope
    })
    while (this.aliases.size > MAX_SESSION_IDENTITY_ALIASES) {
      const oldest = this.aliases.keys().next().value
      if (!oldest) {
        break
      }
      this.aliases.delete(oldest)
    }
    return true
  }

  resolve(
    worktree: AliasScope,
    session: Pick<SpoolHistoricalSessionCandidate, 'provider' | 'providerSessionId'>
  ): string | null {
    return (
      this.aliases.get(aliasKey(worktree, session.provider, session.providerSessionId))
        ?.sessionKey ?? null
    )
  }

  forget(instanceId: string): void {
    for (const [key, alias] of this.aliases) {
      if (alias.instanceId === instanceId) {
        this.aliases.delete(key)
      }
    }
  }
}

function aliasKey(
  worktree: AliasScope,
  provider: 'claude' | 'codex',
  providerSessionId: string
): string {
  return JSON.stringify([
    worktree.instanceId,
    worktree.spoolIncarnationId,
    worktree.actualHostScope,
    provider,
    providerSessionId
  ])
}

function isBoundedIdentity(value: string, maxLength: number): boolean {
  if (!value || value.length > maxLength) {
    return false
  }
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code <= 0x1f || code === 0x7f) {
      return false
    }
  }
  return true
}
