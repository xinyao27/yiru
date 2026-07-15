import type { SshChannelMultiplexer } from './ssh-channel-multiplexer'
import { STREAM_CHUNK_SIZE } from './relay-protocol'
import {
  decodeSshStreamBase64,
  parseSshFileStreamMetadata,
  StreamProtocolError,
  type SshFileStreamMetadata
} from './ssh-filesystem-stream-validation'

export { isMethodNotFoundError, StreamProtocolError } from './ssh-filesystem-stream-validation'
export type { SshFileStreamMetadata } from './ssh-filesystem-stream-validation'

const SENTINEL_STREAM_ID = -1
const MAX_PENDING_FRAME_COUNT = 64
const MAX_PENDING_FRAME_CHARACTERS = 16 * 1024 * 1024

type PendingFrame =
  | { kind: 'chunk'; params: Record<string, unknown> }
  | { kind: 'end'; params: Record<string, unknown> }
  | { kind: 'error'; params: Record<string, unknown> }

export type SshFileStreamConsumerOptions = {
  maxBytes: number
  profile?: string
  signal?: AbortSignal
  onMetadata?: (metadata: SshFileStreamMetadata) => void
  onChunk: (chunk: Buffer) => void
}

export function consumeSshFileStream(
  mux: SshChannelMultiplexer,
  filePath: string,
  options: SshFileStreamConsumerOptions
): Promise<SshFileStreamMetadata> {
  const streamId = { current: SENTINEL_STREAM_ID }
  const unsubscribers: (() => void)[] = []
  const pending: PendingFrame[] = []
  let pendingCharacters = 0
  let pendingError: Error | null = null
  let metadata: SshFileStreamMetadata | null = null
  let metadataReady = false
  let expectedSeq = 0
  let receivedChunks = 0
  let bytesReceived = 0
  let settled = false

  return new Promise<SshFileStreamMetadata>((resolve, reject) => {
    const cleanup = (): void => {
      while (unsubscribers.length > 0) {
        try {
          unsubscribers.pop()?.()
        } catch {
          // Best-effort listener cleanup.
        }
      }
    }

    const cancel = (): void => {
      if (streamId.current === SENTINEL_STREAM_ID || mux.isDisposed()) {
        return
      }
      try {
        mux.notify('fs.cancelStream', { streamId: streamId.current })
      } catch {
        // Best-effort relay cleanup.
      }
    }

    const fail = (error: unknown): void => {
      if (settled) {
        return
      }
      settled = true
      cancel()
      cleanup()
      reject(error instanceof Error ? error : new Error(String(error)))
    }

    const succeed = (): void => {
      if (settled || !metadata) {
        return
      }
      settled = true
      cleanup()
      resolve(metadata)
    }

    const handleChunk = (params: Record<string, unknown>): void => {
      if (settled || params.streamId !== streamId.current) {
        return
      }
      if (!metadata) {
        fail(
          new StreamProtocolError(`Chunk arrived before metadata for stream ${streamId.current}`)
        )
        return
      }
      const seq = params.seq
      const data = params.data
      if (!Number.isInteger(seq) || (seq as number) < 0 || typeof data !== 'string') {
        fail(new StreamProtocolError(`Malformed chunk for stream ${streamId.current}`))
        return
      }
      if (seq !== expectedSeq) {
        fail(
          new StreamProtocolError(
            `Out-of-order chunk for stream ${streamId.current}: expected ${expectedSeq}, got ${seq}`
          )
        )
        return
      }
      const totalChunks = Math.ceil(metadata.totalSize / STREAM_CHUNK_SIZE)
      if (expectedSeq >= totalChunks) {
        fail(new StreamProtocolError(`Unexpected extra chunk for stream ${streamId.current}`))
        return
      }
      const offset = expectedSeq * STREAM_CHUNK_SIZE
      const expectedLength = Math.min(STREAM_CHUNK_SIZE, metadata.totalSize - offset)
      const expectedBase64Length = Math.ceil(expectedLength / 3) * 4
      if (data.length !== expectedBase64Length) {
        fail(
          new StreamProtocolError(
            `Encoded chunk length mismatch for stream ${streamId.current}: seq=${seq}`
          )
        )
        return
      }
      let decoded: Buffer
      try {
        decoded = decodeSshStreamBase64(data, streamId.current)
      } catch (error) {
        fail(error)
        return
      }
      if (decoded.length !== expectedLength) {
        fail(
          new StreamProtocolError(
            `Chunk length mismatch for stream ${streamId.current}: seq=${seq} expected=${expectedLength} got=${decoded.length}`
          )
        )
        return
      }
      try {
        options.onChunk(decoded)
      } catch (error) {
        fail(error)
        return
      }
      expectedSeq += 1
      receivedChunks += 1
      bytesReceived += decoded.length
      // Why: ACK follows actual consumption, keeping the relay's credit window
      // as the bound on unparsed transcript bytes held by this client.
      mux.notify('fs.streamAck', { streamId: streamId.current, seq })
    }

    const handleEnd = (params: Record<string, unknown>): void => {
      if (settled || params.streamId !== streamId.current) {
        return
      }
      if (!metadata) {
        fail(new StreamProtocolError(`Stream end before metadata for stream ${streamId.current}`))
        return
      }
      const totalChunks = Math.ceil(metadata.totalSize / STREAM_CHUNK_SIZE)
      if (receivedChunks !== totalChunks || bytesReceived !== metadata.totalSize) {
        fail(
          new StreamProtocolError(
            `Stream count mismatch ${streamId.current}: chunks=${receivedChunks}/${totalChunks} bytes=${bytesReceived}/${metadata.totalSize}`
          )
        )
        return
      }
      succeed()
    }

    const handleStreamError = (params: Record<string, unknown>): void => {
      if (settled || params.streamId !== streamId.current) {
        return
      }
      if (typeof params.message !== 'string' || typeof params.code !== 'string') {
        fail(new StreamProtocolError(`Malformed error frame for stream ${streamId.current}`))
        return
      }
      const error = new Error(params.message) as Error & { code: string }
      error.code = params.code
      fail(error)
    }

    const dispatchFrame = (frame: PendingFrame): void => {
      if (frame.kind === 'chunk') {
        handleChunk(frame.params)
      } else if (frame.kind === 'end') {
        handleEnd(frame.params)
      } else {
        handleStreamError(frame.params)
      }
    }

    const queueOrDispatch = (frame: PendingFrame): void => {
      if (metadataReady) {
        dispatchFrame(frame)
        return
      }
      if (pendingError) {
        return
      }
      const frameCharacters =
        frame.kind === 'chunk' && typeof frame.params.data === 'string'
          ? frame.params.data.length
          : 0
      if (
        pending.length >= MAX_PENDING_FRAME_COUNT ||
        pendingCharacters + frameCharacters > MAX_PENDING_FRAME_CHARACTERS
      ) {
        // Why: stream ids are learned from metadata, so same-tick frames must
        // queue briefly; a fixed pre-metadata cap prevents a peer flood.
        pendingError = new StreamProtocolError('Too many stream frames arrived before metadata')
        pending.length = 0
        return
      }
      pendingCharacters += frameCharacters
      pending.push(frame)
    }

    unsubscribers.push(
      mux.onNotificationByMethod('fs.streamChunk', (params) =>
        queueOrDispatch({ kind: 'chunk', params })
      ),
      mux.onNotificationByMethod('fs.streamEnd', (params) =>
        queueOrDispatch({ kind: 'end', params })
      ),
      mux.onNotificationByMethod('fs.streamError', (params) =>
        queueOrDispatch({ kind: 'error', params })
      ),
      mux.onDispose((reason) => {
        const error = new Error(
          reason === 'connection_lost'
            ? 'SSH connection lost, reconnecting...'
            : 'Multiplexer disposed'
        ) as Error & { code: string }
        error.code = reason === 'connection_lost' ? 'CONNECTION_LOST' : 'DISPOSED'
        fail(error)
      })
    )

    const onAbort = (): void => {
      const error = new Error('SSH file stream was cancelled')
      error.name = 'AbortError'
      fail(error)
    }
    if (options.signal) {
      if (options.signal.aborted) {
        onAbort()
        return
      }
      options.signal.addEventListener('abort', onAbort, { once: true })
      unsubscribers.push(() => options.signal?.removeEventListener('abort', onAbort))
    }

    const requestParams = {
      filePath,
      flowControl: 'ack',
      ...(options.profile ? { profile: options.profile } : {})
    }
    // Why: caller abort rejects immediately above, but the metadata RPC must stay
    // alive long enough to learn and cancel a stream whose response is already in flight.
    const metadataRequest = mux.request('fs.readFileStream', requestParams)
    void metadataRequest
      .then((rawMetadata) => {
        if (settled) {
          // Why: abort can settle before this continuation learns the id; late metadata reclaims the slot.
          const lateMetadata = parseSshFileStreamMetadata(rawMetadata, options.maxBytes)
          if (lateMetadata.streamId !== undefined && !mux.isDisposed()) {
            mux.notify('fs.cancelStream', { streamId: lateMetadata.streamId })
          }
          return
        }
        metadata = parseSshFileStreamMetadata(rawMetadata, options.maxBytes)
        if (metadata.streamId !== undefined) {
          streamId.current = metadata.streamId
        }
        options.onMetadata?.(metadata)
        if (metadata.empty) {
          succeed()
          return
        }
        metadataReady = true
        if (pendingError) {
          fail(pendingError)
          return
        }
        for (const frame of pending) {
          if (settled) {
            break
          }
          dispatchFrame(frame)
        }
        pending.length = 0
      })
      .catch(fail)
  })
}
