import { RuntimeClientError } from './types'

export function decodeRuntimeOrpcSocketPayload(frame: {
  encoding: 'text' | 'base64'
  data: string
}): string | ArrayBuffer {
  if (frame.encoding === 'text') {
    return frame.data
  }
  const bytes = Buffer.from(frame.data, 'base64')
  if (bytes.toString('base64') !== frame.data) {
    throw new RuntimeClientError(
      'invalid_runtime_response',
      'The Yiru runtime returned an invalid response frame.'
    )
  }
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

export async function runtimeOrpcSocketPayloadBytes(
  data: ArrayBufferLike | Blob | ArrayBufferView<ArrayBufferLike>
): Promise<Uint8Array<ArrayBufferLike>> {
  if (data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer())
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  }
  return new Uint8Array(data)
}
