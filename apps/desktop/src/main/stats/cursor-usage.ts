import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'

import type { RuntimeStatsSupplementalUsage } from '@yiru/runtime-protocol/mobile-runtime-types'
import { session, net } from 'electron'
import SyncDatabase from '~main/sqlite/sync-database'

import { browserSessionRegistry } from '../browser/session-registry'
import {
  boundaryOverlap,
  buildCursorUsage,
  emptyCursorUsage,
  parseCursorUsagePage,
  type CursorUsageEvent,
  type CursorUsagePage
} from './cursor-usage-events'

const CURSOR_BASE_URL = 'https://cursor.com'
const CURSOR_USAGE_PATH = '/api/dashboard/get-filtered-usage-events'
const CURSOR_PAGE_SIZE = 1000
const CURSOR_MAX_PAGES = 200
const CURSOR_CACHE_MS = 5 * 60_000
const CURSOR_AUTH_COOKIE_NAMES = new Set([
  'WorkosCursorSessionToken',
  '__Secure-next-auth.session-token',
  'next-auth.session-token',
  'wos-session',
  '__Secure-wos-session',
  'authjs.session-token',
  '__Secure-authjs.session-token'
])

let cachedUsage: { loadedAt: number; value: RuntimeStatsSupplementalUsage } | null = null
let loadingUsage: Promise<RuntimeStatsSupplementalUsage> | null = null

export function fetchCursorUsageForStats(force = false): Promise<RuntimeStatsSupplementalUsage> {
  if (!force && cachedUsage && Date.now() - cachedUsage.loadedAt < CURSOR_CACHE_MS) {
    return Promise.resolve(cachedUsage.value)
  }
  if (loadingUsage) {
    return loadingUsage
  }
  loadingUsage = loadCursorUsage()
    .then((value) => {
      cachedUsage = { loadedAt: Date.now(), value }
      return value
    })
    .catch((error: unknown) => {
      console.error('[stats] Failed to read Cursor cost usage:', error)
      const value = emptyCursorUsage()
      cachedUsage = { loadedAt: Date.now(), value }
      return value
    })
    .finally(() => {
      loadingUsage = null
    })
  return loadingUsage
}

async function loadCursorUsage(): Promise<RuntimeStatsSupplementalUsage> {
  const cookieHeader = await readCursorCookieHeader()
  if (!cookieHeader) {
    return emptyCursorUsage()
  }
  const events = await fetchAllCursorEvents(cookieHeader)
  return buildCursorUsage(events)
}

async function readCursorCookieHeader(): Promise<string | null> {
  let browserCookieHeader: string | null = null
  try {
    const partition = browserSessionRegistry.resolvePartition(null)
    const cookies = await session.fromPartition(partition).cookies.get({ url: CURSOR_BASE_URL })
    const authCookies = cookies.filter(
      (cookie) =>
        CURSOR_AUTH_COOKIE_NAMES.has(cookie.name) &&
        cookie.value.trim() &&
        typeof cookie.domain === 'string' &&
        isCursorCookieDomain(cookie.domain)
    )
    browserCookieHeader =
      authCookies.length > 0
        ? authCookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
        : null
  } catch {
    // Why: the desktop app stores its Cursor session outside Electron's cookie
    // partition, so a browser-cookie read failure must not hide that fallback.
  }
  return browserCookieHeader ?? readCursorAppCookieHeader()
}

function readCursorAppCookieHeader(): string | null {
  const dbPath = cursorAppAuthDatabasePath()
  if (!existsSync(dbPath)) {
    return null
  }

  let db: SyncDatabase | null = null
  try {
    db = new SyncDatabase(dbPath, { readonly: true, fileMustExist: true })
    db.pragma('query_only = ON')
    const row = recordValue(
      db.prepare('SELECT value FROM ItemTable WHERE key = ? LIMIT 1').get('cursorAuth/accessToken')
    )
    const accessToken = stringValue(row?.value)
    return accessToken ? buildCursorAppCookieHeader(accessToken) : null
  } catch {
    return null
  } finally {
    db?.close()
  }
}

function cursorAppAuthDatabasePath(): string {
  if (process.platform === 'darwin') {
    return join(
      homedir(),
      'Library',
      'Application Support',
      'Cursor',
      'User',
      'globalStorage',
      'state.vscdb'
    )
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA?.trim()
    return join(
      appData || join(homedir(), 'AppData', 'Roaming'),
      'Cursor',
      'User',
      'globalStorage',
      'state.vscdb'
    )
  }
  const configHome = process.env.XDG_CONFIG_HOME?.trim()
  const basePath = configHome && isAbsolute(configHome) ? configHome : join(homedir(), '.config')
  return join(basePath, 'Cursor', 'User', 'globalStorage', 'state.vscdb')
}

function buildCursorAppCookieHeader(accessToken: string): string | null {
  const parts = accessToken.split('.')
  const payloadPart = parts[1]
  if (!payloadPart) {
    return null
  }
  try {
    const normalizedPayload = payloadPart
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(payloadPart.length / 4) * 4, '=')
    const payload = recordValue(
      JSON.parse(Buffer.from(normalizedPayload, 'base64').toString('utf8')) as unknown
    )
    const subject = stringValue(payload?.sub)
    const userId = subject?.split('|').toReversed().find(Boolean)
    const expiresAt = numberValue(payload?.exp)
    if (
      !userId ||
      !/^[A-Za-z0-9._-]+$/.test(userId) ||
      expiresAt === null ||
      expiresAt <= Date.now() / 1000 + 60
    ) {
      return null
    }
    return `WorkosCursorSessionToken=${userId}%3A%3A${accessToken}`
  } catch {
    return null
  }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberValue(value: unknown): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : null
  return parsed !== null && Number.isFinite(parsed) ? parsed : null
}

function isCursorCookieDomain(domain: string): boolean {
  const normalized = domain.toLowerCase().replace(/^\./, '')
  return normalized === 'cursor.com' || normalized.endsWith('.cursor.com')
}

async function fetchAllCursorEvents(cookieHeader: string): Promise<CursorUsageEvent[]> {
  const pages: CursorUsageEvent[][] = []
  let expectedTotal: number | null = null
  let completed = false

  for (let page = 1; page <= CURSOR_MAX_PAGES; page++) {
    const response = await fetchCursorPage(cookieHeader, page)
    if (response.totalUsageEventsCount !== null) {
      if (expectedTotal !== null && expectedTotal !== response.totalUsageEventsCount) {
        throw new Error('Cursor usage pagination count changed during fetch')
      }
      expectedTotal = response.totalUsageEventsCount
    }
    if (response.usageEvents.length === 0) {
      completed = true
      break
    }
    pages.push(response.usageEvents)
    if (response.usageEvents.length < CURSOR_PAGE_SIZE) {
      completed = true
      break
    }
  }

  if (!completed) {
    throw new Error('Cursor usage pagination reached its safety limit')
  }
  const rawEvents = pages.flat()
  if (expectedTotal === null || rawEvents.length === expectedTotal) {
    return rawEvents
  }
  if (rawEvents.length < expectedTotal) {
    throw new Error('Cursor usage pagination returned fewer events than reported')
  }

  let removalsRemaining = rawEvents.length - expectedTotal
  const reconciled = pages[0] ? [...pages[0]] : []
  for (let index = 1; index < pages.length; index++) {
    const page = pages[index] ?? []
    const overlap = boundaryOverlap(pages[index - 1] ?? [], page)
    const removalCount = Math.min(overlap, removalsRemaining)
    reconciled.push(...page.slice(removalCount))
    removalsRemaining -= removalCount
  }
  if (removalsRemaining !== 0 || reconciled.length !== expectedTotal) {
    throw new Error('Cursor usage pagination overlap could not be reconciled')
  }
  return reconciled
}

async function fetchCursorPage(cookieHeader: string, page: number): Promise<CursorUsagePage> {
  const response = await net.fetch(`${CURSOR_BASE_URL}${CURSOR_USAGE_PATH}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
      Origin: CURSOR_BASE_URL,
      Referer: `${CURSOR_BASE_URL}/dashboard?tab=usage`
    },
    body: JSON.stringify({
      page,
      pageSize: CURSOR_PAGE_SIZE,
      startDate: null,
      endDate: null
    }),
    signal: AbortSignal.timeout(30_000)
  })
  if (response.status !== 200) {
    throw new Error(`Cursor usage request failed (${response.status})`)
  }
  return parseCursorUsagePage((await response.json()) as unknown)
}
