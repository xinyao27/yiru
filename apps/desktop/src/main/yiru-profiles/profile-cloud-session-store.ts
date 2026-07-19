import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { safeStorage } from 'electron'

import { writeSecureJsonFile } from '../../shared/secure-file'
import type {
  YiruCloudCapabilities,
  YiruCloudOrgSummary,
  YiruCloudSessionPersistence
} from '../../shared/yiru-profiles'
import { allowsPlaintextYiruCloudSession } from './profile-cloud-auth-config'
import type { YiruCloudSessionExchangeResponse } from './profile-cloud-session-exchange'
import {
  cloudSessionIdentity,
  isCloudSessionMutationCurrent,
  recordSuccessfulCloudSessionLogin,
  type CloudSessionMutationSnapshot
} from './profile-cloud-session-mutation'
import { getYiruProfileDirectory } from './profile-storage-paths'

export type YiruCloudSession = {
  accessToken: string
  refreshToken: string
  expiresAt: number
  capabilities: YiruCloudCapabilities
  organizations?: YiruCloudOrgSummary[]
}

export type YiruCloudSessionReadResult =
  | { status: 'found'; session: YiruCloudSession; persistence: YiruCloudSessionPersistence }
  | { status: 'missing'; persistence: 'none' }
  | { status: 'decrypt-failed'; persistence: 'none'; error: string }

type PersistedEncryptedSession = {
  version: 1
  format: 'electron-safe-storage-v1'
  savedAt: number
  ciphertext: string
}

type PersistedPlaintextSession = {
  version: 1
  format: 'dev-plaintext-v1'
  savedAt: number
  session: YiruCloudSession
}

type CachedYiruCloudSession = {
  session: YiruCloudSession
  persistence: Exclude<YiruCloudSessionPersistence, 'none'>
}

const memorySessions = new Map<string, CachedYiruCloudSession>()

function sessionCacheKey(profileId: string, userDataPath: string): string {
  return `${userDataPath}\0${profileId}`
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isYiruCloudSession(value: unknown): value is YiruCloudSession {
  if (!isObject(value) || !isObject(value.capabilities) || !isObject(value.capabilities.flags)) {
    return false
  }
  if (value.organizations !== undefined && !isYiruCloudOrganizations(value.organizations)) {
    return false
  }
  return (
    typeof value.accessToken === 'string' &&
    value.accessToken.length > 0 &&
    typeof value.refreshToken === 'string' &&
    value.refreshToken.length > 0 &&
    typeof value.expiresAt === 'number' &&
    Number.isFinite(value.expiresAt) &&
    typeof value.capabilities.refreshedAt === 'number' &&
    Number.isFinite(value.capabilities.refreshedAt)
  )
}

function isYiruCloudOrganizations(value: unknown): value is YiruCloudOrgSummary[] {
  if (!Array.isArray(value)) {
    return false
  }
  return value.every((organization) => {
    if (!isObject(organization)) {
      return false
    }
    return (
      typeof organization.orgId === 'string' &&
      organization.orgId.length > 0 &&
      typeof organization.name === 'string' &&
      organization.name.length > 0 &&
      (organization.role === undefined || typeof organization.role === 'string')
    )
  })
}

export function getYiruCloudSessionPath(profileId: string, userDataPath: string): string {
  return join(getYiruProfileDirectory(profileId, userDataPath), 'account-session.json.enc')
}

export function saveYiruCloudSession(
  profileId: string,
  userDataPath: string,
  session: YiruCloudSession
): YiruCloudSessionPersistence {
  const cacheKey = sessionCacheKey(profileId, userDataPath)
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted: PersistedEncryptedSession = {
      version: 1,
      format: 'electron-safe-storage-v1',
      savedAt: Date.now(),
      ciphertext: safeStorage.encryptString(JSON.stringify(session)).toString('base64')
    }
    writeSecureJsonFile(getYiruCloudSessionPath(profileId, userDataPath), encrypted)
    memorySessions.set(cacheKey, { session, persistence: 'encrypted' })
    return 'encrypted'
  }

  if (allowsPlaintextYiruCloudSession()) {
    const plaintext: PersistedPlaintextSession = {
      version: 1,
      format: 'dev-plaintext-v1',
      savedAt: Date.now(),
      session
    }
    writeSecureJsonFile(getYiruCloudSessionPath(profileId, userDataPath), plaintext)
    memorySessions.set(cacheKey, { session, persistence: 'dev-plaintext' })
    return 'dev-plaintext'
  }

  // Why: Yiru account refresh tokens must not silently fall back to plaintext
  // in production. Memory-only keeps cloud features usable until restart.
  memorySessions.set(cacheKey, { session, persistence: 'memory-only' })
  return 'memory-only'
}

export function saveYiruCloudSessionExchange(
  profileId: string,
  userDataPath: string,
  exchange: YiruCloudSessionExchangeResponse
): YiruCloudSessionPersistence {
  recordSuccessfulCloudSessionLogin(cloudSessionIdentity(profileId, exchange.cloud), userDataPath)
  return saveYiruCloudSession(profileId, userDataPath, {
    accessToken: exchange.accessToken,
    refreshToken: exchange.refreshToken,
    expiresAt: exchange.expiresAt,
    organizations: exchange.organizations,
    capabilities: exchange.capabilities
  })
}

export function saveYiruCloudSessionIfCurrent(
  profileId: string,
  userDataPath: string,
  session: YiruCloudSession,
  snapshot: CloudSessionMutationSnapshot
): YiruCloudSessionPersistence | null {
  // Why: the check and sync save share one main-process turn, so an async
  // refresh captured before sign-out/org-switch cannot resurrect the session.
  if (!isCloudSessionMutationCurrent(profileId, userDataPath, snapshot)) {
    return null
  }
  return saveYiruCloudSession(profileId, userDataPath, session)
}

export function readYiruCloudSession(
  profileId: string,
  userDataPath: string
): YiruCloudSessionReadResult {
  const cacheKey = sessionCacheKey(profileId, userDataPath)
  const memorySession = memorySessions.get(cacheKey)
  if (memorySession) {
    return {
      status: 'found',
      session: memorySession.session,
      persistence: memorySession.persistence
    }
  }

  const path = getYiruCloudSessionPath(profileId, userDataPath)
  if (!existsSync(path)) {
    return { status: 'missing', persistence: 'none' }
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as
      | PersistedEncryptedSession
      | PersistedPlaintextSession
    if (parsed.version !== 1) {
      return { status: 'decrypt-failed', persistence: 'none', error: 'Unsupported session format.' }
    }
    if (parsed.format === 'electron-safe-storage-v1') {
      if (!safeStorage.isEncryptionAvailable()) {
        return {
          status: 'decrypt-failed',
          persistence: 'none',
          error: 'OS-backed encryption is unavailable.'
        }
      }
      const decrypted = safeStorage.decryptString(Buffer.from(parsed.ciphertext, 'base64'))
      const session = JSON.parse(decrypted) as YiruCloudSession
      if (!isYiruCloudSession(session)) {
        return { status: 'decrypt-failed', persistence: 'none', error: 'Invalid saved session.' }
      }
      memorySessions.set(cacheKey, { session, persistence: 'encrypted' })
      return { status: 'found', session, persistence: 'encrypted' }
    }
    if (parsed.format === 'dev-plaintext-v1' && allowsPlaintextYiruCloudSession()) {
      if (!isYiruCloudSession(parsed.session)) {
        return { status: 'decrypt-failed', persistence: 'none', error: 'Invalid saved session.' }
      }
      memorySessions.set(cacheKey, { session: parsed.session, persistence: 'dev-plaintext' })
      return { status: 'found', session: parsed.session, persistence: 'dev-plaintext' }
    }
    return { status: 'decrypt-failed', persistence: 'none', error: 'Unsafe session format.' }
  } catch {
    return {
      status: 'decrypt-failed',
      persistence: 'none',
      error: 'Could not decrypt saved Yiru account session.'
    }
  }
}

export function clearYiruCloudSession(profileId: string, userDataPath: string): void {
  memorySessions.delete(sessionCacheKey(profileId, userDataPath))
  rmSync(getYiruCloudSessionPath(profileId, userDataPath), { force: true })
}
