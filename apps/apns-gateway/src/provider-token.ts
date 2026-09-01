const TOKEN_REFRESH_SECONDS = 50 * 60

type ProviderToken = {
  createdAtSeconds: number
  identity: string
  value: string
}

let cachedProviderToken: ProviderToken | null = null
let pendingProviderToken: { identity: string; pem: string; value: Promise<string> } | null = null
let cachedSigningKey: { pem: string; value: CryptoKey } | null = null

export async function getProviderToken(env: Env): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1_000)
  const identity = `${env.APNS_TEAM_ID}:${env.APNS_KEY_ID}`
  if (
    cachedProviderToken?.identity === identity &&
    cachedSigningKey?.pem === env.APNS_KEY_P8 &&
    nowSeconds - cachedProviderToken.createdAtSeconds < TOKEN_REFRESH_SECONDS
  ) {
    return cachedProviderToken.value
  }
  if (pendingProviderToken?.identity === identity && pendingProviderToken.pem === env.APNS_KEY_P8) {
    return pendingProviderToken.value
  }
  const pending = createProviderToken(env, identity, nowSeconds)
  pendingProviderToken = { identity, pem: env.APNS_KEY_P8, value: pending }
  try {
    return await pending
  } finally {
    if (pendingProviderToken?.value === pending) {
      pendingProviderToken = null
    }
  }
}

async function createProviderToken(
  env: Env,
  identity: string,
  nowSeconds: number
): Promise<string> {
  const header = base64Url(JSON.stringify({ alg: 'ES256', kid: env.APNS_KEY_ID }))
  const claims = base64Url(JSON.stringify({ iat: nowSeconds, iss: env.APNS_TEAM_ID }))
  const signingInput = `${header}.${claims}`
  const key = await getSigningKey(env.APNS_KEY_P8)
  const signature = await crypto.subtle.sign(
    { hash: 'SHA-256', name: 'ECDSA' },
    key,
    new TextEncoder().encode(signingInput)
  )
  const value = `${signingInput}.${base64Url(new Uint8Array(signature))}`
  cachedProviderToken = { createdAtSeconds: nowSeconds, identity, value }
  return value
}

async function getSigningKey(pem: string): Promise<CryptoKey> {
  if (cachedSigningKey?.pem === pem) {
    return cachedSigningKey.value
  }
  const value = await crypto.subtle.importKey(
    'pkcs8',
    decodePem(pem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )
  cachedSigningKey = { pem, value }
  return value
}

function decodePem(value: string): ArrayBuffer {
  const encoded = value
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replaceAll(/\s/g, '')
  const binary = atob(encoded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer
}

function base64Url(value: string | Uint8Array): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}
