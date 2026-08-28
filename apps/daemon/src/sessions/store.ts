import type { RuntimeAgentSession } from '@yiru/runtime-protocol/contract'
import type { TuiAgent } from '@yiru/runtime-protocol/model/agent'

import type { DaemonDatabase } from '../store/database'

type AgentSessionRow = {
  agent: TuiAgent
  completedAt: number | null
  createdAt: number
  id: string
  phase: RuntimeAgentSession['phase']
  status: RuntimeAgentSession['status']
  terminalHandle: string
  title: string | null
  updatedAt: number
  worktreeId: string
}

export class AgentSessionStore {
  private readonly database: DaemonDatabase

  constructor(database: DaemonDatabase) {
    this.database = database
  }

  create(input: {
    agent: TuiAgent
    terminalHandle: string
    title: string | null
    worktreeId: string
  }): RuntimeAgentSession {
    const now = Date.now()
    const session: RuntimeAgentSession = {
      ...input,
      completedAt: null,
      createdAt: now,
      id: input.terminalHandle,
      phase: 'thinking',
      status: 'running',
      updatedAt: now
    }
    this.database.sqlite
      .query(
        `INSERT INTO agent_session(
           id, terminal_handle, worktree_id, agent, phase, status, title,
           created_at, updated_at, completed_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL)`
      )
      .run(
        session.id,
        session.terminalHandle,
        session.worktreeId,
        session.agent,
        session.phase,
        session.status,
        session.title,
        session.createdAt,
        session.updatedAt
      )
    return session
  }

  list(worktreeId?: string): RuntimeAgentSession[] {
    const rows = worktreeId
      ? this.database.sqlite
          .query<AgentSessionRow, [string]>(`${SELECT_SESSIONS} WHERE worktree_id = ?1 ${ORDER}`)
          .all(worktreeId)
      : this.database.sqlite.query<AgentSessionRow, []>(`${SELECT_SESSIONS} ${ORDER}`).all()
    return rows.map(toSession)
  }

  get(id: string): RuntimeAgentSession {
    const session = this.find(id)
    if (!session) {
      throw new Error('agent_session_not_found')
    }
    return session
  }

  find(id: string): RuntimeAgentSession | null {
    const row = this.database.sqlite
      .query<AgentSessionRow, [string]>(`${SELECT_SESSIONS} WHERE id = ?1`)
      .get(id)
    return row ? toSession(row) : null
  }

  update(id: string, update: Pick<RuntimeAgentSession, 'phase' | 'status'>): RuntimeAgentSession {
    const now = Date.now()
    const completedAt = update.status === 'running' ? null : now
    this.database.sqlite
      .query(
        `UPDATE agent_session
         SET phase = ?2, status = ?3, updated_at = ?4, completed_at = ?5
         WHERE id = ?1`
      )
      .run(id, update.phase, update.status, now, completedAt)
    return this.get(id)
  }
}

const SELECT_SESSIONS = `SELECT id, terminal_handle AS terminalHandle,
  worktree_id AS worktreeId, agent, phase, status, title, created_at AS createdAt,
  updated_at AS updatedAt, completed_at AS completedAt FROM agent_session`
const ORDER = 'ORDER BY updated_at DESC'

function toSession(row: AgentSessionRow): RuntimeAgentSession {
  return { ...row }
}
