import { randomUUID } from 'node:crypto'
import { LanguageServerMessageFramer } from './language-server-message-framing'
import type { LanguageServerProcess } from './language-server-process'
import type { LanguageServerWorkspace } from './language-server-workspace'

const MAX_LOG_LINES = 100
const MAX_LOG_LINE_LENGTH = 2_000

export type HostLanguageServerSession = {
  id: string
  ownerId: string
  process: LanguageServerProcess
  workspace: LanguageServerWorkspace
  framer: LanguageServerMessageFramer
  logs: string[]
  stderrRemainder: string
  stopping: boolean
  didExit: boolean
  failureMessage?: string
  exited: Promise<void>
  resolveExited: () => void
  writeQueue: Promise<void>
}

export function createHostLanguageServerSession(
  ownerId: string,
  process: LanguageServerProcess,
  workspace: LanguageServerWorkspace
): HostLanguageServerSession {
  let resolveExited = (): void => {}
  const exited = new Promise<void>((resolve) => {
    resolveExited = resolve
  })
  return {
    id: randomUUID(),
    ownerId,
    process,
    workspace,
    framer: new LanguageServerMessageFramer(),
    logs: [],
    stderrRemainder: '',
    stopping: false,
    didExit: false,
    exited,
    resolveExited,
    writeQueue: Promise.resolve()
  }
}

export function appendHostLanguageServerLogs(
  session: HostLanguageServerSession,
  chunk: Buffer
): void {
  const lines = `${session.stderrRemainder}${chunk.toString('utf8')}`.split(/\r?\n/)
  session.stderrRemainder = lines.pop() ?? ''
  for (const line of lines.filter(Boolean)) {
    session.logs.push(line.slice(0, MAX_LOG_LINE_LENGTH))
  }
  session.logs.splice(0, Math.max(0, session.logs.length - MAX_LOG_LINES))
}

export function getHostLanguageServerLogs(session: HostLanguageServerSession): string[] {
  return [
    ...session.logs,
    ...(session.stderrRemainder ? [session.stderrRemainder.slice(0, MAX_LOG_LINE_LENGTH)] : [])
  ].slice(-MAX_LOG_LINES)
}
