import type * as monaco from 'monaco-editor'
import { translate } from '@/i18n/i18n'
import {
  NullLogger,
  createMessageConnection,
  type Disposable,
  type MessageConnection
} from 'vscode-jsonrpc/browser'
import type {
  LanguageServerLocationResult,
  LanguageServerSessionStatus,
  LanguageServerStartResult
} from '../../../shared/language-server'
import { LanguageServerIpcReader, LanguageServerIpcWriter } from './language-server-ipc-transport'
import { MonacoLanguageServerDocuments } from './monaco-language-server-documents'
import { LanguageServerRequestRouter } from './language-server-request-router'
import { LanguageServerFeatureRequests } from './language-server-feature-requests'
import {
  getLanguageServerWorkspaceName,
  stageTwoClientCapabilities,
  validateSynchronizationCapability
} from './language-server-client-capabilities'
import type {
  LspInitializeResult,
  LspLogMessageParams,
  LspPublishDiagnosticsParams,
  LspServerCapabilities
} from './language-server-protocol'

const INITIALIZE_TIMEOUT_MS = 10_000
const SHUTDOWN_TIMEOUT_MS = 2_000

export type LanguageServerSessionStatusUpdate = {
  state: 'starting' | 'ready' | 'failed' | 'stopped'
  message?: string
  serverName?: string
}

export class MonacoLanguageServerSession {
  private startResult: LanguageServerStartResult | null = null
  private connection: MessageConnection | null = null
  private capabilities: LspServerCapabilities = {}
  private readonly documents: MonacoLanguageServerDocuments
  private readonly protocolLogs: string[] = []
  private readonly archivedHostLogs: string[] = []
  private readonly requests = new LanguageServerRequestRouter(() => this.connection)
  readonly features = new LanguageServerFeatureRequests(() => this.capabilities, this.requests)
  private disposed = false

  constructor(
    readonly key: string,
    private readonly worktreeId: string,
    private readonly initialLanguageId: string,
    private readonly onStatus: (update: LanguageServerSessionStatusUpdate) => void,
    private readonly onDiagnostics: (params: LspPublishDiagnosticsParams) => void
  ) {
    this.documents = new MonacoLanguageServerDocuments({
      resolveUri: (filePath) => this.resolveDocumentUri(filePath),
      notify: (method, params) => this.sendNotification(method, params),
      getCapabilities: () => this.capabilities
    })
  }

  start(): Promise<void> {
    return this.initialize(false)
  }

  async restart(): Promise<void> {
    if (this.disposed) {
      throw new Error('Language server session is disposed.')
    }
    await this.archiveCurrentHostLogs()
    this.connection?.dispose()
    this.connection = null
    await this.stopHostSession()
    this.capabilities = {}
    await this.initialize(true)
  }

  private async initialize(reopenDocuments: boolean): Promise<void> {
    this.onStatus({
      state: 'starting',
      ...(reopenDocuments
        ? {
            message: translate(
              'auto.lib.MonacoLanguageServerSession.restarting',
              'Restarting language server…'
            )
          }
        : {})
    })
    try {
      this.startResult = await window.api.languageServers.start({
        worktreeId: this.worktreeId,
        languageId: this.initialLanguageId
      })
      const reader = new LanguageServerIpcReader(this.startResult.sessionId, (status, message) =>
        this.handleProcessStatus(status, message)
      )
      const writer = new LanguageServerIpcWriter(this.startResult.sessionId)
      this.connection = createMessageConnection(reader, writer, NullLogger)
      this.registerServerMessages(this.connection)
      this.connection.listen()
      const result = await this.requests.withTimeout<LspInitializeResult>(
        'initialize',
        {
          processId: null,
          clientInfo: { name: 'Yiru', version: 'stage-2' },
          rootUri: this.startResult.workspaceUri,
          workspaceFolders: [
            {
              uri: this.startResult.workspaceUri,
              name: getLanguageServerWorkspaceName(this.startResult.workspacePath)
            }
          ],
          capabilities: stageTwoClientCapabilities()
        },
        INITIALIZE_TIMEOUT_MS
      )
      this.capabilities = result.capabilities ?? {}
      validateSynchronizationCapability(this.capabilities)
      await this.connection.sendNotification('initialized', {})
      if (reopenDocuments) {
        await this.documents.reopen()
      }
      this.onStatus({ state: 'ready', serverName: result.serverInfo?.name })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.onStatus({ state: 'failed', message })
      this.connection?.dispose()
      this.connection = null
      await this.stopHostSession()
      throw error
    }
  }

  attachDocument(model: monaco.editor.ITextModel, filePath: string): Promise<Disposable> {
    return this.documents.attach(model, filePath)
  }

  getDocumentUri(model: monaco.editor.ITextModel): string | null {
    return this.documents.getUri(model)
  }

  getDocumentModel(uri: string): monaco.editor.ITextModel | null {
    return this.documents.getModel(uri)
  }

  resolveLocation(uri: string): Promise<LanguageServerLocationResult> {
    if (!this.startResult) {
      throw new Error('Language server is not ready.')
    }
    return window.api.languageServers.resolveLocation({
      sessionId: this.startResult.sessionId,
      uri
    })
  }

  async getLogs(): Promise<string[]> {
    if (!this.startResult) {
      return [...this.archivedHostLogs, ...this.protocolLogs].slice(-100)
    }
    const hostLogs = await window.api.languageServers
      .getLogs({ sessionId: this.startResult.sessionId })
      .catch(() => ({ lines: [] }))
    return [...this.archivedHostLogs, ...hostLogs.lines, ...this.protocolLogs].slice(-100)
  }

  hasDocuments(): boolean {
    return this.documents.hasDocuments()
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.documents.dispose()
    if (this.connection) {
      try {
        await this.requests.withTimeout('shutdown', null, SHUTDOWN_TIMEOUT_MS)
        await this.connection.sendNotification('exit', null)
      } catch {
        // Host teardown below is authoritative when graceful protocol shutdown fails.
      }
      this.connection.dispose()
      this.connection = null
    }
    await this.stopHostSession()
    this.onStatus({ state: 'stopped' })
  }

  private async resolveDocumentUri(filePath: string): Promise<string> {
    if (!this.startResult) {
      throw new Error('Language server is not ready.')
    }
    const resolved = await window.api.languageServers.resolveDocumentUri({
      sessionId: this.startResult.sessionId,
      filePath
    })
    return resolved.uri
  }

  private sendNotification(method: string, params: unknown): Promise<void> {
    if (!this.connection) {
      return Promise.reject(new Error('Language server is not ready.'))
    }
    return this.connection.sendNotification(method, params)
  }

  private registerServerMessages(connection: MessageConnection): void {
    connection.onRequest('workspace/applyEdit', () => ({
      applied: false,
      failureReason: 'Yiru does not apply language-server workspace edits.'
    }))
    connection.onRequest('window/showMessageRequest', () => null)
    connection.onNotification(
      'textDocument/publishDiagnostics',
      (params: LspPublishDiagnosticsParams) => this.onDiagnostics(params)
    )
    connection.onNotification('window/logMessage', (params: LspLogMessageParams) => {
      if (params?.message) {
        this.protocolLogs.push(params.message.slice(0, 2_000))
      }
      this.protocolLogs.splice(0, Math.max(0, this.protocolLogs.length - 100))
    })
  }

  private handleProcessStatus(status: LanguageServerSessionStatus, message?: string): void {
    if (status === 'failed') {
      this.onStatus({ state: 'failed', message })
    }
    if (status === 'stopped') {
      this.onStatus({ state: 'stopped' })
    }
  }

  private async archiveCurrentHostLogs(): Promise<void> {
    if (!this.startResult) {
      return
    }
    const result = await window.api.languageServers
      .getLogs({ sessionId: this.startResult.sessionId })
      .catch(() => ({ lines: [] }))
    this.archivedHostLogs.push(...result.lines.map((line) => `[previous server] ${line}`))
    this.archivedHostLogs.splice(0, Math.max(0, this.archivedHostLogs.length - 100))
  }

  private async stopHostSession(): Promise<void> {
    if (!this.startResult) {
      return
    }
    const { sessionId } = this.startResult
    this.startResult = null
    await window.api.languageServers.stop({ sessionId }).catch(() => {})
  }
}
