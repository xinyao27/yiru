import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync, type StatementSync } from 'node:sqlite'

const EVENT_HASH_BYTES = 16
// Why: v2 invalidates ownership and aggregate caches created before fork-copy
// suppression and provider-total normalization were aligned with Codex logs.
const GENERATION_KEY = 'generation-v2'

type OwnershipStatements = {
  deleteEventsForFile: StatementSync
  deleteFile: StatementSync
  findFile: StatementSync
  findOwner: StatementSync
  getGeneration: StatementSync
  insertEvent: StatementSync
  insertFile: StatementSync
  setGeneration: StatementSync
}

export class CodexUsageOwnershipIndex {
  private readonly database: DatabaseSync
  private readonly statements: OwnershipStatements
  private isTransactionOpen = false

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true })
    this.database = new DatabaseSync(databasePath, { timeout: 5_000 })
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY,
        path TEXT NOT NULL UNIQUE
      );
      CREATE TABLE IF NOT EXISTS events (
        event_hash BLOB PRIMARY KEY,
        file_id INTEGER NOT NULL
      ) WITHOUT ROWID;
      CREATE INDEX IF NOT EXISTS events_file_id ON events(file_id);
    `)
    this.statements = {
      deleteEventsForFile: this.database.prepare('DELETE FROM events WHERE file_id = ?'),
      deleteFile: this.database.prepare('DELETE FROM files WHERE id = ?'),
      findFile: this.database.prepare('SELECT id FROM files WHERE path = ?'),
      findOwner: this.database.prepare('SELECT file_id FROM events WHERE event_hash = ?'),
      getGeneration: this.database.prepare('SELECT value FROM metadata WHERE key = ?'),
      insertEvent: this.database.prepare(
        'INSERT OR IGNORE INTO events(event_hash, file_id) VALUES (?, ?)'
      ),
      insertFile: this.database.prepare('INSERT INTO files(path) VALUES (?)'),
      setGeneration: this.database.prepare(
        'INSERT OR REPLACE INTO metadata(key, value) VALUES (?, ?)'
      )
    }
  }

  getGeneration(): string | null {
    const value = this.statements.getGeneration.get(GENERATION_KEY)?.value
    return typeof value === 'string' ? value : null
  }

  begin(reset: boolean): void {
    this.database.exec('BEGIN IMMEDIATE')
    this.isTransactionOpen = true
    if (reset) {
      this.database.exec(`
        DROP INDEX IF EXISTS events_file_id;
        DELETE FROM events;
        DELETE FROM files;
        DELETE FROM metadata;
      `)
    }
  }

  removeFile(filePath: string): boolean {
    const fileId = readInteger(this.statements.findFile.get(filePath)?.id)
    if (fileId === null) {
      return false
    }
    const removedEvents = this.statements.deleteEventsForFile.run(fileId).changes
    this.statements.deleteFile.run(fileId)
    return removedEvents > 0
  }

  prepareFile(filePath: string): number {
    this.removeFile(filePath)
    this.statements.insertFile.run(filePath)
    const fileId = readInteger(this.statements.findFile.get(filePath)?.id)
    if (fileId === null) {
      throw new Error('codex_usage_ownership_file_missing')
    }
    return fileId
  }

  claimEvent(fileId: number, eventKey: string): boolean {
    const eventHash = createHash('sha256').update(eventKey).digest().subarray(0, EVENT_HASH_BYTES)
    const inserted = this.statements.insertEvent.run(eventHash, fileId)
    if (inserted.changes > 0) {
      return true
    }
    return readInteger(this.statements.findOwner.get(eventHash)?.file_id) === fileId
  }

  commit(): string {
    const generation = randomUUID()
    this.database.exec('CREATE INDEX IF NOT EXISTS events_file_id ON events(file_id)')
    this.statements.setGeneration.run(GENERATION_KEY, generation)
    this.database.exec('COMMIT')
    this.isTransactionOpen = false
    return generation
  }

  rollback(): void {
    if (!this.isTransactionOpen) {
      return
    }
    this.database.exec('ROLLBACK')
    this.isTransactionOpen = false
  }

  close(): void {
    this.rollback()
    this.database.close()
  }
}

function readInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return value
  }
  if (typeof value === 'bigint' && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value)
  }
  return null
}
