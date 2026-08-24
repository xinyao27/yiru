import type { Store } from '~main/persistence'

export abstract class CodexRuntimeHomeBase {
  // Why: tracks whether the runtime auth.json currently mirrors a managed
  // account. When null, runtime auth follows the user's system-default
  // ~/.codex/auth.json instead of being written back to a managed account.
  protected lastSyncedAccountId: string | null = null
  // Why: tracks the auth.json content Yiru last wrote to the runtime CODEX_HOME.
  // Between syncs, if the file differs, Codex CLI refreshed the token — so
  // Yiru writes back the refreshed token to managed storage before overwriting.
  // On managed→system-default transition, if the file differs, an external
  // login (e.g. `codex auth login`) overwrote it — so Yiru adopts the file as
  // the new system default instead of restoring a stale snapshot.
  protected lastWrittenAuthJson: string | null = null
  // Why: WSL terminals have their own stable runtime homes per distro. They
  // cannot share the host baseline or host sync can make stale WSL auth look
  // newer than managed storage.
  protected readonly lastWrittenWslAuthJsonByDistro = new Map<string, string | null>()
  protected readonly lastSyncedWslAccountIdByDistro = new Map<string, string | null>()
  protected readonly wslRuntimeHomePathByDistro = new Map<string, string>()
  protected skipNextReadBackForAccountId: string | null = null
  // Why: auth refreshed in a per-account home must never be replaced with
  // stale bytes left behind in the legacy shared runtime mirror.
  protected lastHostAccountUsedSelfContainedHome = false

  protected realHomeLaneGate: () => boolean = () => true
  protected readonly store: Store

  constructor(store: Store) {
    this.store = store
    this.safeMigrateLegacySharedAuth()
    this.safeMigrateLegacyManagedState()
    this.safeMigrateLegacyActiveHomePointer()
    this.initializeLastSyncedState()
    this.safeSyncForCurrentSelection()
  }

  protected abstract initializeLastSyncedState(): void
  protected abstract safeMigrateLegacySharedAuth(): void
  protected abstract safeMigrateLegacyManagedState(): void
  protected abstract safeMigrateLegacyActiveHomePointer(): void
  protected abstract safeSyncForCurrentSelection(): void
}
