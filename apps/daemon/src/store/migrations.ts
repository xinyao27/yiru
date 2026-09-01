import type { Database } from 'bun:sqlite'

export function migrateWorktreeArchiveV9(database: Database): void {
  database.exec(`
    CREATE TABLE worktree_archive_v9 (
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
    INSERT INTO worktree_archive_v9(
      id, repo_id, original_worktree_id, path, branch, head, stash_oid,
      status, failure_detail, created_at, restored_at
    )
    SELECT id, repo_id, original_worktree_id, path, branch, head, stash_oid,
           status, NULL, created_at, restored_at
    FROM worktree_archive;
    DROP TABLE worktree_archive;
    ALTER TABLE worktree_archive_v9 RENAME TO worktree_archive;
    CREATE INDEX worktree_archive_repo_created
      ON worktree_archive(repo_id, created_at DESC);
  `)
}

export function migrateProjectHostV11(database: Database): void {
  database.exec('PRAGMA foreign_keys = OFF')
  try {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE project_v11 (
          id TEXT PRIMARY KEY,
          path TEXT NOT NULL,
          host_id TEXT NOT NULL DEFAULT 'local',
          display_name TEXT NOT NULL,
          badge_color TEXT NOT NULL,
          kind TEXT NOT NULL CHECK(kind IN ('git', 'folder')),
          remote_url TEXT,
          added_at INTEGER NOT NULL
        );
        INSERT INTO project_v11(
          id, path, host_id, display_name, badge_color, kind, remote_url, added_at
        )
        SELECT id, path, 'local', display_name, badge_color, kind, remote_url, added_at
        FROM project;
        DROP TABLE project;
        ALTER TABLE project_v11 RENAME TO project;
        CREATE UNIQUE INDEX project_host_path ON project(host_id, path);
      `)
    })()
    if (database.query<unknown, []>('PRAGMA foreign_key_check').all().length > 0) {
      throw new Error('daemon_database_host_migration_foreign_key_failure')
    }
  } finally {
    database.exec('PRAGMA foreign_keys = ON')
  }
}
