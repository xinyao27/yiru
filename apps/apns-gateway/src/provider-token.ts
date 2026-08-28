const TOKEN_REFRESH_SECONDS = 50 * 60

type ProviderToken = {
  createdAtSeconds: number
  identity: string
  value: string
}

let cachedProviderToken: ProviderToken | null = null

export async function getProviderToken(env: Env): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1_000)
  const identity = `${env.APNS_TEAM_ID}:${env.APNS_KEY_ID}`
  if (
    cachedProviderToken?.identity === identity &&
    nowSeconds - cachedProviderToken.createdAtSeconds < TOKEN_REFRESH_SECONDS
  ) {
    return cachedProviderToken.value
  }
  const header = base64Url(JSON.stringify({ alg: 'ES256', kid: env.APNS_KEY_ID }))
  const claims = base64Url(JSON.stringify({ iat: nowSeconds, iss: env.APNS_TEAM_ID }))
  const signingInput = `${header}.${claims}`
  const key = await crypto.subtle.importKey(
    'pkcs8',
    decodePem(env.APNS_KEY_P8),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign(
    { hash: 'SHA-256', name: 'ECDSA' },
    key,
    new TextEncoder().encode(signingInput)
  )
  const value = `${signingInput}.${base64Url(new Uint8Array(signature))}`
  cachedProviderToken = { createdAtSeconds: nowSeconds, identity, value }
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
