import type * as monaco from 'monaco-editor'
import { CancellationTokenSource, type MessageConnection } from 'vscode-jsonrpc/browser'

const MAX_PENDING_REQUESTS = 32

export class LanguageServerRequestRouter {
  private pendingRequestCount = 0

  constructor(private readonly getConnection: () => MessageConnection | null) {}

  async withCancellation<T>(
    method: string,
    params: unknown,
    token: monaco.CancellationToken,
    timeoutMs: number
  ): Promise<T> {
    const source = new CancellationTokenSource()
    let rejectCancellation = (_error: Error): void => {}
    const cancelled = new Promise<never>((_resolve, reject) => {
      rejectCancellation = reject
    })
    const cancel = (message: string): void => {
      source.cancel()
      rejectCancellation(new Error(message))
    }
    const cancellation = token.onCancellationRequested(() =>
      cancel('Language server request was cancelled.')
    )
    const timer = setTimeout(
      () => cancel(`Language server request timed out: ${method}.`),
      timeoutMs
    )
    if (token.isCancellationRequested) {
      cancel('Language server request was cancelled.')
    }
    try {
      // Why: vscode-jsonrpc sends $/cancelRequest but intentionally keeps the
      // response promise pending; race it so ignored cancellation cannot hang UI.
      return await Promise.race([this.send<T>(method, params, source), cancelled])
    } finally {
      clearTimeout(timer)
      cancellation.dispose()
      source.dispose()
    }
  }

  async withTimeout<T>(method: string, params: unknown, timeoutMs: number): Promise<T> {
    const source = new CancellationTokenSource()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        source.cancel()
        reject(new Error(`Language server request timed out: ${method}.`))
      }, timeoutMs)
    })
    try {
      return await Promise.race([this.send<T>(method, params, source), timeout])
    } finally {
      if (timer) {
        clearTimeout(timer)
      }
      source.dispose()
    }
  }

  private send<T>(method: string, params: unknown, source: CancellationTokenSource): Promise<T> {
    const connection = this.getConnection()
    if (!connection) {
      return Promise.reject(new Error('Language server connection is unavailable.'))
    }
    if (this.pendingRequestCount >= MAX_PENDING_REQUESTS) {
      return Promise.reject(new Error('Language server has too many pending requests.'))
    }
    this.pendingRequestCount++
    let request: Promise<T>
    try {
      request = connection.sendRequest<T>(method, params, source.token)
    } catch (error) {
      this.pendingRequestCount--
      throw error
    }
    void request.then(
      () => this.pendingRequestCount--,
      () => this.pendingRequestCount--
    )
    return request
  }
}
