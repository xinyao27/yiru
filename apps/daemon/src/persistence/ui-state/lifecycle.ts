import type { DurableStateFile } from '~main/persisted-state/durable-state-file'
import type { GitHubCacheFile } from '~main/persisted-state/github-cache-file'
import { MAX_CLAUDE_LIVE_PTY_SESSION_IDS } from '~main/persisted-state/persisted-terminal-session-codec'

import { PersistenceSlice, type PersistenceRuntime, type StoreMethodLookup } from '../slice'

export class StateLifecycleSlice extends PersistenceSlice {
  private readonly durableStateFile: DurableStateFile
  private readonly githubCacheFile: GitHubCacheFile

  constructor(
    runtime: PersistenceRuntime,
    lookupStoreMethod: StoreMethodLookup,
    durableStateFile: DurableStateFile,
    githubCacheFile: GitHubCacheFile
  ) {
    super(runtime, lookupStoreMethod)
    this.durableStateFile = durableStateFile
    this.githubCacheFile = githubCacheFile
  }

  getClaudeLivePtySessionIds(): string[] {
    return [...(this.state.claudeLivePtySessionIds ?? [])]
  }

  addClaudeLivePtySessionId(sessionId: string): void {
    if (sessionId.length === 0 || sessionId.length > 512) {
      return
    }
    const ids = this.state.claudeLivePtySessionIds ?? []
    if (ids.includes(sessionId)) {
      return
    }
    // Why: recency is the only useful ordering because stale ids are pruned at startup.
    this.state.claudeLivePtySessionIds = [...ids, sessionId].slice(-MAX_CLAUDE_LIVE_PTY_SESSION_IDS)
    // Why: force-quit after spawn must still seed the next launch's live-PTY gate.
    this.scheduleSave('sessions')
    this.flush()
  }

  removeClaudeLivePtySessionId(sessionId: string): void {
    const ids = this.state.claudeLivePtySessionIds ?? []
    if (!ids.includes(sessionId)) {
      return
    }
    this.state.claudeLivePtySessionIds = ids.filter((id) => id !== sessionId)
    this.scheduleSave('sessions')
  }

  flush(): void {
    try {
      this.flushOrThrow()
    } catch (err) {
      console.error('[persistence] Failed to flush state:', err)
    }
    this.githubCacheFile.writeIfDirty(this.state.githubCache)
  }

  // Why: a moved project's disk state becomes authoritative until relaunch.
  freezeWrites(): void {
    this.durableStateFile.freezeWrites()
  }
}
