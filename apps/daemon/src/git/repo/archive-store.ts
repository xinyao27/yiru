import type { RuntimeWorktreeArchive } from '@yiru/runtime-protocol/contract'

import type { DaemonDatabase } from '../../store/database'

type WorktreeArchiveRow = RuntimeWorktreeArchive

export class WorktreeArchiveStore {
  private readonly database: DaemonDatabase

  constructor(database: DaemonDatabase) {
    this.database = database
  }

  begin(input: {
    branch: string
    head: string
    originalWorktreeId: string
    path: string
    repoId: string
  }): RuntimeWorktreeArchive {
    const archive: RuntimeWorktreeArchive = {
      ...input,
      createdAt: Date.now(),
      failureDetail: null,
      id: crypto.randomUUID(),
      restoredAt: null,
      stashOid: null,
      status: 'archiving'
    }
    this.database.sqlite
      .query(
        `INSERT INTO worktree_archive(
           id, repo_id, original_worktree_id, path, branch, head, stash_oid,
           status, failure_detail, created_at, restored_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, NULL, ?8, NULL)`
      )
      .run(
        archive.id,
        archive.repoId,
        archive.originalWorktreeId,
        archive.path,
        archive.branch,
        archive.head,
        archive.status,
        archive.createdAt
      )
    return archive
  }

  complete(id: string, stashOid: string | null): RuntimeWorktreeArchive {
    this.database.sqlite
      .query(
        `UPDATE worktree_archive
         SET status = 'archived', stash_oid = ?2
         WHERE id = ?1`
      )
      .run(id, stashOid)
    return this.get(id)
  }

  fail(id: string, failureDetail: string): RuntimeWorktreeArchive {
    this.database.sqlite
      .query(
        `UPDATE worktree_archive
         SET status = 'failed', failure_detail = ?2
         WHERE id = ?1`
      )
      .run(id, failureDetail)
    return this.get(id)
  }

  preserve(id: string, stashOid: string | null): void {
    this.database.sqlite
      .query('UPDATE worktree_archive SET stash_oid = ?2 WHERE id = ?1')
      .run(id, stashOid)
  }

  restored(id: string): RuntimeWorktreeArchive {
    const restoredAt = Date.now()
    this.database.sqlite
      .query(
        `UPDATE worktree_archive
         SET status = 'restored', restored_at = ?2
         WHERE id = ?1`
      )
      .run(id, restoredAt)
    return this.get(id)
  }

  get(id: string): RuntimeWorktreeArchive {
    const row = this.database.sqlite
      .query<WorktreeArchiveRow, [string]>(`${SELECT_ARCHIVES} WHERE id = ?1`)
      .get(id)
    if (!row) {
      throw new Error('worktree_archive_not_found')
    }
    return row
  }

  list(repoId?: string): RuntimeWorktreeArchive[] {
    return repoId
      ? this.database.sqlite
          .query<WorktreeArchiveRow, [string]>(
            `${SELECT_ARCHIVES} WHERE repo_id = ?1 ORDER BY created_at DESC`
          )
          .all(repoId)
      : this.database.sqlite
          .query<WorktreeArchiveRow, []>(`${SELECT_ARCHIVES} ORDER BY created_at DESC`)
          .all()
  }
}

const SELECT_ARCHIVES = `SELECT id, repo_id AS repoId,
  original_worktree_id AS originalWorktreeId, path, branch, head, stash_oid AS stashOid,
  status, failure_detail AS failureDetail, created_at AS createdAt,
  restored_at AS restoredAt FROM worktree_archive`
