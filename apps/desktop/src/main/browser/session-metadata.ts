import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'

import type { BrowserSessionProfile, BrowserSessionProfileSource } from '~shared/types'

import { getRuntimeHostPathsProvider } from '../runtime/host/paths-provider'
import { resolveChromiumCookiesPath } from './chromium-cookie-path'

export type BrowserSessionMeta = {
  defaultSource: BrowserSessionProfile['source']
  userAgent: string | null
  userAgentByPartition: Record<string, string>
  pendingCookieDbPath: string | null
  pendingCookieImports: Record<string, string>
  profiles: unknown[]
}

const BROWSER_SESSION_META_FILE_NAME = 'browser-session-meta.json'
const BROWSER_FAMILIES = new Set<string>([
  'chrome',
  'chromium',
  'arc',
  'edge',
  'firefox',
  'safari',
  'comet',
  'helium',
  'manual'
])

function isBrowserFamily(value: string): value is BrowserSessionProfileSource['browserFamily'] {
  return BROWSER_FAMILIES.has(value)
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null
}

function readStringRecord(value: unknown): Record<string, string> {
  const record = toRecord(value)
  if (!record) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, string] => {
      return typeof entry[1] === 'string'
    })
  )
}

export function parseBrowserSessionSource(value: unknown): BrowserSessionProfileSource | null {
  const source = toRecord(value)
  if (
    !source ||
    typeof source.browserFamily !== 'string' ||
    !isBrowserFamily(source.browserFamily) ||
    typeof source.importedAt !== 'number' ||
    (source.profileName !== undefined && typeof source.profileName !== 'string')
  ) {
    return null
  }
  return {
    browserFamily: source.browserFamily,
    importedAt: source.importedAt,
    ...(source.profileName === undefined ? {} : { profileName: source.profileName })
  }
}

export class BrowserSessionMetadata {
  private defaultPartition: string
  private metadataPathOverride: string | null = null

  constructor(defaultPartition: string) {
    this.defaultPartition = defaultPartition
  }

  configure(profileDirectory: string, defaultPartition: string): void {
    this.metadataPathOverride = join(profileDirectory, BROWSER_SESSION_META_FILE_NAME)
    this.defaultPartition = defaultPartition
  }

  load(): BrowserSessionMeta {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.metadataPath, 'utf-8'))
      const data = toRecord(parsed)
      if (!data) {
        return this.emptyMeta()
      }
      const legacyUserAgent = typeof data.userAgent === 'string' ? data.userAgent : null
      const userAgentByPartition = readStringRecord(data.userAgentByPartition)
      if (legacyUserAgent && !userAgentByPartition[this.defaultPartition]) {
        userAgentByPartition[this.defaultPartition] = legacyUserAgent
      }
      const legacyPendingCookieDbPath =
        typeof data.pendingCookieDbPath === 'string' ? data.pendingCookieDbPath : null
      const pendingCookieImports = readStringRecord(data.pendingCookieImports)
      if (legacyPendingCookieDbPath && !pendingCookieImports[this.defaultPartition]) {
        pendingCookieImports[this.defaultPartition] = legacyPendingCookieDbPath
      }
      return {
        defaultSource: parseBrowserSessionSource(data.defaultSource),
        userAgent: legacyUserAgent,
        userAgentByPartition,
        pendingCookieDbPath: legacyPendingCookieDbPath,
        pendingCookieImports,
        profiles: Array.isArray(data.profiles) ? data.profiles : []
      }
    } catch {
      return this.emptyMeta()
    }
  }

  persist(updates: Partial<BrowserSessionMeta>): void {
    try {
      const temporaryPath = `${this.metadataPath}.tmp`
      mkdirSync(dirname(this.metadataPath), { recursive: true })
      writeFileSync(temporaryPath, JSON.stringify({ ...this.load(), ...updates }))
      renameSync(temporaryPath, this.metadataPath)
    } catch {
      // Why: profile metadata is recoverable from the browser partitions; a
      // failed best-effort write must not block app startup.
    }
  }

  replayPendingCookieImports(knownPartitions: ReadonlySet<string>): void {
    const meta = this.load()
    const remainingEntries = { ...meta.pendingCookieImports }
    for (const [partition, stagedPath] of Object.entries(meta.pendingCookieImports)) {
      if (!knownPartitions.has(partition) || !existsSync(stagedPath)) {
        delete remainingEntries[partition]
        continue
      }
      try {
        const liveCookiesPath = this.partitionCookiesPath(partition)
        mkdirSync(dirname(liveCookiesPath), { recursive: true })
        copyFileSync(stagedPath, liveCookiesPath)
        let sidecarCopyFailed = false
        for (const suffix of ['-wal', '-shm']) {
          try {
            unlinkSync(liveCookiesPath + suffix)
          } catch {
            // The previous database may not have a sidecar.
          }
          const stagingSidecar = stagedPath + suffix
          if (!existsSync(stagingSidecar)) {
            continue
          }
          try {
            copyFileSync(stagingSidecar, liveCookiesPath + suffix)
          } catch {
            sidecarCopyFailed = true
          }
        }
        if (sidecarCopyFailed) {
          continue
        }
        for (const suffix of ['', '-wal', '-shm']) {
          try {
            unlinkSync(stagedPath + suffix)
          } catch {
            // Cookie replay succeeded; cleanup is best-effort.
          }
        }
        delete remainingEntries[partition]
      } catch {
        // Why: retain a failed entry for the next cold start without holding
        // back unrelated partitions that can be replayed safely.
      }
    }
    this.persist({
      pendingCookieImports: remainingEntries,
      pendingCookieDbPath: remainingEntries[this.defaultPartition] ?? null
    })
  }

  private get metadataPath(): string {
    return (
      this.metadataPathOverride ??
      join(getRuntimeHostPathsProvider().userDataPath(), BROWSER_SESSION_META_FILE_NAME)
    )
  }

  private partitionCookiesPath(partition: string): string {
    const partitionName = partition.replace('persist:', '')
    const partitionDirectory = join(
      getRuntimeHostPathsProvider().userDataPath(),
      'Partitions',
      partitionName
    )
    return resolveChromiumCookiesPath(partitionDirectory) ?? join(partitionDirectory, 'Cookies')
  }

  private emptyMeta(): BrowserSessionMeta {
    return {
      defaultSource: null,
      userAgent: null,
      userAgentByPartition: {},
      pendingCookieDbPath: null,
      pendingCookieImports: {},
      profiles: []
    }
  }
}
