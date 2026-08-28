import { Database, type SQLQueryBindings, type Statement } from 'bun:sqlite'
import { existsSync } from 'node:fs'

type SqlitePath = ConstructorParameters<typeof Database>[0]

type SyncDatabaseOptions = {
  readonly?: boolean
  fileMustExist?: boolean
  timeout?: number
}

type PragmaOptions = {
  simple?: boolean
}

type StatementResult = Record<string, unknown>
type BunStatement = Statement<StatementResult, SQLQueryBindings[]>

export class SqliteStatement {
  private readonly statement: BunStatement

  constructor(statement: BunStatement) {
    this.statement = statement
  }

  all(...bindings: SQLQueryBindings[]): StatementResult[] {
    return this.statement.all(...bindings)
  }

  get(...bindings: SQLQueryBindings[]): StatementResult | undefined {
    return this.statement.get(...bindings) ?? undefined
  }

  run(...bindings: SQLQueryBindings[]): { changes: number; lastInsertRowid: number | bigint } {
    return this.statement.run(...bindings)
  }
}

export type SqliteBindValue = SQLQueryBindings

class SyncDatabase {
  private readonly db: Database

  constructor(path: SqlitePath, options: SyncDatabaseOptions = {}) {
    if (
      options.fileMustExist &&
      typeof path === 'string' &&
      path !== ':memory:' &&
      !existsSync(path)
    ) {
      throw new Error(`SQLite database does not exist: ${path}`)
    }
    this.db = new Database(path, {
      create: options.readonly ? false : !options.fileMustExist,
      readonly: options.readonly,
      readwrite: options.readonly !== true,
      strict: true
    })
    if (options.timeout !== undefined) {
      this.db.exec(`PRAGMA busy_timeout = ${Math.max(0, Math.trunc(options.timeout))}`)
    }
  }

  exec(sql: string): void {
    this.db.exec(sql)
  }

  prepare(sql: string): SqliteStatement {
    return new SqliteStatement(this.db.prepare<StatementResult, SQLQueryBindings[]>(sql))
  }

  pragma(sql: string, options?: PragmaOptions): unknown {
    const statement = this.db.prepare(`PRAGMA ${sql}`)
    if (options?.simple) {
      const row = statement.get()
      if (!row) {
        return undefined
      }
      return Object.values(row)[0]
    }
    return statement.all()
  }

  close(): void {
    this.db.close()
  }
}

export default SyncDatabase
