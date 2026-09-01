const MAX_REQUEST_BYTES = 8 * 1024
const APNS_TOKEN_PATTERN = /^[a-f0-9]{64}$/i
const OPAQUE_ID_PATTERN = /^[a-f0-9]{16,64}$/i
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/

export type PushEnvironment = 'production' | 'sandbox'

export type PushRequest = {
  collapseId: string
  ciphertext: string
  deviceToken: string
  environment: PushEnvironment
  keyId: string
  nonce: string
}

export async function readPushRequest(request: Request): Promise<PushRequest | null> {
  const bytes = await readBoundedBody(request)
  if (!bytes) {
    return null
  }
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const deviceToken = Reflect.get(value, 'deviceToken')
  const environment = Reflect.get(value, 'environment')
  const keyId = Reflect.get(value, 'keyId')
  const nonce = Reflect.get(value, 'nonce')
  const ciphertext = Reflect.get(value, 'ciphertext')
  const collapseId = Reflect.get(value, 'collapseId')
  if (
    typeof deviceToken !== 'string' ||
    !APNS_TOKEN_PATTERN.test(deviceToken) ||
    (environment !== 'production' && environment !== 'sandbox') ||
    typeof keyId !== 'string' ||
    !OPAQUE_ID_PATTERN.test(keyId) ||
    typeof nonce !== 'string' ||
    nonce.length > 32 ||
    !BASE64URL_PATTERN.test(nonce) ||
    typeof ciphertext !== 'string' ||
    ciphertext.length > 5_500 ||
    !BASE64URL_PATTERN.test(ciphertext) ||
    typeof collapseId !== 'string' ||
    !OPAQUE_ID_PATTERN.test(collapseId)
  ) {
    return null
  }
  return { collapseId, ciphertext, deviceToken, environment, keyId, nonce }
}

async function readBoundedBody(request: Request): Promise<Uint8Array | null> {
  const declaredLength = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return null
  }
  if (!request.body) {
    return null
  }
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) {
        break
      }
      byteLength += next.value.byteLength
      if (byteLength > MAX_REQUEST_BYTES) {
        await reader.cancel('request_too_large')
        return null
      }
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }
  const result = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}
