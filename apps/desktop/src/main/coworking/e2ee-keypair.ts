import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import nacl from 'tweetnacl'
import { hardenExistingSecureFile, writeSecureJsonFile } from '~shared/secure-file'

const COWORKING_KEYPAIR_FILENAME = 'yiru-coworking-e2ee-keypair.json'
const COWORKING_KEYPAIR_VERSION = 1
const MAX_COWORKING_KEYPAIR_BYTES = 8 * 1024

type CoworkingKeypairFile = {
  version: typeof COWORKING_KEYPAIR_VERSION
  publicKeyB64: string
  secretKeyB64: string
}

export type CoworkingE2EEKeypair = {
  publicKey: Uint8Array
  secretKey: Uint8Array
  publicKeyB64: string
  fingerprint: string
}

export function loadOrCreateCoworkingE2EEKeypair(userDataPath: string): CoworkingE2EEKeypair {
  const filePath = join(userDataPath, COWORKING_KEYPAIR_FILENAME)
  if (existsSync(filePath)) {
    try {
      hardenExistingSecureFile(filePath)
      if (statSync(filePath).size > MAX_COWORKING_KEYPAIR_BYTES) {
        throw new Error('Coworking E2EE keypair file is too large')
      }
      const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown
      const keypair = projectKeypair(parsed)
      if (keypair) {
        return keypair
      }
    } catch {
      // A malformed or obsolete identity is replaced before Coworking ingress starts.
    }
  }

  const generated = nacl.box.keyPair()
  const publicKeyB64 = Buffer.from(generated.publicKey).toString('base64')
  const secretKeyB64 = Buffer.from(generated.secretKey).toString('base64')
  const persisted: CoworkingKeypairFile = {
    version: COWORKING_KEYPAIR_VERSION,
    publicKeyB64,
    secretKeyB64
  }
  writeSecureJsonFile(filePath, persisted)
  return toCoworkingKeypair(generated.publicKey, generated.secretKey, publicKeyB64)
}

function projectKeypair(value: unknown): CoworkingE2EEKeypair | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const record = value as Record<string, unknown>
  if (
    record.version !== COWORKING_KEYPAIR_VERSION ||
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
  return toCoworkingKeypair(publicKey, secretKey, record.publicKeyB64)
}

function toCoworkingKeypair(
  publicKey: Uint8Array,
  secretKey: Uint8Array,
  publicKeyB64: string
): CoworkingE2EEKeypair {
  return {
    publicKey,
    secretKey,
    publicKeyB64,
    fingerprint: createHash('sha256').update(publicKey).digest('base64url')
  }
}
