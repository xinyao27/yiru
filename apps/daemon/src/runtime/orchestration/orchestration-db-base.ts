import Database from '~main/sqlite/sync-database'

import { hardenOrchestrationDatabaseFiles } from './orchestration-db-foundation'

export abstract class OrchestrationDbBase {
  protected db: Database

  // Why: the orchestration DB is created lazily for ALL users, but only the
  // small minority who dispatch work ever have dispatch_contexts rows. The
  // renderer graph publish rebuilds orchestration context on every 16ms tick
  // (buildAgentOrchestrationByPaneKey), issuing 2 queries per terminal. Cache
  // emptiness so the non-orchestration majority short-circuits the whole
  // per-terminal fan-out. Only createDispatchContext flips this false→true.
  protected hasAnyDispatchContextsCache: boolean | undefined

  constructor(dbPath: string | ':memory:') {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('busy_timeout = 5000')
    this.createTables()
    this.migrate()
    hardenOrchestrationDatabaseFiles(dbPath)
  }

  protected abstract createTables(): void
  protected abstract migrate(): void
}
