import type * as monaco from 'monaco-editor'
import {
  NullLogger,
  createMessageConnection,
  type Disposable,
  type MessageConnection
} from 'vscode-jsonrpc/browser'
import { getRuntimePathBasename } from '../../../shared/cross-platform-path'
import type {
  LanguageServerLocationResult,
  LanguageServerSessionStatus,
  LanguageServerStartResult
} from '../../../shared/language-server'
import { LanguageServerIpcReader, LanguageServerIpcWriter } from './language-server-ipc-transport'
import { MonacoLanguageServerDocuments } from './monaco-language-server-documents'
import { LanguageServerRequestRouter } from './language-server-request-router'
import type {
  LspDefinition,
  LspHover,
  LspInitializeResult,
  LspLogMessageParams,
  LspPosition,
  LspServerCapabilities
} from './language-server-protocol'

const INITIALIZE_TIMEOUT_MS = 10_000
const REQUEST_TIMEOUT_MS = 10_000
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
  private readonly requests = new LanguageServerRequestRouter(() => this.connection)
  private disposed = false

  constructor(
    readonly key: string,
    private readonly worktreeId: string,
    private readonly initialLanguageId: string,
    private readonly onStatus: (update: LanguageServerSessionStatusUpdate) => void
  ) {
    this.documents = new MonacoLanguageServerDocuments({
      resolveUri: (filePath) => this.resolveDocumentUri(filePath),
      notify: (method, params) => this.sendNotification(method, params),
      getCapabilities: () => this.capabilities
    })
  }

  async start(): Promise<void> {
    this.onStatus({ state: 'starting' })
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
          clientInfo: { name: 'Yiru', version: 'stage-1' },
          rootUri: this.startResult.workspaceUri,
          workspaceFolders: [
            {
              uri: this.startResult.workspaceUri,
              name: workspaceName(this.startResult.workspacePath)
            }
          ],
          capabilities: stageOneClientCapabilities()
        },
        INITIALIZE_TIMEOUT_MS
      )
      this.capabilities = result.capabilities ?? {}
      validateSynchronizationCapability(this.capabilities)
      await this.connection.sendNotification('initialized', {})
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

  supportsHover(): boolean {
    return Boolean(this.capabilities.hoverProvider)
  }

  supportsDefinition(): boolean {
    return Boolean(this.capabilities.definitionProvider)
  }

  attachDocument(model: monaco.editor.ITextModel, filePath: string): Promise<Disposable> {
    return this.documents.attach(model, filePath)
  }

  async hover(
    uri: string,
    position: LspPosition,
    token: monaco.CancellationToken
  ): Promise<LspHover | null> {
    return this.requests.withCancellation<LspHover | null>(
      'textDocument/hover',
      { textDocument: { uri }, position },
      token,
      REQUEST_TIMEOUT_MS
    )
  }

  async definition(
    uri: string,
    position: LspPosition,
    token: monaco.CancellationToken
  ): Promise<LspDefinition | LspDefinition[] | null> {
    return this.requests.withCancellation<LspDefinition | LspDefinition[] | null>(
      'textDocument/definition',
      { textDocument: { uri }, position },
      token,
      REQUEST_TIMEOUT_MS
    )
  }

  getDocumentUri(model: monaco.editor.ITextModel): string | null {
    return this.documents.getUri(model)
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
      return [...this.protocolLogs]
    }
    const hostLogs = await window.api.languageServers
      .getLogs({ sessionId: this.startResult.sessionId })
      .catch(() => ({ lines: [] }))
    return [...hostLogs.lines, ...this.protocolLogs].slice(-100)
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
      failureReason: 'Yiru Stage 1 language intelligence is read-only.'
    }))
    connection.onRequest('window/showMessageRequest', () => null)
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

  private async stopHostSession(): Promise<void> {
    if (!this.startResult) {
      return
    }
    const { sessionId } = this.startResult
    this.startResult = null
    await window.api.languageServers.stop({ sessionId }).catch(() => {})
  }
}

function validateSynchronizationCapability(capabilities: LspServerCapabilities): void {
  const sync = capabilities.textDocumentSync
  const syncKind = typeof sync === 'number' ? sync : sync?.change
  const supportsOpenClose = typeof sync === 'number' || sync?.openClose === true
  if (!supportsOpenClose || (syncKind !== 1 && syncKind !== 2)) {
    throw new Error('Language server does not support synchronized open documents.')
  }
}

function workspaceName(workspacePath: string): string {
  return getRuntimePathBasename(workspacePath) || workspacePath
}

function stageOneClientCapabilities(): Record<string, unknown> {
  return {
    workspace: { applyEdit: false, configuration: false, workspaceFolders: true },
    textDocument: {
      synchronization: { dynamicRegistration: false, didSave: false, willSave: false },
      hover: { dynamicRegistration: false, contentFormat: ['markdown', 'plaintext'] },
      definition: { dynamicRegistration: false, linkSupport: true }
    },
    window: { workDoneProgress: false }
  }
}
