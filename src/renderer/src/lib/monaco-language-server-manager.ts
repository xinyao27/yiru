import * as monaco from 'monaco-editor'
import type { Disposable } from 'vscode-jsonrpc/browser'
import {
  normalizeLanguageServerSettings,
  type LanguageServerSettings
} from '../../../shared/language-server'
import {
  MonacoLanguageServerSession,
  type LanguageServerSessionStatusUpdate
} from './monaco-language-server-session'
import {
  normalizeDefinitions,
  toLspPosition,
  toMonacoHover,
  toMonacoRange
} from './monaco-language-server-conversions'

const SESSION_IDLE_MS = 5_000

type SessionRecord = {
  session: MonacoLanguageServerSession
  startPromise: Promise<void>
  idleTimer: ReturnType<typeof setTimeout> | null
}

type DocumentRoute = {
  session: MonacoLanguageServerSession
  refs: number
}

export type LanguageServerManagerStatus = {
  key: string
  worktreeId: string
  state: 'starting' | 'ready' | 'failed' | 'stopped'
  message?: string
  serverName?: string
  updatedAt: number
}

export type LanguageServerManagerSnapshot = {
  sessions: LanguageServerManagerStatus[]
}

export type LanguageServerDocumentAttachment = {
  model: monaco.editor.ITextModel
  filePath: string
  worktreeId: string
  runtimeEnvironmentId?: string | null
  connectionId: string | null | undefined
  readOnly: boolean
  settings: LanguageServerSettings | undefined
}

export type LanguageServerNavigationTarget = {
  filePath: string
  relativePath: string
  line: number
  column: number
}

class MonacoLanguageServerManager {
  private readonly sessions = new Map<string, SessionRecord>()
  private readonly documents = new Map<monaco.editor.ITextModel, DocumentRoute>()
  private readonly providers = new Map<string, Disposable[]>()
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
      options.connectionId !== null ||
      options.runtimeEnvironmentId?.trim() ||
      !settings.languageIds.includes(options.model.getLanguageId())
    ) {
      return null
    }
    this.ensureProviders(options.model.getLanguageId())
    const key = sessionKey(options.worktreeId, settings)
    const record = this.ensureSession(key, options.worktreeId, options.model.getLanguageId())
    await record.startPromise
    let sessionAttachment: Disposable
    try {
      sessionAttachment = await record.session.attachDocument(options.model, options.filePath)
    } catch (error) {
      this.scheduleIdleDisposal(record)
      throw error
    }
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
  }

  supportsDefinition(model: monaco.editor.ITextModel): boolean {
    return this.documents.get(model)?.session.supportsDefinition() === true
  }

  async findDefinition(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    token: monaco.CancellationToken
  ): Promise<LanguageServerNavigationTarget | null> {
    const route = this.documents.get(model)
    const uri = route?.session.getDocumentUri(model)
    if (!route || !uri || !route.session.supportsDefinition()) {
      return null
    }
    const definitions = normalizeDefinitions(
      await route.session.definition(uri, toLspPosition(position), token)
    )
    const first = definitions[0]
    if (!first) {
      return null
    }
    const location = await route.session.resolveLocation(first.uri)
    return {
      ...location,
      line: first.range.start.line + 1,
      column: first.range.start.character + 1
    }
  }

  async getLogs(key: string): Promise<string[]> {
    return this.sessions.get(key)?.session.getLogs() ?? []
  }

  private ensureSession(key: string, worktreeId: string, languageId: string): SessionRecord {
    const existing = this.sessions.get(key)
    if (existing) {
      if (existing.idleTimer) {
        clearTimeout(existing.idleTimer)
        existing.idleTimer = null
      }
      return existing
    }
    this.updateStatus(key, worktreeId, { state: 'starting' })
    const session = new MonacoLanguageServerSession(key, worktreeId, languageId, (update) =>
      this.updateStatus(key, worktreeId, update)
    )
    const record: SessionRecord = {
      session,
      startPromise: Promise.resolve(),
      idleTimer: null
    }
    this.sessions.set(key, record)
    record.startPromise = session.start().catch((error) => {
      if (this.sessions.get(key) === record) {
        this.sessions.delete(key)
      }
      throw error
    })
    return record
  }

  private ensureProviders(languageId: string): void {
    if (this.providers.has(languageId)) {
      return
    }
    this.providers.set(languageId, [
      monaco.languages.registerHoverProvider(languageId, {
        provideHover: async (model, position, token) => {
          const route = this.documents.get(model)
          const uri = route?.session.getDocumentUri(model)
          if (!route || !uri || !route.session.supportsHover()) {
            return null
          }
          try {
            return toMonacoHover(await route.session.hover(uri, toLspPosition(position), token))
          } catch {
            return null
          }
        }
      }),
      monaco.languages.registerDefinitionProvider(languageId, {
        provideDefinition: async (model, position, token) => {
          const route = this.documents.get(model)
          const uri = route?.session.getDocumentUri(model)
          if (!route || !uri || !route.session.supportsDefinition()) {
            return null
          }
          try {
            const definitions = normalizeDefinitions(
              await route.session.definition(uri, toLspPosition(position), token)
            )
            const locations = await Promise.all(
              definitions.map(async (definition) => ({
                location: await route.session.resolveLocation(definition.uri),
                range: definition.range
              }))
            )
            return locations.map(({ location, range }) => ({
              uri: monaco.Uri.file(location.filePath),
              range: toMonacoRange(range)
            }))
          } catch {
            return null
          }
        }
      })
    ])
  }

  private releaseRoute(model: monaco.editor.ITextModel, record: SessionRecord): void {
    const route = this.documents.get(model)
    if (route?.session === record.session) {
      route.refs--
      if (route.refs <= 0) {
        this.documents.delete(model)
      }
    }
    this.scheduleIdleDisposal(record)
  }

  private scheduleIdleDisposal(record: SessionRecord): void {
    if (record.session.hasDocuments() || record.idleTimer) {
      return
    }
    record.idleTimer = setTimeout(() => {
      record.idleTimer = null
      if (record.session.hasDocuments() || this.sessions.get(record.session.key) !== record) {
        return
      }
      this.sessions.delete(record.session.key)
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
      this.statuses.set(key, { key, worktreeId, ...update, updatedAt: Date.now() })
    }
    this.snapshot = {
      sessions: [...this.statuses.values()].sort((left, right) => right.updatedAt - left.updatedAt)
    }
    for (const listener of this.listeners) {
      listener()
    }
  }
}

function sessionKey(worktreeId: string, settings: LanguageServerSettings): string {
  return `${worktreeId}\0${JSON.stringify(settings)}`
}

export const monacoLanguageServerManager = new MonacoLanguageServerManager()
