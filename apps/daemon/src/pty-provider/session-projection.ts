import { basename } from 'node:path'

import type { ExecutionHostId } from '@yiru/runtime-protocol/model/workspace'

import type { PtyProcessInfo } from './contract'

export type BunPtyManagedSession = {
  cols: number
  createdAt: number
  cwd: string
  hostId: ExecutionHostId
  isAlive: true
  pid: number
  rows: number
  sessionId: string
  shellState: 'ready'
  state: 'running'
  worktreeId?: string
}

type ProjectableSession = {
  cols: number
  createdAt: number
  cwd: string
  hostId: ExecutionHostId
  id: string
  process: { pid: number }
  rows: number
  shell: string
  terminalHandle?: string
  worktreeId?: string
}

export function projectProcesses(sessions: ProjectableSession[]): PtyProcessInfo[] {
  return sessions.map((session) => ({
    cwd: session.cwd,
    id: session.id,
    title: basename(session.shell),
    ...(session.worktreeId ? { worktreeId: session.worktreeId } : {}),
    ...(session.terminalHandle ? { terminalHandle: session.terminalHandle } : {})
  }))
}

export function projectManagedSessions(sessions: ProjectableSession[]): BunPtyManagedSession[] {
  return sessions.map((session) => ({
    cols: session.cols,
    createdAt: session.createdAt,
    cwd: session.cwd,
    hostId: session.hostId,
    isAlive: true,
    pid: session.process.pid,
    rows: session.rows,
    sessionId: session.id,
    shellState: 'ready',
    state: 'running',
    ...(session.worktreeId ? { worktreeId: session.worktreeId } : {})
  }))
}
