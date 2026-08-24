import { SCHEMA_VERSION } from './orchestration-db-foundation'
import { OrchestrationDbMigrationLate } from './orchestration-db-migration-late'
import { resolveOrchestrationMigrationStartVersion } from './orchestration-schema-version-skew'

export abstract class OrchestrationDbLayer2 extends OrchestrationDbMigrationLate {
  // Why: CREATE TABLE IF NOT EXISTS won't alter existing DBs; migrate in a txn that bumps user_version only on success (atomic all-or-nothing).
  protected migrate(): void {
    const storedVersion = this.db.pragma('user_version', { simple: true }) as number
    const current = resolveOrchestrationMigrationStartVersion(
      this.db,
      storedVersion,
      SCHEMA_VERSION
    )
    if (current >= SCHEMA_VERSION) {
      return
    }

    this.db.exec('BEGIN')
    try {
      this.migrateThroughVersion8(current)
      this.migrateFromVersion9(current)
      this.db.pragma(`user_version = ${SCHEMA_VERSION}`)
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }
}
