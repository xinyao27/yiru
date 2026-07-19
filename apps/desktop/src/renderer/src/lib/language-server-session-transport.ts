import {
  assertRuntimeEnvironmentCapability,
  callRuntimeRpc,
  type RuntimeClientTarget
} from '@/runtime/runtime-rpc-client'

import type {
  LanguageServerDocumentUriArgs,
  LanguageServerDocumentUriResult,
  LanguageServerEvent,
  LanguageServerJsonRpcMessage,
  LanguageServerLocationArgs,
  LanguageServerLocationResult,
  LanguageServerLogsResult,
  LanguageServerSettings,
  LanguageServerStartArgs,
  LanguageServerStartResult
} from '../../../shared/language-server'
import { LANGUAGE_SERVER_RUNTIME_CAPABILITY } from '../../../shared/protocol-version'
import type { RuntimeRpcResponse } from '../../../shared/runtime-rpc-envelope'

export type LanguageServerSessionTransport = {
  start: (args: LanguageServerStartArgs) => Promise<LanguageServerStartResult>
  send: (args: { sessionId: string; message: LanguageServerJsonRpcMessage }) => Promise<void>
  stop: (sessionId: string) => Promise<void>
  resolveDocumentUri: (
    args: LanguageServerDocumentUriArgs
  ) => Promise<LanguageServerDocumentUriResult>
  resolveLocation: (args: LanguageServerLocationArgs) => Promise<LanguageServerLocationResult>
  getLogs: (sessionId: string) => Promise<LanguageServerLogsResult>
  onEvent: (listener: (event: LanguageServerEvent) => void) => () => void
  dispose: () => void
}

export function createLanguageServerSessionTransport(options: {
  runtimeEnvironmentId?: string | null
  settings: LanguageServerSettings
}): LanguageServerSessionTransport {
  const environmentId = options.runtimeEnvironmentId?.trim()
  return environmentId
    ? new RuntimeLanguageServerTransport(environmentId, options.settings)
    : new MainLanguageServerTransport()
}

class MainLanguageServerTransport implements LanguageServerSessionTransport {
  private readonly events = new BufferedLanguageServerEvents()
  private readonly unsubscribe = window.api.languageServers.onEvent((event) =>
    this.events.emit(event)
  )

  start(args: LanguageServerStartArgs): Promise<LanguageServerStartResult> {
    return window.api.languageServers.start(args)
  }
  send(args: { sessionId: string; message: LanguageServerJsonRpcMessage }): Promise<void> {
    return window.api.languageServers.send(args)
  }
  stop(sessionId: string): Promise<void> {
    return window.api.languageServers.stop({ sessionId })
  }
  resolveDocumentUri(
    args: LanguageServerDocumentUriArgs
  ): Promise<LanguageServerDocumentUriResult> {
    return window.api.languageServers.resolveDocumentUri(args)
  }
  resolveLocation(args: LanguageServerLocationArgs): Promise<LanguageServerLocationResult> {
    return window.api.languageServers.resolveLocation(args)
  }
  getLogs(sessionId: string): Promise<LanguageServerLogsResult> {
    return window.api.languageServers.getLogs({ sessionId })
  }
  onEvent(listener: (event: LanguageServerEvent) => void): () => void {
    return this.events.subscribe(listener)
  }
  dispose(): void {
    this.unsubscribe()
    this.events.dispose()
  }
}

class RuntimeLanguageServerTransport implements LanguageServerSessionTransport {
  private readonly clientId = createTransportClientId()
  private readonly events = new BufferedLanguageServerEvents()
  private readonly target: RuntimeClientTarget
  private subscription: { unsubscribe: () => void } | null = null
  private sessionId: string | null = null

  constructor(
    private readonly environmentId: string,
    private readonly settings: LanguageServerSettings
  ) {
    this.target = { kind: 'environment', environmentId }
  }

  async start(args: LanguageServerStartArgs): Promise<LanguageServerStartResult> {
    await assertRuntimeEnvironmentCapability(
      this.environmentId,
      LANGUAGE_SERVER_RUNTIME_CAPABILITY,
      'Update the selected runtime before using its language server.'
    )
    const environment = await window.api.runtimeEnvironments.resolve({
      selector: this.environmentId
    })
    await this.subscribe()
    try {
      const result = await callRuntimeRpc<LanguageServerStartResult>(
        this.target,
        'languageServers.start',
        { ...args, clientId: this.clientId, configuration: this.settings }
      )
      this.sessionId = result.sessionId
      return {
        ...result,
        hostId: `runtime:${this.environmentId}`,
        hostLabel: `Runtime: ${environment.name} (${result.hostLabel})`
      }
    } catch (error) {
      this.dispose()
      throw error
    }
  }

  send(args: { sessionId: string; message: LanguageServerJsonRpcMessage }): Promise<void> {
    return callRuntimeRpc(this.target, 'languageServers.send', { ...args, clientId: this.clientId })
  }
  async stop(sessionId: string): Promise<void> {
    try {
      await callRuntimeRpc(this.target, 'languageServers.stop', {
        sessionId,
        clientId: this.clientId
      })
    } finally {
      if (this.sessionId === sessionId) {
        this.sessionId = null
      }
    }
  }
  resolveDocumentUri(
    args: LanguageServerDocumentUriArgs
  ): Promise<LanguageServerDocumentUriResult> {
    return callRuntimeRpc(this.target, 'languageServers.resolveDocumentUri', {
      ...args,
      clientId: this.clientId
    })
  }
  resolveLocation(args: LanguageServerLocationArgs): Promise<LanguageServerLocationResult> {
    return callRuntimeRpc(this.target, 'languageServers.resolveLocation', {
      ...args,
      clientId: this.clientId
    })
  }
  getLogs(sessionId: string): Promise<LanguageServerLogsResult> {
    return callRuntimeRpc(this.target, 'languageServers.getLogs', {
      sessionId,
      clientId: this.clientId
    })
  }
  onEvent(listener: (event: LanguageServerEvent) => void): () => void {
    return this.events.subscribe(listener)
  }
  dispose(): void {
    this.subscription?.unsubscribe()
    this.subscription = null
    this.events.dispose()
  }

  private async subscribe(): Promise<void> {
    if (this.subscription) {
      return
    }
    this.subscription = await window.api.runtimeEnvironments.subscribe(
      {
        selector: this.environmentId,
        method: 'languageServers.events.subscribe',
        params: { clientId: this.clientId }
      },
      {
        onResponse: (response) => this.handleResponse(response),
        onError: (error) => this.fail(error.message),
        onClose: () => {
          this.subscription = null
          this.fail('Language server runtime connection closed.')
        }
      }
    )
  }

  private handleResponse(response: RuntimeRpcResponse<unknown>): void {
    if (!response.ok) {
      this.fail(response.error.message)
      return
    }
    if (isLanguageServerEvent(response.result)) {
      this.events.emit(response.result)
    }
  }

  private fail(message: string): void {
    if (!this.sessionId) {
      return
    }
    this.events.emit({ type: 'status', sessionId: this.sessionId, status: 'failed', message })
  }
}

class BufferedLanguageServerEvents {
  private listener: ((event: LanguageServerEvent) => void) | null = null
  private pending: LanguageServerEvent[] = []

  subscribe(listener: (event: LanguageServerEvent) => void): () => void {
    if (this.listener) {
      throw new Error('Language server transport can only listen once.')
    }
    this.listener = listener
    for (const event of this.pending) {
      listener(event)
    }
    this.pending = []
    return () => {
      if (this.listener === listener) {
        this.listener = null
      }
    }
  }
  emit(event: LanguageServerEvent): void {
    if (this.listener) {
      this.listener(event)
    } else {
      this.pending.push(event)
    }
    if (this.pending.length > 100) {
      this.pending.shift()
    }
  }
  dispose(): void {
    this.listener = null
    this.pending = []
  }
}

function createTransportClientId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Secure randomness is unavailable for the language server transport.')
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  return `lsp-${[...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

function isLanguageServerEvent(value: unknown): value is LanguageServerEvent {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<LanguageServerEvent>
  return (
    typeof candidate.sessionId === 'string' &&
    (candidate.type === 'message' ||
      (candidate.type === 'status' &&
        (candidate.status === 'running' ||
          candidate.status === 'stopped' ||
          candidate.status === 'failed')))
  )
}
