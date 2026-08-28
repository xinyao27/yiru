import { Database } from 'bun:sqlite'
import { chmodSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'

import { migrateProjectHostV11, migrateWorktreeArchiveV9 } from './migrations'

const DATABASE_FILE_NAME = 'yiru.sqlite'
const DATABASE_SCHEMA_VERSION = 17
const DATABASE_BUSY_TIMEOUT_MS = 5_000

export class DaemonDatabase {
  readonly sqlite: Database

  constructor(userDataPath: string) {
    mkdirSync(userDataPath, { mode: 0o700, recursive: true })
    this.sqlite = openRecoverableDatabase(join(userDataPath, DATABASE_FILE_NAME))
    chmodSync(join(userDataPath, DATABASE_FILE_NAME), 0o600)
    this.sqlite.exec(`PRAGMA busy_timeout = ${DATABASE_BUSY_TIMEOUT_MS}`)
    this.sqlite.exec('PRAGMA journal_mode = WAL')
    this.sqlite.exec('PRAGMA foreign_keys = ON')
    this.sqlite.exec('PRAGMA wal_autocheckpoint = 1000')
    this.migrate()
  }

  close(): void {
    try {
      this.sqlite.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    } finally {
      this.sqlite.close(false)
    }
  }

  private migrate(): void {
    const version = this.sqlite
      .query<{ userVersion: number }, []>(
        'SELECT user_version AS userVersion FROM pragma_user_version'
      )
      .get()?.userVersion
    if (version === undefined || version > DATABASE_SCHEMA_VERSION) {
      throw new Error('daemon_database_schema_unsupported')
    }
    if (version === DATABASE_SCHEMA_VERSION) {
      return
    }
    this.sqlite.transaction(() => {
      this.sqlite.exec(`
        CREATE TABLE IF NOT EXISTS workspace_revision (
          scope TEXT PRIMARY KEY,
          revision INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS workspace_event (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          scope TEXT NOT NULL,
          revision INTEGER NOT NULL,
          kind TEXT NOT NULL,
          payload TEXT NOT NULL,
          occurred_at INTEGER NOT NULL,
          UNIQUE(scope, revision)
        );
        CREATE INDEX IF NOT EXISTS workspace_event_scope_id
          ON workspace_event(scope, id);
        CREATE TABLE IF NOT EXISTS execution_host (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL CHECK(kind IN ('ssh', 'wsl')),
          label TEXT NOT NULL,
          target TEXT NOT NULL,
          platform TEXT NOT NULL CHECK(platform IN ('darwin', 'linux', 'win32', 'unknown')),
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS project (
          id TEXT PRIMARY KEY,
          path TEXT NOT NULL,
          host_id TEXT NOT NULL DEFAULT 'local',
          display_name TEXT NOT NULL,
          badge_color TEXT NOT NULL,
          kind TEXT NOT NULL CHECK(kind IN ('git', 'folder')),
          remote_url TEXT,
          added_at INTEGER NOT NULL,
          authority TEXT NOT NULL DEFAULT 'daemon'
            CHECK(authority IN ('daemon', 'workbench'))
        );
        CREATE TABLE IF NOT EXISTS project_remote (
          project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
          remote_name TEXT NOT NULL,
          remote_url TEXT NOT NULL,
          canonical_key TEXT NOT NULL,
          PRIMARY KEY(project_id, remote_name, remote_url)
        );
        CREATE INDEX IF NOT EXISTS project_remote_canonical
          ON project_remote(canonical_key, project_id);
        CREATE TABLE IF NOT EXISTS artifact (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
          file_name TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          byte_length INTEGER NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('writing', 'ready')),
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS artifact_project_created
          ON artifact(project_id, created_at DESC);
        CREATE TABLE IF NOT EXISTS mobile_device (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          token TEXT NOT NULL UNIQUE,
          apns_token TEXT,
          apns_environment TEXT CHECK(apns_environment IN ('production', 'sandbox')),
          push_updated_at INTEGER,
          paired_at INTEGER NOT NULL,
          last_seen_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS mobile_notification (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          payload TEXT NOT NULL,
          occurred_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS browser_replay (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
          page_url TEXT NOT NULL,
          page_title TEXT NOT NULL,
          started_at INTEGER NOT NULL,
          ended_at INTEGER NOT NULL,
          events_json TEXT NOT NULL,
          video_artifact_id TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS browser_replay_project_created
          ON browser_replay(project_id, created_at DESC);
        CREATE TABLE IF NOT EXISTS visual_capture (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
          worktree_id TEXT NOT NULL,
          page_url TEXT NOT NULL,
          width INTEGER NOT NULL,
          height INTEGER NOT NULL,
          diff_ratio REAL,
          image_artifact_id TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS visual_capture_project_created
          ON visual_capture(project_id, worktree_id, created_at DESC);
        CREATE TABLE IF NOT EXISTS agent_session (
          id TEXT PRIMARY KEY,
          terminal_handle TEXT NOT NULL UNIQUE,
          worktree_id TEXT NOT NULL,
          agent TEXT NOT NULL,
          phase TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('running', 'complete', 'interrupted')),
          title TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          completed_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS agent_session_worktree_updated
          ON agent_session(worktree_id, updated_at DESC);
        CREATE TABLE IF NOT EXISTS worktree_archive (
          id TEXT PRIMARY KEY,
          repo_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
          original_worktree_id TEXT NOT NULL,
          path TEXT NOT NULL,
          branch TEXT NOT NULL,
          head TEXT NOT NULL,
          stash_oid TEXT,
          status TEXT NOT NULL CHECK(status IN ('archiving', 'archived', 'failed', 'restored')),
          failure_detail TEXT,
          created_at INTEGER NOT NULL,
          restored_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS worktree_archive_repo_created
          ON worktree_archive(repo_id, created_at DESC);
        CREATE TABLE IF NOT EXISTS ritual_schedule (
          id INTEGER PRIMARY KEY CHECK(id = 1),
          enabled INTEGER NOT NULL CHECK(enabled IN (0, 1)),
          start_minutes INTEGER NOT NULL CHECK(start_minutes BETWEEN 0 AND 1439),
          end_minutes INTEGER NOT NULL CHECK(end_minutes BETWEEN 0 AND 1439),
          timezone TEXT NOT NULL,
          weekdays_json TEXT NOT NULL,
          archive_on_end_day INTEGER NOT NULL CHECK(archive_on_end_day IN (0, 1)),
          last_start_at INTEGER,
          last_end_at INTEGER,
          last_failure TEXT
        );
        CREATE TABLE IF NOT EXISTS dangerous_credential (
          id INTEGER PRIMARY KEY CHECK(id = 1),
          credential_id TEXT NOT NULL UNIQUE,
          public_key_spki TEXT NOT NULL,
          user_id TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
      `)
      if (version < 9 && !hasColumn(this.sqlite, 'worktree_archive', 'failure_detail')) {
        migrateWorktreeArchiveV9(this.sqlite)
      }
    })()
    if (version < 11 && !hasColumn(this.sqlite, 'project', 'host_id')) {
      migrateProjectHostV11(this.sqlite)
    }
    if (version < 12 && !hasColumn(this.sqlite, 'browser_replay', 'video_artifact_id')) {
      this.sqlite.exec('ALTER TABLE browser_replay ADD COLUMN video_artifact_id TEXT')
    }
    if (version < 13 && !hasColumn(this.sqlite, 'visual_capture', 'image_artifact_id')) {
      this.sqlite.exec('ALTER TABLE visual_capture ADD COLUMN image_artifact_id TEXT')
    }
    if (version < 16 && !hasColumn(this.sqlite, 'mobile_device', 'apns_token')) {
      this.sqlite.exec(`
        ALTER TABLE mobile_device ADD COLUMN apns_token TEXT;
        ALTER TABLE mobile_device ADD COLUMN apns_environment TEXT
          CHECK(apns_environment IN ('production', 'sandbox'));
        ALTER TABLE mobile_device ADD COLUMN push_updated_at INTEGER;
      `)
    }
    if (version < 17 && !hasColumn(this.sqlite, 'project', 'authority')) {
      this.sqlite.exec(
        `ALTER TABLE project ADD COLUMN authority TEXT NOT NULL DEFAULT 'daemon'
          CHECK(authority IN ('daemon', 'workbench'))`
      )
    }
    this.sqlite.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS project_host_path ON project(host_id, path)'
    )
    this.sqlite.exec(`PRAGMA user_version = ${DATABASE_SCHEMA_VERSION}`)
  }
}

function hasColumn(database: Database, table: string, column: string): boolean {
  return database
    .query<{ name: string }, []>(`SELECT name FROM pragma_table_info('${table}')`)
    .all()
    .some((entry) => entry.name === column)
}

function openRecoverableDatabase(filePath: string): Database {
  const database = openDatabase(filePath)
  try {
    const check = database
      .query<{ quick_check: string }, []>('PRAGMA quick_check')
      .get()?.quick_check
    if (check === 'ok') {
      return database
    }
  } catch {}
  database.close(false)
  preserveCorruptDatabase(filePath)
  return openDatabase(filePath)
}

function openDatabase(filePath: string): Database {
  return new Database(filePath, { create: true, strict: true })
}

function preserveCorruptDatabase(filePath: string): void {
  const suffix = `.corrupt-${Date.now()}-${process.pid}`
  for (const sidecar of ['', '-wal', '-shm']) {
    const source = `${filePath}${sidecar}`
    if (existsSync(source)) {
      renameSync(source, `${filePath}${suffix}${sidecar}`)
    }
  }
}
