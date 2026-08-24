import type { Store } from '~main/persistence'

import { ClaudeRuntimePathResolver } from './runtime-paths'

export abstract class ClaudeRuntimeAuthBase {
  protected readonly pathResolver = new ClaudeRuntimePathResolver()
  protected mutationQueue: Promise<unknown> = Promise.resolve()
  protected lastSyncedAccountId: string | null = null
  // Why: tracks the credentials Yiru last wrote to the shared credentials file.
  // On managed→system-default transition, if the file differs from this value,
  // an external login (e.g. `claude auth login`) overwrote it — so Yiru adopts
  // the file as the new system default instead of restoring a stale snapshot.
  protected lastWrittenCredentialsJson: string | null = null
  protected hasMaterializedRuntimeAuth = false
  protected hasLastWrittenOauthAccount = false
  protected lastWrittenOauthAccount: unknown = null
  protected skipNextReadBackForAccountId: string | null = null
  protected managedRefreshDeferredByLivePtyAccountId: string | null = null
  protected readonly store: Store

  constructor(store: Store) {
    this.store = store
    this.initializeLastSyncedState()
    void this.safeSyncForCurrentSelection()
  }

  protected abstract initializeLastSyncedState(): void
  protected abstract safeSyncForCurrentSelection(): Promise<void>
}
