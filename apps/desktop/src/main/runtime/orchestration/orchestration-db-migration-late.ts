import { LEGACY_RUN_ID } from './orchestration-db-foundation'
import { OrchestrationDbMigrationEarly } from './orchestration-db-migration-early'

export abstract class OrchestrationDbMigrationLate extends OrchestrationDbMigrationEarly {
  protected migrateFromVersion9(current: number): void {
    if (current < 9 && !this.messagesTypeCheckAllowsQuestion()) {
      this.db.exec(`
        CREATE TABLE messages_new (
          id              TEXT NOT NULL,
          run_id          TEXT NOT NULL DEFAULT '${LEGACY_RUN_ID}',
          from_handle     TEXT NOT NULL,
          to_handle       TEXT NOT NULL,
          subject         TEXT NOT NULL,
          body            TEXT NOT NULL DEFAULT '',
          type            TEXT NOT NULL DEFAULT 'status'
            CHECK(type IN (
              'status', 'dispatch', 'worker_done', 'merge_ready',
              'escalation', 'handoff', 'decision_gate', 'question', 'heartbeat'
            )),
          priority        TEXT NOT NULL DEFAULT 'normal'
            CHECK(priority IN ('normal', 'high', 'urgent')),
          thread_id       TEXT,
          payload         TEXT,
          read            INTEGER NOT NULL DEFAULT 0,
          sequence        INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at      TEXT NOT NULL DEFAULT (datetime('now')),
          delivered_at    TEXT,
          sender_pane_key TEXT
        );
        INSERT INTO messages_new (
          id, run_id, from_handle, to_handle, subject, body, type, priority,
          thread_id, payload, read, sequence, created_at, delivered_at, sender_pane_key
        )
        SELECT
          id, run_id, from_handle, to_handle, subject, body, type, priority,
          thread_id, payload, read, sequence, created_at, delivered_at, sender_pane_key
        FROM messages;
        DROP TABLE messages;
        ALTER TABLE messages_new RENAME TO messages;

        CREATE UNIQUE INDEX idx_messages_id ON messages(id);
        CREATE INDEX idx_inbox ON messages(to_handle, read);
        CREATE INDEX idx_thread ON messages(thread_id);
        CREATE INDEX idx_messages_run_sequence ON messages(run_id, sequence);
        CREATE INDEX idx_messages_undelivered_inbox
          ON messages(to_handle, read, delivered_at, sequence);
      `)
    }
    if (current < 10) {
      if (!this.hasColumn('dispatch_contexts', 'capability_hash')) {
        this.db.exec('ALTER TABLE dispatch_contexts ADD COLUMN capability_hash TEXT')
      }
      if (!this.hasColumn('dispatch_contexts', 'process_incarnation')) {
        this.db.exec('ALTER TABLE dispatch_contexts ADD COLUMN process_incarnation TEXT')
      }
      if (!this.hasColumn('dispatch_contexts', 'capability_revoked_at')) {
        this.db.exec('ALTER TABLE dispatch_contexts ADD COLUMN capability_revoked_at TEXT')
      }
    }
    if (current < 11) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS mutation_receipts (
          caller_fingerprint  TEXT NOT NULL,
          request_id          TEXT NOT NULL,
          method              TEXT NOT NULL,
          payload_hash        TEXT NOT NULL,
          state               TEXT NOT NULL DEFAULT 'pending'
            CHECK(state IN ('pending', 'completed')),
          receipt             TEXT,
          created_at          TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (caller_fingerprint, request_id)
        );
      `)
    }
    if (current < 12) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS worker_dispatches (
          dispatch_id            TEXT PRIMARY KEY,
          runtime_epoch          TEXT,
          state                  TEXT NOT NULL DEFAULT 'starting'
            CHECK(state IN (
              'starting', 'ready', 'start_unknown', 'failed', 'succeeded',
              'stopping', 'stop_unknown', 'stopped', 'abandoned'
            )),
          stage                  TEXT NOT NULL DEFAULT 'accepted',
          worktree_id            TEXT,
          agent_terminal_handle  TEXT,
          setup_state            TEXT NOT NULL DEFAULT 'not_applicable',
          effects                TEXT NOT NULL DEFAULT '[]',
          residual_resources     TEXT NOT NULL DEFAULT '[]',
          start_options          TEXT NOT NULL DEFAULT '{}',
          last_error             TEXT,
          created_at             TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `)
    }
    if (current < 13 && !this.hasColumn('worker_dispatches', 'runtime_epoch')) {
      this.db.exec('ALTER TABLE worker_dispatches ADD COLUMN runtime_epoch TEXT')
    }
    if (current < 14) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS federated_dispatches (
          dispatch_id             TEXT PRIMARY KEY,
          environment_id          TEXT NOT NULL,
          environment_name        TEXT NOT NULL,
          peer_fingerprint        TEXT NOT NULL,
          remote_runtime_epoch    TEXT,
          protocol_version        INTEGER NOT NULL DEFAULT 1,
          remote_worktree_id      TEXT,
          remote_terminal_handle  TEXT,
          to_home_imported_sequence INTEGER NOT NULL DEFAULT 0,
          created_at              TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS remote_dispatch_attachments (
          dispatch_id             TEXT PRIMARY KEY,
          task_id                 TEXT NOT NULL,
          home_peer_fingerprint   TEXT NOT NULL,
          protocol_version        INTEGER NOT NULL DEFAULT 1,
          runtime_epoch           TEXT NOT NULL,
          capability_hash         TEXT,
          pane_key                TEXT,
          process_incarnation     TEXT,
          state                   TEXT NOT NULL DEFAULT 'starting'
            CHECK(state IN (
              'starting', 'ready', 'start_unknown', 'failed', 'succeeded',
              'stopping', 'stop_unknown', 'stopped', 'abandoned'
            )),
          stage                   TEXT NOT NULL DEFAULT 'accepted',
          worktree_id             TEXT,
          terminal_handle         TEXT,
          setup_state             TEXT NOT NULL DEFAULT 'not_applicable',
          effects                 TEXT NOT NULL DEFAULT '[]',
          residual_resources      TEXT NOT NULL DEFAULT '[]',
          to_worker_imported_sequence INTEGER NOT NULL DEFAULT 0,
          last_error              TEXT,
          created_at              TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `)
    }
    if (current < 15) {
      if (!this.hasColumn('federated_dispatches', 'to_home_imported_sequence')) {
        this.db.exec(
          'ALTER TABLE federated_dispatches ADD COLUMN to_home_imported_sequence INTEGER NOT NULL DEFAULT 0'
        )
      }
      if (!this.hasColumn('remote_dispatch_attachments', 'to_worker_imported_sequence')) {
        this.db.exec(
          'ALTER TABLE remote_dispatch_attachments ADD COLUMN to_worker_imported_sequence INTEGER NOT NULL DEFAULT 0'
        )
      }
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS federation_relay_items (
          dispatch_id   TEXT NOT NULL,
          direction     TEXT NOT NULL CHECK(direction IN ('to_home', 'to_worker')),
          sequence      INTEGER NOT NULL,
          message_id    TEXT NOT NULL,
          kind          TEXT NOT NULL,
          payload       TEXT NOT NULL,
          byte_count    INTEGER NOT NULL,
          acked_at      TEXT,
          created_at    TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (dispatch_id, direction, sequence),
          UNIQUE (dispatch_id, direction, message_id)
        );
        CREATE INDEX IF NOT EXISTS idx_federation_relay_pending
          ON federation_relay_items(dispatch_id, direction, acked_at, sequence);
      `)
    }
    if (current < 16) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS remote_questions (
          message_id        TEXT PRIMARY KEY,
          dispatch_id       TEXT NOT NULL,
          status            TEXT NOT NULL DEFAULT 'pending'
            CHECK(status IN ('pending', 'answered', 'closed')),
          answer_message_id TEXT,
          answer_body       TEXT,
          created_at        TEXT NOT NULL DEFAULT (datetime('now')),
          answered_at       TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_remote_questions_dispatch_status
          ON remote_questions(dispatch_id, status);
      `)
    }
    if (current < 17 && !this.hasColumn('remote_dispatch_attachments', 'protocol_version')) {
      this.db.exec(
        'ALTER TABLE remote_dispatch_attachments ADD COLUMN protocol_version INTEGER NOT NULL DEFAULT 1'
      )
    }
    this.createUndeliveredInboxIndexIfPossible()
  }
}
