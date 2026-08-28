import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import nacl from 'tweetnacl'

import { writeSecureJsonFile } from '../runtime/secure-file'

const KEYPAIR_FILE_NAME = 'mobile-e2ee-keypair.json'
const KEYPAIR_VERSION = 1
const MAX_KEYPAIR_FILE_BYTES = 8 * 1024

type KeypairFile = {
  publicKeyB64: string
  secretKeyB64: string
  version: number
}

export type MobileKeypair = {
  publicKeyB64: string
  secretKey: Uint8Array
}

export function loadOrCreateMobileKeypair(userDataPath: string): MobileKeypair {
  const path = join(userDataPath, KEYPAIR_FILE_NAME)
  const existing = readKeypair(path)
  if (existing) {
    return existing
  }
  const created = nacl.box.keyPair()
  const file: KeypairFile = {
    publicKeyB64: Buffer.from(created.publicKey).toString('base64'),
    secretKeyB64: Buffer.from(created.secretKey).toString('base64'),
    version: KEYPAIR_VERSION
  }
  writeSecureJsonFile(path, file)
  return { publicKeyB64: file.publicKeyB64, secretKey: created.secretKey }
}

function readKeypair(path: string): MobileKeypair | null {
  if (!existsSync(path) || statSync(path).size > MAX_KEYPAIR_FILE_BYTES) {
    return null
  }
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (typeof value !== 'object' || value === null || Reflect.get(value, 'version') !== 1) {
      return null
    }
    const publicKeyB64 = Reflect.get(value, 'publicKeyB64')
    const secretKeyB64 = Reflect.get(value, 'secretKeyB64')
    if (typeof publicKeyB64 !== 'string' || typeof secretKeyB64 !== 'string') {
      return null
    }
    const publicKey = Buffer.from(publicKeyB64, 'base64')
    const secretKey = Buffer.from(secretKeyB64, 'base64')
    return publicKey.length === 32 && secretKey.length === 32
      ? { publicKeyB64, secretKey: Uint8Array.from(secretKey) }
      : null
  } catch {
    return null
  }
}
