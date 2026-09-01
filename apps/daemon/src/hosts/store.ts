import type { RuntimeHost } from '@yiru/runtime-protocol/contract'

import type { DaemonDatabase } from '../store/database'

type HostRow = {
  id: RuntimeHost['id']
  kind: 'ssh' | 'wsl'
  label: string
  platform: RuntimeHost['platform']
  target: string
}

export class HostStore {
  private readonly database: DaemonDatabase

  constructor(database: DaemonDatabase) {
    this.database = database
  }

  list(): RuntimeHost[] {
    return this.database.sqlite
      .query<HostRow, []>(
        `SELECT id, kind, label, target, platform
         FROM execution_host
         ORDER BY created_at ASC`
      )
      .all()
  }

  put(host: RuntimeHost): RuntimeHost {
    if (host.kind === 'local' || host.target === null) {
      throw new Error('host_store_requires_remote')
    }
    this.database.sqlite
      .query(
        `INSERT INTO execution_host(id, kind, label, target, platform, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET label = excluded.label`
      )
      .run(host.id, host.kind, host.label, host.target, host.platform, Date.now())
    return this.get(host.id)
  }

  get(id: string): RuntimeHost {
    const host = this.list().find((candidate) => candidate.id === id)
    if (!host) {
      throw new Error('host_not_found')
    }
    return host
  }

  remove(id: string): void {
    const result = this.database.sqlite.query('DELETE FROM execution_host WHERE id = ?1').run(id)
    if (result.changes !== 1) {
      throw new Error('host_not_found')
    }
  }
}
