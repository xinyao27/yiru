import type {
  ComputerActionResult,
  ComputerListAppsResult,
  ComputerListWindowsResult,
  ComputerProviderCapabilities,
  ComputerSnapshotResult
} from '@yiru/runtime-protocol/workbench/runtime-types'

import { normalizeComputerActionResult } from './action-verification-normalization'
import { resolveMacOSComputerUseExecutablePath } from './macos-native-provider-paths'
import {
  hasMacOSProviderCapability,
  macOSActionCapabilityKey,
  type MacOSProviderMethod,
  type PendingMacOSProviderRequest,
  REQUIRED_MACOS_PROVIDER_PROTOCOL_VERSION
} from './macos-provider-contract'
import { consumeMacOSProviderResponses } from './macos-provider-responses'
import {
  cleanupSocketDirectory,
  type MacOSProviderSocketData,
  startMacOSProvider
} from './macos-provider-transport'
import type { ComputerProviderActionMethod } from './provider-action-validation'
import { validateComputerProviderPasteText } from './provider-paste-validation'
import { RuntimeClientError } from './runtime-client-error'

const REQUEST_TIMEOUT_MS = 60_000

export class MacOSProviderClient {
  private decoder = new TextDecoder()
  private nextId = 1
  private pending = new Map<number, PendingMacOSProviderRequest>()
  private process: ReturnType<typeof Bun.spawn> | null = null
  private providerCapabilities: ComputerProviderCapabilities | null = null
  private socket: Bun.Socket<MacOSProviderSocketData> | null = null
  private socketAbortController: AbortController | null = null
  private socketBuffer = ''
  private socketDirectory: string | null = null
  private socketGeneration = 0
  private socketStartPromise: Promise<Bun.Socket<MacOSProviderSocketData>> | null = null
  private socketToken: string | null = null

  async capabilities(): Promise<ComputerProviderCapabilities> {
    await this.ensureCompatible()
    if (!this.providerCapabilities) {
      throw new RuntimeClientError('accessibility_error', 'computer provider has no capabilities')
    }
    return this.providerCapabilities
  }

  async listApps(): Promise<ComputerListAppsResult> {
    return (await this.call('listApps', {})) as ComputerListAppsResult
  }

  async listWindows(params: unknown): Promise<ComputerListWindowsResult> {
    await this.ensureCapability('windows', 'list')
    return (await this.call('listWindows', params)) as ComputerListWindowsResult
  }

  async snapshot(params: unknown): Promise<ComputerSnapshotResult> {
    return (await this.call('getAppState', params)) as ComputerSnapshotResult
  }

  async action(
    method: ComputerProviderActionMethod,
    params: unknown
  ): Promise<ComputerActionResult> {
    const validation = validateComputerProviderPasteText(method, params)
    if (validation) {
      await validation
    }
    await this.ensureActionSupported(method)
    return normalizeComputerActionResult((await this.call(method, params)) as ComputerActionResult)
  }

  shutdown(): void {
    const socket = this.socket
    const token = this.socketToken
    this.socket = null
    this.socketAbortController?.abort()
    this.socketAbortController = null
    this.socketStartPromise = null
    this.socketGeneration++
    this.providerCapabilities = null
    this.socketBuffer = ''
    this.decoder = new TextDecoder()
    if (socket?.readyState === 1) {
      const id = this.nextId++
      socket.end(`${JSON.stringify({ id, method: 'terminate', params: {}, token })}\n`)
    } else {
      this.process?.kill('SIGTERM')
    }
    this.process = null
    this.socketToken = null
    this.rejectPending(
      new RuntimeClientError('accessibility_error', 'native macOS provider shut down')
    )
    this.cleanupSocketDirectory()
  }

  private async call(method: MacOSProviderMethod, params: unknown): Promise<unknown> {
    if (method !== 'handshake') {
      await this.ensureCompatible()
    }
    return await this.send(method, params)
  }

  private async send(method: MacOSProviderMethod, params: unknown): Promise<unknown> {
    const socket = await this.ensureSocketStarted()
    const id = this.nextId++
    const payload = new TextEncoder().encode(
      `${JSON.stringify({ id, method, params, token: this.socketToken })}\n`
    )
    const result = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        this.invalidateSocket(
          socket,
          new RuntimeClientError('action_timeout', `native macOS provider ${method} timed out`)
        )
        reject(
          new RuntimeClientError('action_timeout', `native macOS provider ${method} timed out`)
        )
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(id, { reject, resolve, timer })
    })
    const bytesWritten = socket.write(payload)
    if (bytesWritten !== payload.byteLength) {
      const error = new RuntimeClientError(
        'accessibility_error',
        'native macOS provider socket could not accept the complete request'
      )
      this.deletePending(id)
      this.invalidateSocket(socket, error)
      throw error
    }
    socket.flush()
    return await result
  }

  private async ensureCompatible(): Promise<void> {
    if (this.providerCapabilities) {
      return
    }
    const capabilities = await this.readCapabilities()
    if (capabilities.protocolVersion === REQUIRED_MACOS_PROVIDER_PROTOCOL_VERSION) {
      this.providerCapabilities = capabilities
      return
    }
    this.shutdown()
    const restarted = await this.readCapabilities()
    if (restarted.protocolVersion !== REQUIRED_MACOS_PROVIDER_PROTOCOL_VERSION) {
      throw new RuntimeClientError(
        'provider_incompatible',
        `native macOS provider protocol ${restarted.protocolVersion} is incompatible with required protocol ${REQUIRED_MACOS_PROVIDER_PROTOCOL_VERSION}`
      )
    }
    this.providerCapabilities = restarted
  }

  private async readCapabilities(): Promise<ComputerProviderCapabilities> {
    return (await this.send('handshake', {})) as ComputerProviderCapabilities
  }

  private async ensureCapability(
    group: keyof ComputerProviderCapabilities['supports'],
    capability: string
  ): Promise<void> {
    await this.ensureCompatible()
    if (hasMacOSProviderCapability(this.providerCapabilities, group, capability)) {
      return
    }
    throw new RuntimeClientError(
      'unsupported_capability',
      `native macOS provider does not support ${String(group)}.${capability}`
    )
  }

  private async ensureActionSupported(method: ComputerProviderActionMethod): Promise<void> {
    await this.ensureCapability('actions', macOSActionCapabilityKey(method))
  }

  private async ensureSocketStarted(): Promise<Bun.Socket<MacOSProviderSocketData>> {
    if (this.socket?.readyState === 1) {
      return this.socket
    }
    if (this.socketStartPromise) {
      return await this.socketStartPromise
    }
    const startPromise = this.startSocket()
    this.socketStartPromise = startPromise
    try {
      return await startPromise
    } finally {
      if (this.socketStartPromise === startPromise) {
        this.socketStartPromise = null
      }
    }
  }

  private async startSocket(): Promise<Bun.Socket<MacOSProviderSocketData>> {
    const helperExecutablePath = resolveMacOSComputerUseExecutablePath()
    if (!helperExecutablePath) {
      throw new RuntimeClientError('accessibility_error', 'Yiru Computer Use.app was not found')
    }
    const generation = ++this.socketGeneration
    const abortController = new AbortController()
    this.socketAbortController = abortController
    const started = await startMacOSProvider({
      handlers: {
        close: (socket, error) => this.handleSocketClose(socket, error),
        data: (socket, chunk) => this.handleSocketData(socket, chunk),
        error: (socket, error) => this.handleSocketError(socket, error)
      },
      helperExecutablePath,
      signal: abortController.signal
    })
    if (generation !== this.socketGeneration) {
      started.socket.terminate()
      started.process.kill('SIGTERM')
      cleanupSocketDirectory(started.socketDirectory)
      throw new RuntimeClientError(
        'accessibility_error',
        'native macOS provider startup was superseded'
      )
    }
    this.socketAbortController = null
    this.process = started.process
    this.socket = started.socket
    this.socketDirectory = started.socketDirectory
    this.socketToken = started.socketToken
    return started.socket
  }

  private handleSocketData(socket: Bun.Socket<MacOSProviderSocketData>, chunk: Uint8Array): void {
    if (this.socket !== socket) {
      return
    }
    this.socketBuffer = consumeMacOSProviderResponses({
      buffer: this.socketBuffer,
      chunk,
      decoder: this.decoder,
      handle: (response) => {
        const pending = this.pending.get(response.id)
        if (!pending) {
          return
        }
        this.deletePending(response.id)
        if (response.ok) {
          pending.resolve(response.result)
        } else {
          pending.reject(new RuntimeClientError(response.error.code, response.error.message))
        }
      }
    })
  }

  private handleSocketClose(socket: Bun.Socket<MacOSProviderSocketData>, error?: Error): void {
    this.invalidateSocket(
      socket,
      new RuntimeClientError(
        'accessibility_error',
        error?.message ?? 'native macOS helper app connection closed'
      )
    )
  }

  private handleSocketError(socket: Bun.Socket<MacOSProviderSocketData>, error: Error): void {
    this.invalidateSocket(socket, new RuntimeClientError('accessibility_error', error.message))
  }

  private invalidateSocket(
    socket: Bun.Socket<MacOSProviderSocketData>,
    error: RuntimeClientError
  ): void {
    if (this.socket !== socket) {
      return
    }
    this.socket = null
    this.socketGeneration++
    this.providerCapabilities = null
    this.socketBuffer = ''
    this.decoder = new TextDecoder()
    socket.terminate()
    this.process?.kill('SIGTERM')
    this.process = null
    this.socketToken = null
    this.rejectPending(error)
    this.cleanupSocketDirectory()
  }

  private rejectPending(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(error)
      this.pending.delete(id)
    }
  }

  private deletePending(id: number): void {
    const pending = this.pending.get(id)
    if (pending) {
      clearTimeout(pending.timer)
      this.pending.delete(id)
    }
  }

  private cleanupSocketDirectory(): void {
    cleanupSocketDirectory(this.socketDirectory)
    this.socketDirectory = null
  }
}
