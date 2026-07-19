import type * as monaco from 'monaco-editor'
import {
  NullLogger,
  createMessageConnection,
  type Disposable,
  type MessageConnection
} from 'vscode-jsonrpc/browser'

import { translate } from '@/i18n/i18n'

import type {
  LanguageServerLocationResult,
  LanguageServerSessionStatus,
  LanguageServerStartResult
} from '../../../shared/language-server'
import {
  getLanguageServerWorkspaceName,
  stageThreeClientCapabilities,
  validateSynchronizationCapability
} from './language-server-client-capabilities'
import { LanguageServerFeatureRequests } from './language-server-feature-requests'
import { LanguageServerIpcReader, LanguageServerIpcWriter } from './language-server-ipc-transport'
import type {
  LspDiagnostic,
  LspInitializeResult,
  LspLogMessageParams,
  LspPublishDiagnosticsParams,
  LspServerCapabilities
} from './language-server-protocol'
import { LanguageServerRequestRouter } from './language-server-request-router'
import { LanguageServerSessionLogs } from './language-server-session-logs'
import type { LanguageServerSessionTransport } from './language-server-session-transport'
import { LanguageServerWorkspaceFiles } from './language-server-workspace-files'
import { MonacoLanguageServerDocuments } from './monaco-language-server-documents'

const INITIALIZE_TIMEOUT_MS = 10_000
const SHUTDOWN_TIMEOUT_MS = 2_000

export type LanguageServerSessionStatusUpdate = {
  state: 'starting' | 'ready' | 'failed' | 'stopped'
  message?: string
  serverName?: string
  hostLabel?: string
}

export class MonacoLanguageServerSession {
  private startResult: LanguageServerStartResult | null = null
  private connection: MessageConnection | null = null
  private capabilities: LspServerCapabilities = {}
  private readonly documents: MonacoLanguageServerDocuments
  private readonly workspaceFiles: LanguageServerWorkspaceFiles
  private readonly logs = new LanguageServerSessionLogs()
  private readonly publishedDiagnostics = new Map<
    string,
    { version: number | undefined; diagnostics: LspDiagnostic[] }
  >()
  private readonly requests = new LanguageServerRequestRouter(() => this.connection)
  readonly features = new LanguageServerFeatureRequests(() => this.capabilities, this.requests)
  private disposed = false

  constructor(
    readonly key: string,
    private readonly worktreeId: string,
    private readonly initialLanguageId: string,
    private readonly transport: LanguageServerSessionTransport,
    private readonly runtimeEnvironmentId: string | null | undefined,
    connectionId: string | null | undefined,
    private readonly onStatus: (update: LanguageServerSessionStatusUpdate) => void,
    private readonly onDiagnostics: (params: LspPublishDiagnosticsParams) => void
  ) {
    this.workspaceFiles = new LanguageServerWorkspaceFiles(
      worktreeId,
      runtimeEnvironmentId,
      connectionId
    )
    this.documents = new MonacoLanguageServerDocuments({
      resolveUri: (filePath) => this.resolveDocumentUri(filePath),
      notify: (method, params) => this.sendNotification(method, params),
      getCapabilities: () => this.capabilities,
      onClose: (uri) => this.publishedDiagnostics.delete(uri)
    })
  }

  start(): Promise<void> {
    return this.initialize(false)
  }

  async restart(): Promise<void> {
    if (this.disposed) {
      throw new Error('Language server session is disposed.')
    }
    await this.logs.archive(this.transport, this.startResult)
    this.connection?.dispose()
    this.connection = null
    await this.stopHostSession()
    this.capabilities = {}
    this.publishedDiagnostics.clear()
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
      this.startResult = await this.transport.start({
        worktreeId: this.worktreeId,
        languageId: this.initialLanguageId
      })
      const reader = new LanguageServerIpcReader(
        this.startResult.sessionId,
        this.transport,
        (status, message) => this.handleProcessStatus(status, message)
      )
      const writer = new LanguageServerIpcWriter(this.startResult.sessionId, this.transport)
      this.connection = createMessageConnection(reader, writer, NullLogger)
      this.registerServerMessages(this.connection)
      this.connection.listen()
      const result = await this.requests.withTimeout<LspInitializeResult>(
        'initialize',
        {
          processId: null,
          clientInfo: { name: 'Yiru', version: 'stage-4' },
          rootUri: this.startResult.workspaceUri,
          workspaceFolders: [
            {
              uri: this.startResult.workspaceUri,
              name: getLanguageServerWorkspaceName(this.startResult.workspacePath)
            }
          ],
          capabilities: stageThreeClientCapabilities()
        },
        INITIALIZE_TIMEOUT_MS
      )
      this.capabilities = result.capabilities ?? {}
      validateSynchronizationCapability(this.capabilities)
      await this.connection.sendNotification('initialized', {})
      if (reopenDocuments) {
        await this.documents.reopen()
      }
      this.onStatus({
        state: 'ready',
        serverName: result.serverInfo?.name,
        hostLabel: this.startResult.hostLabel
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.onStatus({ state: 'failed', message })
      this.connection?.dispose()
      this.connection = null
      await this.stopHostSession()
      throw error
    }
  }

  getWorktreeId(): string {
    return this.worktreeId
  }

  getRuntimeEnvironmentId(): string | null {
    return this.runtimeEnvironmentId?.trim() || null
  }

  attachDocument(model: monaco.editor.ITextModel, filePath: string): Promise<Disposable> {
    return this.documents.attach(model, filePath)
  }

  getDocumentUri(model: monaco.editor.ITextModel): string | null {
    return this.documents.getUri(model)
  }

  getDocumentModel(uri: string, canonicalFilePath?: string): monaco.editor.ITextModel | null {
    return this.documents.getModelByFilePath(uri, canonicalFilePath)
  }

  getPublishedDiagnostics(uri: string, modelVersion: number): LspDiagnostic[] {
    const published = this.publishedDiagnostics.get(uri)
    if (!published || (published.version !== undefined && published.version !== modelVersion)) {
      return []
    }
    return published.diagnostics
  }

  resolveLocation(uri: string): Promise<LanguageServerLocationResult> {
    if (!this.startResult) {
      throw new Error('Language server is not ready.')
    }
    return this.transport.resolveLocation({
      sessionId: this.startResult.sessionId,
      uri
    })
  }

  readWorkspaceTextFile(filePath: string, relativePath: string): Promise<string> {
    return this.workspaceFiles.readText(filePath, relativePath)
  }

  writeWorkspaceTextFile(filePath: string, content: string): Promise<void> {
    return this.workspaceFiles.writeText(filePath, content)
  }

  getLogs(): Promise<string[]> {
    return this.logs.get(this.transport, this.startResult)
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
    this.publishedDiagnostics.clear()
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
    this.transport.dispose()
    this.onStatus({ state: 'stopped' })
  }

  private async resolveDocumentUri(filePath: string): Promise<string> {
    if (!this.startResult) {
      throw new Error('Language server is not ready.')
    }
    const resolved = await this.transport.resolveDocumentUri({
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
      (params: LspPublishDiagnosticsParams) => {
        this.publishedDiagnostics.set(params.uri, {
          version: params.version,
          diagnostics: params.diagnostics
        })
        this.onDiagnostics(params)
      }
    )
    connection.onNotification('window/logMessage', (params: LspLogMessageParams) => {
      if (params?.message) {
        this.logs.recordProtocolMessage(params.message)
      }
    })
  }

  private handleProcessStatus(status: LanguageServerSessionStatus, message?: string): void {
    if (status === 'failed') {
      this.publishedDiagnostics.clear()
      this.onStatus({ state: 'failed', message })
    }
    if (status === 'stopped') {
      this.publishedDiagnostics.clear()
      this.onStatus({ state: 'stopped' })
    }
  }

  private async stopHostSession(): Promise<void> {
    if (!this.startResult) {
      return
    }
    const { sessionId } = this.startResult
    this.startResult = null
    await this.transport.stop(sessionId).catch(() => {})
  }
}
