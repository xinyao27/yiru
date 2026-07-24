import { getRuntimePathBasename } from '@yiru/workbench-model/platform'

import {
  normalizeLanguageServerSettings,
  type LanguageServerDocumentUriArgs,
  type LanguageServerDocumentUriResult,
  type LanguageServerEvent,
  type LanguageServerLocationArgs,
  type LanguageServerLocationResult,
  type LanguageServerLogsResult,
  type LanguageServerSendArgs,
  type LanguageServerSettings,
  type LanguageServerStartArgs,
  type LanguageServerStartResult
} from '../shared/language-server'
import { encodeLanguageServerMessage } from './language-server-message-framing'
import { spawnLanguageServerProcess, writeLanguageServerFrame } from './language-server-process'
import {
  appendHostLanguageServerLogs,
  createHostLanguageServerSession,
  getHostLanguageServerLogs,
  type HostLanguageServerSession
} from './language-server-session-state'
import {
  resolveLanguageServerDocumentUri,
  resolveLanguageServerLocation,
  resolveLanguageServerWorkspace,
  type LanguageServerStore
} from './language-server-workspace'

const STOP_GRACE_MS = 1_500
const FORCE_KILL_GRACE_MS = 1_000
const MAX_SESSIONS = 32
const MAX_SESSIONS_PER_OWNER = 16

export class LanguageServerManager {
  private readonly sessions = new Map<string, HostLanguageServerSession>()
  private readonly ownerListeners = new Map<string, Set<(event: LanguageServerEvent) => void>>()
  private readonly pendingOwnerEvents = new Map<string, LanguageServerEvent[]>()

  constructor(private readonly store: LanguageServerStore) {}

  subscribeOwner(ownerId: string, listener: (event: LanguageServerEvent) => void): () => void {
    const listeners = this.ownerListeners.get(ownerId) ?? new Set()
    listeners.add(listener)
    this.ownerListeners.set(ownerId, listeners)
    for (const event of this.pendingOwnerEvents.get(ownerId) ?? []) {
      listener(event)
    }
    this.pendingOwnerEvents.delete(ownerId)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) {
        this.ownerListeners.delete(ownerId)
      }
    }
  }

  async start(
    ownerId: string,
    args: LanguageServerStartArgs,
    settingsOverride?: LanguageServerSettings
  ): Promise<LanguageServerStartResult> {
    const languageId = validateLanguageId(args?.languageId)
    const settings = normalizeLanguageServerSettings(
      settingsOverride ?? this.store.getSettings().languageServer
    )
    assertConfigured(settings, languageId)
    const workspace = await resolveLanguageServerWorkspace(this.store, args?.worktreeId)
    this.assertSessionCapacity(ownerId)
    const process = await spawnLanguageServerProcess(settings.command, settings.args, workspace)
    const session = createHostLanguageServerSession(ownerId, process, workspace)
    this.sessions.set(session.id, session)
    this.connectProcess(session)
    try {
      await process.started
      if (session.didExit) {
        throw new Error('Language server exited during startup.')
      }
    } catch (error) {
      this.sessions.delete(session.id)
      process.terminate(true)
      throw new Error(
        `Unable to start ${getRuntimePathBasename(settings.command)} on ${workspace.host.label}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
    this.emit(session, { type: 'status', sessionId: session.id, status: 'running' })
    return {
      sessionId: session.id,
      workspacePath: workspace.path,
      workspaceUri: workspace.uri,
      commandLabel: getRuntimePathBasename(settings.command),
      hostId: workspace.host.id,
      hostLabel: workspace.host.label
    }
  }

  async send(ownerId: string, args: LanguageServerSendArgs): Promise<void> {
    const session = this.getOwnedSession(ownerId, args?.sessionId)
    const frame = encodeLanguageServerMessage(args?.message)
    session.writeQueue = session.writeQueue
      .catch(() => {})
      .then(() => writeLanguageServerFrame(session.process, frame))
    await session.writeQueue
  }

  async stop(ownerId: string, sessionId: string): Promise<void> {
    const session = this.getOwnedSession(ownerId, sessionId)
    try {
      await this.stopSession(session)
    } finally {
      this.sessions.delete(session.id)
    }
  }

  releaseOwner(ownerId: string): void {
    this.ownerListeners.delete(ownerId)
    this.pendingOwnerEvents.delete(ownerId)
    for (const session of this.sessions.values()) {
      if (session.ownerId !== ownerId) {
        continue
      }
      this.sessions.delete(session.id)
      session.stopping = true
      session.process.endInput()
      if (!session.didExit) {
        session.process.terminate(true)
      }
    }
  }

  async resolveDocumentUri(
    ownerId: string,
    args: LanguageServerDocumentUriArgs
  ): Promise<LanguageServerDocumentUriResult> {
    return resolveLanguageServerDocumentUri(
      this.getOwnedSession(ownerId, args?.sessionId).workspace,
      args?.filePath
    )
  }

  async resolveLocation(
    ownerId: string,
    args: LanguageServerLocationArgs
  ): Promise<LanguageServerLocationResult> {
    return resolveLanguageServerLocation(
      this.getOwnedSession(ownerId, args?.sessionId).workspace,
      args?.uri
    )
  }

  getLogs(ownerId: string, sessionId: string): LanguageServerLogsResult {
    return { lines: getHostLanguageServerLogs(this.getOwnedSession(ownerId, sessionId)) }
  }

  private connectProcess(session: HostLanguageServerSession): void {
    session.process.stdout.on('data', (chunk: Buffer) => {
      try {
        for (const message of session.framer.push(chunk)) {
          this.emit(session, { type: 'message', sessionId: session.id, message })
        }
      } catch (error) {
        this.failSession(session, error)
      }
    })
    session.process.stderr.on('data', (chunk: Buffer) =>
      appendHostLanguageServerLogs(session, chunk)
    )
    session.process.onError((error) => {
      if (this.sessions.has(session.id)) {
        this.failSession(session, error)
      }
    })
    session.process.onExit((code, signal) => this.handleExit(session, code, signal))
  }

  private handleExit(
    session: HostLanguageServerSession,
    code: number | null,
    signal: string | null
  ): void {
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
  }

  private failSession(session: HostLanguageServerSession, error: unknown): void {
    if (session.stopping) {
      return
    }
    session.stopping = true
    session.failureMessage = error instanceof Error ? error.message : String(error)
    session.process.terminate(true)
  }

  private async stopSession(session: HostLanguageServerSession): Promise<void> {
    if (session.stopping) {
      await session.exited
      return
    }
    session.stopping = true
    session.process.endInput()
    if (await waitForExit(session.exited, STOP_GRACE_MS)) {
      return
    }
    session.process.terminate()
    if (await waitForExit(session.exited, FORCE_KILL_GRACE_MS)) {
      return
    }
    session.process.terminate(true)
    await session.exited
  }

  private getOwnedSession(ownerId: string, sessionId: string): HostLanguageServerSession {
    const session = this.sessions.get(sessionId)
    if (!session || session.ownerId !== ownerId) {
      throw new Error('Language server session is unavailable.')
    }
    return session
  }

  private assertSessionCapacity(ownerId: string): void {
    const ownerCount = [...this.sessions.values()].filter(
      (session) => session.ownerId === ownerId
    ).length
    if (this.sessions.size >= MAX_SESSIONS || ownerCount >= MAX_SESSIONS_PER_OWNER) {
      throw new Error('Too many language server sessions are running.')
    }
  }

  private emit(session: HostLanguageServerSession, event: LanguageServerEvent): void {
    const listeners = this.ownerListeners.get(session.ownerId)
    if (!listeners?.size) {
      const pending = this.pendingOwnerEvents.get(session.ownerId) ?? []
      pending.push(event)
      this.pendingOwnerEvents.set(session.ownerId, pending.slice(-100))
      return
    }
    for (const listener of listeners) {
      listener(event)
    }
  }
}

function assertConfigured(settings: LanguageServerSettings, languageId: string): void {
  if (!settings.enabled) {
    throw new Error('Language server support is disabled in Settings.')
  }
  if (!settings.command || settings.languageIds.length === 0) {
    throw new Error('Language server command and language IDs must be configured in Settings.')
  }
  if (!settings.languageIds.includes(languageId)) {
    throw new Error(`Language server is not configured for ${languageId}.`)
  }
}

function validateLanguageId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.+-]{1,64}$/.test(value)) {
    throw new Error('Language server requires a valid language ID.')
  }
  return value
}

function waitForExit(exited: Promise<void>, timeoutMs: number): Promise<boolean> {
  return Promise.race([
    exited.then(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), timeoutMs))
  ])
}
