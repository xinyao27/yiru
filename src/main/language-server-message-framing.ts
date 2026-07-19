import type { LanguageServerJsonRpcMessage } from '../shared/language-server'

export const MAX_LANGUAGE_SERVER_HEADER_BYTES = 8 * 1024
export const MAX_LANGUAGE_SERVER_MESSAGE_BYTES = 8 * 1024 * 1024

const HEADER_SEPARATOR = Buffer.from('\r\n\r\n')

export class LanguageServerFramingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LanguageServerFramingError'
  }
}

export class LanguageServerMessageFramer {
  private buffer = Buffer.alloc(0)
  private contentLength: number | null = null

  push(chunk: Buffer): LanguageServerJsonRpcMessage[] {
    if (chunk.length === 0) {
      return []
    }
    this.buffer = Buffer.concat([this.buffer, chunk])
    const messages: LanguageServerJsonRpcMessage[] = []

    while (true) {
      if (this.contentLength === null) {
        const headerEnd = this.buffer.indexOf(HEADER_SEPARATOR)
        if (headerEnd === -1) {
          if (this.buffer.length > MAX_LANGUAGE_SERVER_HEADER_BYTES) {
            throw new LanguageServerFramingError('Language server response header is too large.')
          }
          break
        }
        if (headerEnd > MAX_LANGUAGE_SERVER_HEADER_BYTES) {
          throw new LanguageServerFramingError('Language server response header is too large.')
        }
        this.contentLength = parseContentLength(
          this.buffer.subarray(0, headerEnd).toString('ascii')
        )
        this.buffer = this.buffer.subarray(headerEnd + HEADER_SEPARATOR.length)
      }

      if (this.buffer.length < this.contentLength) {
        break
      }
      const body = this.buffer.subarray(0, this.contentLength)
      this.buffer = this.buffer.subarray(this.contentLength)
      this.contentLength = null
      messages.push(parseMessage(body))
    }

    return messages
  }
}

export function encodeLanguageServerMessage(message: LanguageServerJsonRpcMessage): Buffer {
  if (!isLanguageServerJsonRpcMessage(message)) {
    throw new LanguageServerFramingError('Invalid JSON-RPC message.')
  }
  const body = Buffer.from(JSON.stringify(message), 'utf8')
  if (body.length > MAX_LANGUAGE_SERVER_MESSAGE_BYTES) {
    throw new LanguageServerFramingError('Language server message is too large.')
  }
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'), body])
}

function parseContentLength(header: string): number {
  const values = header
    .split('\r\n')
    .map((line) => /^Content-Length:\s*([0-9]+)\s*$/i.exec(line)?.[1])
    .filter((value): value is string => value !== undefined)
  if (values.length !== 1) {
    throw new LanguageServerFramingError('Language server response has invalid framing.')
  }
  const length = Number(values[0])
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new LanguageServerFramingError('Language server response has invalid length.')
  }
  if (length > MAX_LANGUAGE_SERVER_MESSAGE_BYTES) {
    throw new LanguageServerFramingError('Language server response is too large.')
  }
  return length
}

function parseMessage(body: Buffer): LanguageServerJsonRpcMessage {
  let value: unknown
  try {
    value = JSON.parse(body.toString('utf8'))
  } catch {
    throw new LanguageServerFramingError('Language server returned invalid JSON.')
  }
  if (!isLanguageServerJsonRpcMessage(value)) {
    throw new LanguageServerFramingError('Language server returned an invalid JSON-RPC message.')
  }
  return value
}

function isLanguageServerJsonRpcMessage(value: unknown): value is LanguageServerJsonRpcMessage {
  if (!value || typeof value !== 'object') {
    return false
  }
  const message = value as Record<string, unknown>
  if (message.jsonrpc !== '2.0') {
    return false
  }
  const hasMethod = typeof message.method === 'string' && message.method.length > 0
  const hasId =
    typeof message.id === 'string' || typeof message.id === 'number' || message.id === null
  if ('id' in message && !hasId) {
    return false
  }
  const hasResponse = hasId && ('result' in message || isJsonRpcError(message.error))
  return hasMethod || hasResponse
}

function isJsonRpcError(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false
  }
  const error = value as Record<string, unknown>
  return typeof error.code === 'number' && typeof error.message === 'string'
}
