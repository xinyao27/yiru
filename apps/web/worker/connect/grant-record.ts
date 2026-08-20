import {
  BrowserIdentitySchema,
  MachineSigningKeySchema,
  type BrowserIdentity,
  type MachineSigningKey
} from '@yiru/runtime-protocol/web-connect'

export type PendingMachine = {
  id: string
  name: string
  signingKey: MachineSigningKey
  challenge: string
  verificationCode: string
}

export type ConnectGrantRecord = {
  browser: BrowserIdentity
  secretHash: string
  expiresAt: number
  usedBrowserNonces: Record<string, number>
  pendingMachine: PendingMachine | null
  pairedAt: number | null
}

export type CreateGrantRecord = Pick<ConnectGrantRecord, 'browser' | 'secretHash' | 'expiresAt'>

export function readCreateGrantRecord(value: unknown): CreateGrantRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const browser = BrowserIdentitySchema.safeParse(Reflect.get(value, 'browser'))
  const secretHash = Reflect.get(value, 'secretHash')
  const expiresAt = Reflect.get(value, 'expiresAt')
  return browser.success && typeof secretHash === 'string' && typeof expiresAt === 'number'
    ? { browser: browser.data, secretHash, expiresAt }
    : null
}

export function readStoredGrant(value: unknown): ConnectGrantRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const browser = BrowserIdentitySchema.safeParse(Reflect.get(value, 'browser'))
  const secretHash = Reflect.get(value, 'secretHash')
  const expiresAt = Reflect.get(value, 'expiresAt')
  const pendingMachine = readPendingMachine(Reflect.get(value, 'pendingMachine'))
  const pairedAt = Reflect.get(value, 'pairedAt')
  const usedBrowserNonces = readNumberRecord(Reflect.get(value, 'usedBrowserNonces'))
  if (
    !browser.success ||
    typeof secretHash !== 'string' ||
    typeof expiresAt !== 'number' ||
    pendingMachine === undefined ||
    (pairedAt !== null && typeof pairedAt !== 'number') ||
    !usedBrowserNonces
  ) {
    return null
  }
  return {
    browser: browser.data,
    secretHash,
    expiresAt,
    pendingMachine,
    pairedAt,
    usedBrowserNonces
  }
}

function readPendingMachine(value: unknown): PendingMachine | null | undefined {
  if (value === null) {
    return null
  }
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const id = Reflect.get(value, 'id')
  const name = Reflect.get(value, 'name')
  const signingKey = MachineSigningKeySchema.safeParse(Reflect.get(value, 'signingKey'))
  const challenge = Reflect.get(value, 'challenge')
  const verificationCode = Reflect.get(value, 'verificationCode')
  return typeof id === 'string' &&
    typeof name === 'string' &&
    signingKey.success &&
    typeof challenge === 'string' &&
    typeof verificationCode === 'string'
    ? { id, name, signingKey: signingKey.data, challenge, verificationCode }
    : undefined
}

function readNumberRecord(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const entries = Object.entries(value)
  return entries.every((entry) => typeof entry[1] === 'number') ? Object.fromEntries(entries) : null
}
