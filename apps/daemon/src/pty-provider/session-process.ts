import type { ExecutionHostId } from '@yiru/runtime-protocol/model/workspace'

import { readProcessCwd, readTerminalProcessFacts } from './process-facts'

type SessionProcess = {
  cwd: string
  hostId: ExecutionHostId
  process: { pid: number }
}

export async function sessionCwd(session: SessionProcess | undefined): Promise<string> {
  if (!session) {
    return ''
  }
  return session.hostId === 'local'
    ? (await readProcessCwd(session.process.pid)) || session.cwd
    : session.cwd
}

export async function sessionHasChildren(session: SessionProcess | undefined): Promise<boolean> {
  if (!session) {
    return false
  }
  return session.hostId === 'local'
    ? (await readTerminalProcessFacts(session.process.pid)).descendants.length > 0
    : true
}

export async function sessionForeground(
  session: SessionProcess | undefined
): Promise<string | null> {
  if (!session) {
    return null
  }
  return session.hostId === 'local'
    ? (await readTerminalProcessFacts(session.process.pid)).foregroundCommand
    : session.hostId
}
