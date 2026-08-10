import { type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

// The PTY daemon's own session registry, as opposed to the terminal panes a
// workspace owns. A paired client managing a host's runaway or orphaned
// sessions needs this surface, so it is host-scoped rather than worktree-scoped.

export type TerminalManagementSession = {
  sessionId: string
  state: 'created' | 'spawning' | 'running' | 'exiting' | 'exited'
  shellState: 'pending' | 'ready' | 'timed_out' | 'unsupported'
  isAlive: boolean
  pid: number | null
  cwd: string | null
  cols: number
  rows: number
  createdAt: number
  protocolVersion: number
}

export type TerminalManagementListResult = {
  sessions: TerminalManagementSession[]
  /** Why: the daemon is alive but cannot spawn fresh PTYs, so new terminals
   *  run on the local provider without daemon persistence. */
  degraded: boolean
}

export type TerminalManagementKillAllResult = {
  killedCount: number
  remainingCount: number
  killedSessionIds?: string[]
}

export type TerminalManagementKillOneResult = { success: boolean }

export type TerminalManagementRestartResult = { success: boolean }

export const TerminalManagementEmptyInputSchema = z.object({})

export const TerminalManagementKillOneInputSchema = z.object({
  sessionId: z.string().min(1, 'Missing session id')
})

export type TerminalManagementKillOneInput = z.output<typeof TerminalManagementKillOneInputSchema>

export const TERMINAL_MANAGEMENT_LIST_SESSIONS_CONTRACT = {
  name: 'terminal.management.listSessions',
  params: TerminalManagementEmptyInputSchema,
  mobile: false
} as const

export const TERMINAL_MANAGEMENT_KILL_ALL_CONTRACT = {
  name: 'terminal.management.killAll',
  params: TerminalManagementEmptyInputSchema,
  mobile: false
} as const

export const TERMINAL_MANAGEMENT_KILL_ONE_CONTRACT = {
  name: 'terminal.management.killOne',
  params: TerminalManagementKillOneInputSchema,
  mobile: false
} as const

export const TERMINAL_MANAGEMENT_RESTART_CONTRACT = {
  name: 'terminal.management.restart',
  params: TerminalManagementEmptyInputSchema,
  mobile: false
} as const

const HOST_READ_ACCESS = { scope: 'host', tier: 'read' } as const
const HOST_HOST_ACCESS = { scope: 'host', tier: 'host' } as const

export const terminalManagementContract = {
  listSessions: withAccess(HOST_READ_ACCESS)
    .input(TerminalManagementEmptyInputSchema)
    .output(type<TerminalManagementListResult>()),
  // Why: killing or restarting the daemon tears down every session on the
  // host, including panes this client never opened — host tier, not control.
  killAll: withAccess(HOST_HOST_ACCESS)
    .input(TerminalManagementEmptyInputSchema)
    .output(type<TerminalManagementKillAllResult>()),
  killOne: withAccess(HOST_HOST_ACCESS)
    .input(TerminalManagementKillOneInputSchema)
    .output(type<TerminalManagementKillOneResult>()),
  restart: withAccess(HOST_HOST_ACCESS)
    .input(TerminalManagementEmptyInputSchema)
    .output(type<TerminalManagementRestartResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>
