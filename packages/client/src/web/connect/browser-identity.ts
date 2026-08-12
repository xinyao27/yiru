import { BrowserSigningKeySchema, type BrowserIdentity } from '@yiru/runtime-protocol/web-connect'

type StoredBrowserIdentity = {
  privateKey: CryptoKey
  publicKey: CryptoKey
  publicIdentity: BrowserIdentity
}

const DATABASE_NAME = 'yiru-web-identity'
const DATABASE_VERSION = 1
const STORE_NAME = 'credentials'
const PRIMARY_IDENTITY_KEY = 'primary'

export async function loadOrCreateBrowserIdentity(): Promise<StoredBrowserIdentity> {
  const database = await openIdentityDatabase()
  const stored = await readStoredIdentity(database)
  if (stored) {
    return stored
  }
  const generated = await createBrowserIdentity()
  await writeStoredIdentity(database, generated)
  return generated
}

export async function signBrowserMessage(
  identity: StoredBrowserIdentity,
  message: string
): Promise<string> {
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    identity.privateKey,
    new TextEncoder().encode(message)
  )
  return bytesToBase64Url(new Uint8Array(signature))
}

async function createBrowserIdentity(): Promise<StoredBrowserIdentity> {
  const generated = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify'
  ])
  const publicJwk = await crypto.subtle.exportKey('jwk', generated.publicKey)
  const privateJwk = await crypto.subtle.exportKey('jwk', generated.privateKey)
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    privateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    publicJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify']
  )
  return {
    privateKey,
    publicKey,
    publicIdentity: {
      signingKey: BrowserSigningKeySchema.parse(publicJwk)
    }
  }
}

function openIdentityDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open browser identity.'))
  })
}

function readStoredIdentity(database: IDBDatabase): Promise<StoredBrowserIdentity | null> {
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME)
      .get(PRIMARY_IDENTITY_KEY)
    request.onsuccess = () =>
      resolve(isStoredBrowserIdentity(request.result) ? request.result : null)
    request.onerror = () => reject(request.error ?? new Error('Could not read browser identity.'))
  })
}

function writeStoredIdentity(
  database: IDBDatabase,
  identity: StoredBrowserIdentity
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(identity, PRIMARY_IDENTITY_KEY)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Could not save browser identity.'))
  })
}

function isStoredBrowserIdentity(value: unknown): value is StoredBrowserIdentity {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<StoredBrowserIdentity>
  return (
    candidate.privateKey instanceof CryptoKey &&
    candidate.publicKey instanceof CryptoKey &&
    BrowserSigningKeySchema.safeParse(candidate.publicIdentity?.signingKey).success &&
    candidate.privateKey.extractable === false
  )
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
