import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import nacl from 'tweetnacl'
import { hardenExistingSecureFile, writeSecureJsonFile } from '../../shared/secure-file'

const SPOOL_KEYPAIR_FILENAME = 'yiru-spool-e2ee-keypair.json'
const SPOOL_KEYPAIR_VERSION = 1
const MAX_SPOOL_KEYPAIR_BYTES = 8 * 1024

type SpoolKeypairFile = {
  version: typeof SPOOL_KEYPAIR_VERSION
  publicKeyB64: string
  secretKeyB64: string
}

export type SpoolE2EEKeypair = {
  publicKey: Uint8Array
  secretKey: Uint8Array
  publicKeyB64: string
  fingerprint: string
}

export function loadOrCreateSpoolE2EEKeypair(userDataPath: string): SpoolE2EEKeypair {
  const filePath = join(userDataPath, SPOOL_KEYPAIR_FILENAME)
  if (existsSync(filePath)) {
    try {
      hardenExistingSecureFile(filePath)
      if (statSync(filePath).size > MAX_SPOOL_KEYPAIR_BYTES) {
        throw new Error('Spool E2EE keypair file is too large')
      }
      const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown
      const keypair = projectKeypair(parsed)
      if (keypair) {
        return keypair
      }
    } catch {
      // A malformed or obsolete identity is replaced before Spool ingress starts.
    }
  }

  const generated = nacl.box.keyPair()
  const publicKeyB64 = Buffer.from(generated.publicKey).toString('base64')
  const secretKeyB64 = Buffer.from(generated.secretKey).toString('base64')
  const persisted: SpoolKeypairFile = {
    version: SPOOL_KEYPAIR_VERSION,
    publicKeyB64,
    secretKeyB64
  }
  writeSecureJsonFile(filePath, persisted)
  return toSpoolKeypair(generated.publicKey, generated.secretKey, publicKeyB64)
}

function projectKeypair(value: unknown): SpoolE2EEKeypair | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const record = value as Record<string, unknown>
  if (
    record.version !== SPOOL_KEYPAIR_VERSION ||
    typeof record.publicKeyB64 !== 'string' ||
    typeof record.secretKeyB64 !== 'string'
  ) {
    return null
  }
  const publicKey = Uint8Array.from(Buffer.from(record.publicKeyB64, 'base64'))
  const secretKey = Uint8Array.from(Buffer.from(record.secretKeyB64, 'base64'))
  if (publicKey.length !== 32 || secretKey.length !== 32) {
    return null
  }
  return toSpoolKeypair(publicKey, secretKey, record.publicKeyB64)
}

function toSpoolKeypair(
  publicKey: Uint8Array,
  secretKey: Uint8Array,
  publicKeyB64: string
): SpoolE2EEKeypair {
  return {
    publicKey,
    secretKey,
    publicKeyB64,
    fingerprint: createHash('sha256').update(publicKey).digest('base64url')
  }
}
