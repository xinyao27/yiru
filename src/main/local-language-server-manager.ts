import { randomUUID } from 'node:crypto'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import path from 'node:path'
import type { WebContents } from 'electron'
import type { Store } from './persistence'
import {
  killLanguageServerProcess,
  spawnLocalLanguageServer,
  waitForLanguageServerSpawn,
  writeLanguageServerFrame
} from './local-language-server-process'
import {
  encodeLanguageServerMessage,
  LanguageServerMessageFramer
} from './language-server-message-framing'
import {
  resolveLanguageServerDocumentUri,
  resolveLanguageServerLocation,
  resolveLocalLanguageServerWorkspace,
  type LocalLanguageServerWorkspace
} from './local-language-server-workspace'
import {
  normalizeLanguageServerSettings,
  type LanguageServerDocumentUriArgs,
  type LanguageServerDocumentUriResult,
  type LanguageServerEvent,
  type LanguageServerLocationArgs,
  type LanguageServerLocationResult,
  type LanguageServerLogsResult,
  type LanguageServerSendArgs,
  type LanguageServerStartArgs,
  type LanguageServerStartResult
} from '../shared/language-server'

const STOP_GRACE_MS = 1_500
const FORCE_KILL_GRACE_MS = 1_000
const MAX_LOG_LINES = 100
const MAX_LOG_LINE_LENGTH = 2_000
const MAX_SESSIONS = 32
const MAX_SESSIONS_PER_OWNER = 16

type LanguageServerSession = {
  id: string
  owner: WebContents
  child: ChildProcessWithoutNullStreams
  workspace: LocalLanguageServerWorkspace
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

export class LocalLanguageServerManager {
  private readonly sessions = new Map<string, LanguageServerSession>()
  private readonly cleanupRegistered = new Set<number>()

  constructor(private readonly store: Store) {}

  async start(
    owner: WebContents,
    args: LanguageServerStartArgs
  ): Promise<LanguageServerStartResult> {
    const languageId = validateLanguageId(args?.languageId)
    const settings = normalizeLanguageServerSettings(this.store.getSettings().languageServer)
    if (!settings.enabled) {
      throw new Error('Language server support is disabled in Settings.')
    }
    if (!settings.command || settings.languageIds.length === 0) {
      throw new Error('Language server command and language IDs must be configured in Settings.')
    }
    const command = validateLanguageServerCommand(settings.command)
    if (!settings.languageIds.includes(languageId)) {
      throw new Error(`Language server is not configured for ${languageId}.`)
    }
    const workspace = await resolveLocalLanguageServerWorkspace(this.store, args?.worktreeId)
    // Why: check after the async authorization step so concurrent starts reserve
    // their slots synchronously with process creation instead of racing the cap.
    const ownerSessionCount = [...this.sessions.values()].filter(
      (session) => session.owner.id === owner.id
    ).length
    if (this.sessions.size >= MAX_SESSIONS || ownerSessionCount >= MAX_SESSIONS_PER_OWNER) {
      throw new Error('Too many language server sessions are running.')
    }
    const child = spawnLocalLanguageServer(command, settings.args, workspace.path)
    const session = this.createSession(owner, child, workspace)
    this.sessions.set(session.id, session)
    this.registerOwnerCleanup(owner)
    this.connectProcess(session)

    try {
      await waitForLanguageServerSpawn(child)
    } catch (error) {
      this.sessions.delete(session.id)
      throw new Error(
        `Unable to start ${path.basename(command)}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
    this.emit(session, { type: 'status', sessionId: session.id, status: 'running' })
    return {
      sessionId: session.id,
      workspacePath: workspace.path,
      workspaceUri: workspace.uri,
      commandLabel: path.basename(command)
    }
  }

  async send(ownerId: number, args: LanguageServerSendArgs): Promise<void> {
    const session = this.getOwnedSession(ownerId, args?.sessionId)
    const frame = encodeLanguageServerMessage(args?.message)
    session.writeQueue = session.writeQueue
      .catch(() => {})
      .then(() => writeLanguageServerFrame(session.child, frame))
    await session.writeQueue
  }

  async stop(ownerId: number, sessionId: string): Promise<void> {
    const session = this.getOwnedSession(ownerId, sessionId)
    try {
      await this.stopSession(session)
    } finally {
      this.sessions.delete(session.id)
    }
  }

  async resolveDocumentUri(
    ownerId: number,
    args: LanguageServerDocumentUriArgs
  ): Promise<LanguageServerDocumentUriResult> {
    return resolveLanguageServerDocumentUri(
      this.getOwnedSession(ownerId, args?.sessionId).workspace,
      args?.filePath
    )
  }

  async resolveLocation(
    ownerId: number,
    args: LanguageServerLocationArgs
  ): Promise<LanguageServerLocationResult> {
    return resolveLanguageServerLocation(
      this.getOwnedSession(ownerId, args?.sessionId).workspace,
      args?.uri
    )
  }

  getLogs(ownerId: number, sessionId: string): LanguageServerLogsResult {
    const session = this.getOwnedSession(ownerId, sessionId)
    return {
      lines: [
        ...session.logs,
        ...(session.stderrRemainder ? [session.stderrRemainder.slice(0, MAX_LOG_LINE_LENGTH)] : [])
      ].slice(-MAX_LOG_LINES)
    }
  }

  private createSession(
    owner: WebContents,
    child: ChildProcessWithoutNullStreams,
    workspace: LocalLanguageServerWorkspace
  ): LanguageServerSession {
    let resolveExited = (): void => {}
    const exited = new Promise<void>((resolve) => {
      resolveExited = resolve
    })
    return {
      id: randomUUID(),
      owner,
      child,
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

  private connectProcess(session: LanguageServerSession): void {
    session.child.stdout.on('data', (chunk: Buffer) => {
      try {
        for (const message of session.framer.push(chunk)) {
          this.emit(session, { type: 'message', sessionId: session.id, message })
        }
      } catch (error) {
        this.failSession(session, error)
      }
    })
    session.child.stderr.on('data', (chunk: Buffer) => this.appendLogs(session, chunk))
    session.child.on('error', (error) => {
      if (this.sessions.has(session.id)) {
        this.failSession(session, error)
      }
    })
    session.child.on('exit', (code, signal) => {
      session.didExit = true
      session.resolveExited()
      if (!this.sessions.has(session.id)) {
        return
      }
      const failed = !session.stopping || session.failureMessage !== undefined
      if (!failed) {
        this.sessions.delete(session.id)
      }
      this.emit(session, {
        type: 'status',
        sessionId: session.id,
        status: failed ? 'failed' : 'stopped',
        ...(failed
          ? {
              message:
                session.failureMessage ?? `Language server exited (${signal ?? code ?? 'unknown'}).`
            }
          : {})
      })
    })
  }

  private appendLogs(session: LanguageServerSession, chunk: Buffer): void {
    const text = `${session.stderrRemainder}${chunk.toString('utf8')}`
    const lines = text.split(/\r?\n/)
    session.stderrRemainder = lines.pop() ?? ''
    for (const line of lines) {
      if (line) {
        session.logs.push(line.slice(0, MAX_LOG_LINE_LENGTH))
      }
    }
    session.logs.splice(0, Math.max(0, session.logs.length - MAX_LOG_LINES))
  }

  private failSession(session: LanguageServerSession, error: unknown): void {
    if (session.stopping) {
      return
    }
    session.stopping = true
    session.failureMessage = error instanceof Error ? error.message : String(error)
    killLanguageServerProcess(session.child, true)
  }

  private async stopSession(session: LanguageServerSession): Promise<void> {
    if (session.stopping) {
      await session.exited
      return
    }
    session.stopping = true
    session.child.stdin.end()
    const exited = await Promise.race([
      session.exited.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), STOP_GRACE_MS))
    ])
    if (!exited) {
      killLanguageServerProcess(session.child)
      const terminated = await Promise.race([
        session.exited.then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), FORCE_KILL_GRACE_MS))
      ])
      if (!terminated) {
        killLanguageServerProcess(session.child, true)
        await session.exited
      }
    }
  }

  private getOwnedSession(ownerId: number, sessionId: string): LanguageServerSession {
    const session = this.sessions.get(sessionId)
    if (!session || session.owner.id !== ownerId) {
      throw new Error('Language server session is unavailable.')
    }
    return session
  }

  private registerOwnerCleanup(owner: WebContents): void {
    if (this.cleanupRegistered.has(owner.id)) {
      return
    }
    this.cleanupRegistered.add(owner.id)
    owner.once('destroyed', () => {
      this.cleanupRegistered.delete(owner.id)
      for (const session of this.sessions.values()) {
        if (session.owner.id === owner.id) {
          // Why: a disappearing renderer cannot complete LSP shutdown, so kill
          // its detached server group before Electron can leave it orphaned.
          this.sessions.delete(session.id)
          session.stopping = true
          session.child.stdin.destroy()
          if (!session.didExit) {
            killLanguageServerProcess(session.child, true)
          }
        }
      }
    })
  }

  private emit(session: LanguageServerSession, event: LanguageServerEvent): void {
    if (!session.owner.isDestroyed()) {
      session.owner.send('languageServers:event', event)
    }
  }
}

function validateLanguageServerCommand(command: string): string {
  if (path.isAbsolute(command) || !/[\\/]/.test(command)) {
    return command
  }
  throw new Error('Language server executable must be on PATH or use an absolute path.')
}

function validateLanguageId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.+-]{1,64}$/.test(value)) {
    throw new Error('Language server requires a valid language ID.')
  }
  return value
}
