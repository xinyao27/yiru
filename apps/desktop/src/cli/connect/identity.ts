import { createHash, createPrivateKey, generateKeyPairSync, type webcrypto } from 'node:crypto'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import {
  BrowserIdentitySchema,
  MachineSigningKeySchema,
  type BrowserIdentity,
  type MachineSigningKey
} from '@yiru/runtime-protocol/web-connect'
import { hardenExistingSecureFile, writeSecureJsonFile } from '~shared/secure-file'

import { getDefaultUserDataPath } from '../runtime-client'

export type MachineIdentity = {
  publicKey: MachineSigningKey
  privateKey: ReturnType<typeof createPrivateKey>
}

export type PairedBrowserAccess = {
  machineId: string
  browser: BrowserIdentity
  pairedAt: number
  usedRelayNonces: string[]
}

type StoredMachineIdentity = {
  version: 1
  publicKey: MachineSigningKey
  privateKey: webcrypto.JsonWebKey
}

type StoredBrowserAccess = {
  version: 1
  entries: PairedBrowserAccess[]
}

const CONNECT_DIRECTORY = 'web-connect'
const IDENTITY_FILENAME = 'machine-identity.json'
const ACCESS_FILENAME = 'browser-access.json'

export function loadOrCreateMachineIdentity(): MachineIdentity {
  const path = connectFilePath(IDENTITY_FILENAME)
  const stored = readStoredMachineIdentity(path)
  if (stored) {
    return {
      publicKey: stored.publicKey,
      privateKey: createPrivateKey({ key: stored.privateKey, format: 'jwk' })
    }
  }
  const generated = generateKeyPairSync('ed25519')
  const publicKey = MachineSigningKeySchema.parse(generated.publicKey.export({ format: 'jwk' }))
  const privateKey = generated.privateKey.export({ format: 'jwk' })
  writeSecureJsonFile(path, { version: 1, publicKey, privateKey } satisfies StoredMachineIdentity)
  return { publicKey, privateKey: generated.privateKey }
}

export function savePairedBrowserAccess(entry: PairedBrowserAccess): void {
  const path = connectFilePath(ACCESS_FILENAME)
  const stored = readStoredBrowserAccess(path)
  const entries = [
    entry,
    ...stored.entries.filter(
      (candidate) =>
        candidate.browser.signingKey.x !== entry.browser.signingKey.x ||
        candidate.browser.signingKey.y !== entry.browser.signingKey.y
    )
  ]
  writeSecureJsonFile(path, { version: 1, entries } satisfies StoredBrowserAccess)
}

export function consumeBrowserRelayNonce(args: {
  machineId: string
  browser: BrowserIdentity
  nonce: string
}): boolean {
  const path = connectFilePath(ACCESS_FILENAME)
  const stored = readStoredBrowserAccess(path)
  const entry = stored.entries.find(
    (candidate) =>
      candidate.machineId === args.machineId &&
      candidate.browser.signingKey.x === args.browser.signingKey.x &&
      candidate.browser.signingKey.y === args.browser.signingKey.y
  )
  if (!entry || entry.usedRelayNonces.includes(args.nonce)) {
    return false
  }
  entry.usedRelayNonces = [args.nonce, ...entry.usedRelayNonces].slice(0, 128)
  writeSecureJsonFile(path, stored)
  return true
}

export function listPairedBrowserAccess(): PairedBrowserAccess[] {
  return readStoredBrowserAccess(connectFilePath(ACCESS_FILENAME)).entries
}

export function browserAccessId(browser: BrowserIdentity): string {
  return createHash('sha256')
    .update(`${browser.signingKey.x}.${browser.signingKey.y}`)
    .digest('base64url')
}

export function removePairedBrowserAccess(browserId: string): void {
  const path = connectFilePath(ACCESS_FILENAME)
  const stored = readStoredBrowserAccess(path)
  const entries = stored.entries.filter((entry) => browserAccessId(entry.browser) !== browserId)
  writeSecureJsonFile(path, { version: 1, entries } satisfies StoredBrowserAccess)
}

export function forgetConnectIdentity(): void {
  rmSync(connectFilePath(ACCESS_FILENAME), { force: true })
  rmSync(connectFilePath(IDENTITY_FILENAME), { force: true })
}

function connectFilePath(filename: string): string {
  return join(getDefaultUserDataPath(), CONNECT_DIRECTORY, filename)
}

function readStoredMachineIdentity(path: string): StoredMachineIdentity | null {
  if (!existsSync(path)) {
    return null
  }
  hardenExistingSecureFile(path)
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!value || typeof value !== 'object' || Reflect.get(value, 'version') !== 1) {
      return null
    }
    const publicKey = MachineSigningKeySchema.safeParse(Reflect.get(value, 'publicKey'))
    const privateKey = Reflect.get(value, 'privateKey')
    if (!publicKey.success || !privateKey || typeof privateKey !== 'object') {
      return null
    }
    return { version: 1, publicKey: publicKey.data, privateKey }
  } catch {
    return null
  }
}

function readStoredBrowserAccess(path: string): StoredBrowserAccess {
  if (!existsSync(path)) {
    return { version: 1, entries: [] }
  }
  hardenExistingSecureFile(path)
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
    const rawEntries = value && typeof value === 'object' ? Reflect.get(value, 'entries') : null
    if (!Array.isArray(rawEntries)) {
      return { version: 1, entries: [] }
    }
    const entries = rawEntries.flatMap((entry): PairedBrowserAccess[] => {
      if (!entry || typeof entry !== 'object') {
        return []
      }
      const machineId = Reflect.get(entry, 'machineId')
      const pairedAt = Reflect.get(entry, 'pairedAt')
      const browser = BrowserIdentitySchema.safeParse(Reflect.get(entry, 'browser'))
      const rawNonces = Reflect.get(entry, 'usedRelayNonces')
      const usedRelayNonces = Array.isArray(rawNonces)
        ? rawNonces.filter((nonce): nonce is string => typeof nonce === 'string').slice(0, 128)
        : []
      return typeof machineId === 'string' && typeof pairedAt === 'number' && browser.success
        ? [{ machineId, pairedAt, browser: browser.data, usedRelayNonces }]
        : []
    })
    return { version: 1, entries }
  } catch {
    return { version: 1, entries: [] }
  }
}
