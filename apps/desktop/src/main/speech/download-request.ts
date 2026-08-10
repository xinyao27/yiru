import { EventEmitter } from 'node:events'
import { request as requestHttps } from 'node:https'
import type { Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export type SpeechDownloadResponse = {
  destroy: () => void
  headers: Record<string, string | string[] | undefined>
  offData: (listener: (chunk: Buffer) => void) => void
  onData: (listener: (chunk: Buffer) => void) => void
  pipeTo: (destination: Writable) => Promise<void>
  statusCode?: number
}

export type SpeechDownloadRequest = {
  abort: () => void
  end: () => void
  offError: (listener: (error: Error) => void) => void
  offRedirect: (listener: (statusCode: number, method: string, redirectUrl: string) => void) => void
  offResponse: (listener: (response: SpeechDownloadResponse) => void) => void
  onError: (listener: (error: Error) => void) => void
  onRedirect: (listener: (statusCode: number, method: string, redirectUrl: string) => void) => void
  onResponse: (listener: (response: SpeechDownloadResponse) => void) => void
  setHeader: (name: string, value: string) => void
}

export type SpeechDownloadRequestFactory = (url: string) => SpeechDownloadRequest

let requestFactory: SpeechDownloadRequestFactory = createNodeSpeechDownloadRequest

export function configureSpeechDownloadRequestFactory(factory: SpeechDownloadRequestFactory): void {
  requestFactory = factory
}

export function createSpeechDownloadRequest(url: string): SpeechDownloadRequest {
  return requestFactory(url)
}

function createNodeSpeechDownloadRequest(url: string): SpeechDownloadRequest {
  const events = new EventEmitter()
  const headers: Record<string, string> = {}
  let request: ReturnType<typeof requestHttps> | null = null

  return {
    abort: () => request?.destroy(),
    end: () => {
      request = requestHttps(url, { headers, method: 'GET' }, (response) => {
        const statusCode = response.statusCode ?? 0
        const redirectUrl = response.headers.location
        if (statusCode >= 300 && statusCode < 400 && redirectUrl) {
          response.destroy()
          events.emit('redirect', statusCode, 'GET', redirectUrl)
          return
        }
        events.emit('response', {
          destroy: () => response.destroy(),
          headers: response.headers,
          offData: (listener: (chunk: Buffer) => void) => response.off('data', listener),
          onData: (listener: (chunk: Buffer) => void) => response.on('data', listener),
          pipeTo: (destination) => pipeline(response, destination),
          statusCode: response.statusCode
        } satisfies SpeechDownloadResponse)
      })
      request.on('error', (error: Error) => events.emit('error', error))
      request.end()
    },
    offError: (listener) => events.off('error', listener),
    offRedirect: (listener) => events.off('redirect', listener),
    offResponse: (listener) => events.off('response', listener),
    onError: (listener) => events.on('error', listener),
    onRedirect: (listener) => events.on('redirect', listener),
    onResponse: (listener) => events.on('response', listener),
    setHeader: (name, value) => {
      headers[name] = value
    }
  }
}
