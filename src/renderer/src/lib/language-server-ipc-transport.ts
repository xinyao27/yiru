import {
  AbstractMessageReader,
  AbstractMessageWriter,
  Disposable,
  type DataCallback,
  type Message
} from 'vscode-jsonrpc/browser'
import type {
  LanguageServerEvent,
  LanguageServerJsonRpcMessage,
  LanguageServerSessionStatus
} from '../../../shared/language-server'
import type { LanguageServerSessionTransport } from './language-server-session-transport'

export class LanguageServerIpcReader extends AbstractMessageReader {
  private unsubscribe: (() => void) | null = null

  constructor(
    private readonly sessionId: string,
    private readonly transport: LanguageServerSessionTransport,
    private readonly onStatus: (status: LanguageServerSessionStatus, message?: string) => void
  ) {
    super()
  }

  listen(callback: DataCallback): Disposable {
    if (this.unsubscribe) {
      throw new Error('Language server IPC reader can only listen once.')
    }
    this.unsubscribe = this.transport.onEvent((event) => {
      if (event.sessionId !== this.sessionId) {
        return
      }
      this.handleEvent(event, callback)
    })
    return Disposable.create(() => {
      this.unsubscribe?.()
      this.unsubscribe = null
    })
  }

  override dispose(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    super.dispose()
  }

  private handleEvent(event: LanguageServerEvent, callback: DataCallback): void {
    if (event.type === 'message') {
      callback(event.message as Message)
      return
    }
    this.onStatus(event.status, event.message)
    if (event.status === 'running') {
      return
    }
    if (event.status === 'failed') {
      this.fireError(new Error(event.message ?? 'Language server stopped unexpectedly.'))
    }
    this.fireClose()
  }
}

export class LanguageServerIpcWriter extends AbstractMessageWriter {
  private writeQueue = Promise.resolve()

  constructor(
    private readonly sessionId: string,
    private readonly transport: LanguageServerSessionTransport
  ) {
    super()
  }

  write(message: Message): Promise<void> {
    const operation = this.writeQueue.then(() =>
      this.transport.send({
        sessionId: this.sessionId,
        message: message as LanguageServerJsonRpcMessage
      })
    )
    this.writeQueue = operation.catch(() => {})
    return operation.catch((error) => {
      this.fireError(error, message)
      throw error
    })
  }

  end(): void {}
}
