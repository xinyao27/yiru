import type * as monaco from 'monaco-editor'
import type { Disposable } from 'vscode-jsonrpc/browser'

import {
  normalizeLanguageServerSettings,
  type LanguageServerSettings
} from '../../../shared/language-server'
import type { LanguageServerDocumentAttachment } from './language-server-document-attachment'
import type {
  LanguageServerManagerSnapshot,
  LanguageServerManagerStatus
} from './language-server-manager-status'
import { createLanguageServerSessionTransport } from './language-server-session-transport'
import { MonacoLanguageServerDiagnostics } from './monaco-language-server-diagnostics'
import { MonacoLanguageServerFeatures } from './monaco-language-server-features'
import {
  findLanguageServerDefinition,
  type LanguageServerNavigationTarget
} from './monaco-language-server-navigation'
import {
  MonacoLanguageServerSession,
  type LanguageServerSessionStatusUpdate
} from './monaco-language-server-session'

const SESSION_IDLE_MS = 5_000
// Why: restarts have a per-session lifetime budget so a broken user binary
// becomes visibly failed instead of entering a silent process-spawn loop.
const RESTART_DELAYS_MS = [500, 2_000] as const
const RESTART_BUDGET_RESET_MS = 60_000

type SessionRecord = {
  session: MonacoLanguageServerSession
  worktreeId: string
  languageId: string
  startPromise: Promise<void>
  idleTimer: ReturnType<typeof setTimeout> | null
  restartTimer: ReturnType<typeof setTimeout> | null
  restartAttempts: number
  restartInFlight: boolean
  readyAt: number
  pendingAttachments: number
}

type DocumentRoute = {
  session: MonacoLanguageServerSession
  refs: number
}

export type { LanguageServerManagerStatus } from './language-server-manager-status'

export type { LanguageServerNavigationTarget } from './monaco-language-server-navigation'

class MonacoLanguageServerManager {
  private readonly sessions = new Map<string, SessionRecord>()
  private readonly documents = new Map<monaco.editor.ITextModel, DocumentRoute>()
  private readonly diagnostics = new MonacoLanguageServerDiagnostics()
  private readonly features = new MonacoLanguageServerFeatures((model) => this.getModelRoute(model))
  private readonly statuses = new Map<string, LanguageServerManagerStatus>()
  private readonly listeners = new Set<() => void>()
  private snapshot: LanguageServerManagerSnapshot = { sessions: [] }

  readonly getSnapshot = (): LanguageServerManagerSnapshot => this.snapshot

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async attachDocument(options: LanguageServerDocumentAttachment): Promise<Disposable | null> {
    const settings = normalizeLanguageServerSettings(options.settings)
    if (
      !settings.enabled ||
      options.readOnly ||
      !settings.languageIds.includes(options.model.getLanguageId())
    ) {
      return null
    }
    const hostKey = options.runtimeEnvironmentId?.trim() || options.connectionId || 'local'
    const key = `${options.worktreeId}\0${hostKey}\0${JSON.stringify(settings)}`
    const record = this.ensureSession(
      key,
      options.worktreeId,
      options.model.getLanguageId(),
      settings,
      options.runtimeEnvironmentId,
      options.connectionId
    )
    record.pendingAttachments++
    try {
      await record.startPromise
      this.features.ensureLanguage(options.model.getLanguageId(), record.session)
      const sessionAttachment = await record.session.attachDocument(options.model, options.filePath)
      const route = this.documents.get(options.model)
      if (route && route.session === record.session) {
        route.refs++
      } else {
        this.documents.set(options.model, { session: record.session, refs: 1 })
      }
      return {
        dispose: () => {
          sessionAttachment.dispose()
          this.releaseRoute(options.model, record)
        }
      }
    } catch (error) {
      this.scheduleIdleDisposal(record)
      throw error
    } finally {
      record.pendingAttachments--
      this.scheduleIdleDisposal(record)
    }
  }

  supportsDefinition(model: monaco.editor.ITextModel): boolean {
    return this.documents.get(model)?.session.features.supportsDefinition() === true
  }

  async findDefinition(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    token: monaco.CancellationToken
  ): Promise<LanguageServerNavigationTarget | null> {
    return findLanguageServerDefinition(this.getModelRoute(model), position, token)
  }

  async getLogs(key: string): Promise<string[]> {
    return this.sessions.get(key)?.session.getLogs() ?? []
  }

  private ensureSession(
    key: string,
    worktreeId: string,
    languageId: string,
    settings: LanguageServerSettings,
    runtimeEnvironmentId?: string | null,
    connectionId?: string | null
  ): SessionRecord {
    const existing = this.sessions.get(key)
    if (existing) {
      if (existing.idleTimer) {
        clearTimeout(existing.idleTimer)
        existing.idleTimer = null
      }
      if (
        this.statuses.get(key)?.state === 'failed' &&
        !existing.restartTimer &&
        !existing.restartInFlight
      ) {
        // Why: closing/reopening a tab is the explicit retry after the bounded
        // crash budget, including after an SSH or runtime host reconnects.
        existing.restartAttempts = 0
        existing.startPromise = existing.session.restart()
        void existing.startPromise.catch(() => {})
      }
      return existing
    }
    let record: SessionRecord
    let session: MonacoLanguageServerSession
    session = new MonacoLanguageServerSession(
      key,
      worktreeId,
      languageId,
      createLanguageServerSessionTransport({ runtimeEnvironmentId, settings }),
      runtimeEnvironmentId,
      connectionId,
      (update) => this.handleSessionStatus(record, update),
      (params) => {
        if (this.sessions.get(key) === record) {
          this.diagnostics.publish(session, params)
        }
      }
    )
    record = {
      session,
      worktreeId,
      languageId,
      startPromise: Promise.resolve(),
      idleTimer: null,
      restartTimer: null,
      restartAttempts: 0,
      restartInFlight: false,
      readyAt: 0,
      pendingAttachments: 0
    }
    this.sessions.set(key, record)
    record.startPromise = session.start()
    void record.startPromise.catch(() => {})
    return record
  }

  private handleSessionStatus(
    record: SessionRecord,
    update: LanguageServerSessionStatusUpdate
  ): void {
    if (this.sessions.get(record.session.key) !== record) {
      return
    }
    this.updateStatus(record.session.key, record.worktreeId, update)
    if (update.state === 'ready') {
      record.readyAt = Date.now()
      this.features.ensureLanguage(record.languageId, record.session)
      return
    }
    if (update.state === 'failed' || update.state === 'stopped') {
      this.diagnostics.clearSession(record.session)
    }
    if (update.state === 'failed') {
      if (record.readyAt > 0 && Date.now() - record.readyAt >= RESTART_BUDGET_RESET_MS) {
        record.restartAttempts = 0
      }
      this.scheduleRestart(record)
    }
  }

  private scheduleRestart(record: SessionRecord): void {
    const delay = RESTART_DELAYS_MS[record.restartAttempts]
    if (
      delay === undefined ||
      record.restartTimer ||
      record.restartInFlight ||
      this.sessions.get(record.session.key) !== record ||
      (!record.session.hasDocuments() && record.pendingAttachments === 0)
    ) {
      return
    }
    record.restartAttempts++
    let resolveRestart = (): void => {}
    let rejectRestart = (_error: unknown): void => {}
    record.startPromise = new Promise<void>((resolve, reject) => {
      resolveRestart = resolve
      rejectRestart = reject
    })
    void record.startPromise.catch(() => {})
    record.restartTimer = setTimeout(() => {
      record.restartTimer = null
      if (
        this.sessions.get(record.session.key) !== record ||
        (!record.session.hasDocuments() && record.pendingAttachments === 0)
      ) {
        resolveRestart()
        return
      }
      record.restartInFlight = true
      void record.session
        .restart()
        .then(resolveRestart, rejectRestart)
        .finally(() => {
          record.restartInFlight = false
          if (this.statuses.get(record.session.key)?.state === 'failed') {
            this.scheduleRestart(record)
          }
        })
    }, delay)
  }

  private getModelRoute(model: monaco.editor.ITextModel) {
    const route = this.documents.get(model)
    const uri = route?.session.getDocumentUri(model)
    return route && uri ? { session: route.session, uri } : null
  }

  private releaseRoute(model: monaco.editor.ITextModel, record: SessionRecord): void {
    const route = this.documents.get(model)
    if (route?.session === record.session) {
      route.refs--
      if (route.refs <= 0) {
        this.documents.delete(model)
        this.diagnostics.clearModel(record.session, model)
      }
    }
    this.scheduleIdleDisposal(record)
  }

  private scheduleIdleDisposal(record: SessionRecord): void {
    if (record.session.hasDocuments() || record.pendingAttachments > 0 || record.idleTimer) {
      return
    }
    record.idleTimer = setTimeout(() => {
      record.idleTimer = null
      if (
        record.session.hasDocuments() ||
        record.pendingAttachments > 0 ||
        this.sessions.get(record.session.key) !== record
      ) {
        return
      }
      if (record.restartTimer) {
        clearTimeout(record.restartTimer)
      }
      this.sessions.delete(record.session.key)
      this.diagnostics.clearSession(record.session)
      this.updateStatus(record.session.key, record.worktreeId, { state: 'stopped' })
      void record.session.dispose()
    }, SESSION_IDLE_MS)
  }

  private updateStatus(
    key: string,
    worktreeId: string,
    update: LanguageServerSessionStatusUpdate
  ): void {
    if (update.state === 'stopped') {
      this.statuses.delete(key)
    } else {
      this.statuses.set(key, {
        ...this.statuses.get(key),
        key,
        worktreeId,
        ...update,
        updatedAt: Date.now()
      })
    }
    this.snapshot = {
      sessions: [...this.statuses.values()].sort((left, right) => right.updatedAt - left.updatedAt)
    }
    for (const listener of this.listeners) {
      listener()
    }
  }
}

export const monacoLanguageServerManager = new MonacoLanguageServerManager()
