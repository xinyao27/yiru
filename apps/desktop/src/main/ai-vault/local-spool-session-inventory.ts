import { join } from 'node:path'

import type { AiVaultScanIssue, AiVaultSession } from '@yiru/workbench-model/agent'
import { parseWslUncPath } from '@yiru/workbench-model/platform'
import type { ExecutionHostId } from '@yiru/workbench-model/workspace'

import { AiVaultSessionInventoryCursorStore } from './session-inventory-cursor-store'
import type {
  AiVaultSessionInventoryPage,
  AiVaultSessionInventorySlice,
  AiVaultSessionInventorySnapshot
} from './session-inventory-page-types'
import { SessionInventorySnapshotCache } from './session-inventory-snapshot-cache'
import {
  getConfiguredAiVaultAdditionalCodexSessionsDirs,
  getConfiguredAiVaultClaudeProjectsDirs
} from './session-root-configuration'
import { codexHomeForSessionsDir } from './session-scanner-codex-paths'
import { parseAgentSessionFileCached } from './session-scanner-parse-cache'
import {
  claudeProjectsRootDirs,
  codexSessionRootDirs,
  DEFAULT_CODEX_HOME_DIR
} from './session-scanner-source-discovery'
import type { SessionFileCandidate } from './session-scanner-types'
import { resolveAiVaultWslHomeDirsForDistro } from './session-wsl-home-resolution'
import {
  estimateSpoolSessionInventorySnapshotBytes,
  SPOOL_SESSION_INVENTORY_SNAPSHOT_MAX_RETAINED_BYTES,
  SPOOL_SESSION_INVENTORY_SNAPSHOT_OPENING_RESERVATION_BYTES
} from './spool-session-inventory-memory-budget'
import { discoverSpoolSessionInventorySources } from './spool-session-inventory-source-discovery'

const SESSION_PARSE_CONCURRENCY = 8
const INVENTORY_PAGE_SIZE = 64

type LocalSpoolSessionInventorySnapshot = AiVaultSessionInventorySnapshot & {
  candidates: readonly SessionFileCandidate[]
  executionHostId: ExecutionHostId
  // Why: batch publication coalesces equal offsets without retaining all parsed rows.
  pageReads: Map<string, Promise<AiVaultSessionInventorySlice>>
}

export type LocalSpoolSessionInventoryPageArgs = {
  bindingKey: string
  cursor: string | null
  executionHostId: ExecutionHostId
  inventoryScope: string
  worktreePath: string
  localWslDistro: string | null
  signal?: AbortSignal
}

// Why: paired-runtime pages carry resume commands and locator metadata; a
// smaller internal page keeps each encrypted RPC response comfortably bounded.
const cursorStore = new AiVaultSessionInventoryCursorStore<LocalSpoolSessionInventorySnapshot>({
  pageSize: INVENTORY_PAGE_SIZE
})
const snapshotCache = new SessionInventorySnapshotCache<LocalSpoolSessionInventorySnapshot>({
  maxRetainedBytes: SPOOL_SESSION_INVENTORY_SNAPSHOT_MAX_RETAINED_BYTES,
  openingReservationBytes: SPOOL_SESSION_INVENTORY_SNAPSHOT_OPENING_RESERVATION_BYTES,
  measureSnapshotBytes: (snapshot) =>
    estimateSpoolSessionInventorySnapshotBytes(snapshot.candidates)
})

export async function listLocalSpoolSessionInventoryPage(
  args: LocalSpoolSessionInventoryPageArgs
): Promise<AiVaultSessionInventoryPage> {
  return await cursorStore.readPage({
    bindingKey: localInventoryBindingKey(args),
    cursor: args.cursor,
    signal: args.signal,
    openSnapshot: async (signal) =>
      await snapshotCache.resolve(
        localSnapshotKey(args),
        async (openingSignal) => await openLocalInventorySnapshot(args, openingSignal),
        signal
      ),
    readSnapshotPage: readLocalInventoryPage,
    releaseSnapshot: (snapshot) => snapshotCache.release(snapshot)
  })
}

export function releaseLocalSpoolSessionInventoryPage(
  args: LocalSpoolSessionInventoryPageArgs
): void {
  cursorStore.release(localInventoryBindingKey(args), args.cursor)
}

async function openLocalInventorySnapshot(
  args: LocalSpoolSessionInventoryPageArgs,
  signal: AbortSignal
): Promise<LocalSpoolSessionInventorySnapshot> {
  signal.throwIfAborted()
  const issues: AiVaultScanIssue[] = []
  const roots = await resolveLocalInventoryRoots(args, signal)
  const discoveries = await discoverSpoolSessionInventorySources({
    options: {
      additionalCodexSessionsDirs: roots.additionalCodexSessionsDirs,
      wslHomeDirs: roots.wslHomeDirs
    },
    issues,
    claudeProjectsDirs: roots.claudeProjectsDirs,
    codexSessionDirs: roots.codexSessionDirs,
    signal
  })
  signal.throwIfAborted()
  const candidates = discoveries
    .flatMap((discovery) =>
      discovery.files.map(
        (file): SessionFileCandidate => ({
          agent: discovery.agent,
          file,
          codexHome:
            discovery.agent === 'codex'
              ? codexHomeForSessionsDir(discovery.rootDir, DEFAULT_CODEX_HOME_DIR)
              : null
        })
      )
    )
    .sort(compareCandidates)

  return {
    candidates,
    executionHostId: args.executionHostId,
    pageReads: new Map(),
    scannedAt: new Date().toISOString()
  }
}

async function readLocalInventoryPage(
  snapshot: LocalSpoolSessionInventorySnapshot,
  offset: number,
  pageSize: number,
  signal: AbortSignal
): Promise<AiVaultSessionInventorySlice> {
  const key = `${offset}:${pageSize}`
  const existing = snapshot.pageReads.get(key)
  if (existing) {
    return await existing
  }
  const read = readLocalInventoryPageUncached(snapshot, offset, pageSize, signal)
  snapshot.pageReads.set(key, read)
  try {
    return await read
  } finally {
    if (snapshot.pageReads.get(key) === read) {
      snapshot.pageReads.delete(key)
    }
  }
}

async function readLocalInventoryPageUncached(
  snapshot: LocalSpoolSessionInventorySnapshot,
  offset: number,
  pageSize: number,
  signal: AbortSignal
): Promise<AiVaultSessionInventorySlice> {
  const sessions: AiVaultSession[] = []
  const nextOffset = Math.min(offset + pageSize, snapshot.candidates.length)
  for (let index = offset; index < nextOffset; index += SESSION_PARSE_CONCURRENCY) {
    signal.throwIfAborted()
    const batch = snapshot.candidates.slice(
      index,
      Math.min(index + SESSION_PARSE_CONCURRENCY, nextOffset)
    )
    signal.throwIfAborted()
    const parsed = await Promise.all(
      batch.map(
        async (candidate) =>
          await parseInventoryCandidate(candidate, snapshot.executionHostId, signal)
      )
    )
    signal.throwIfAborted()
    for (const session of parsed) {
      if (session) {
        sessions.push(session)
      }
    }
  }

  signal.throwIfAborted()
  return {
    sessions,
    nextOffset,
    complete: nextOffset >= snapshot.candidates.length
  }
}

async function parseInventoryCandidate(
  candidate: SessionFileCandidate,
  executionHostId: ExecutionHostId,
  signal: AbortSignal
): Promise<AiVaultSession | null> {
  try {
    const session = await parseAgentSessionFileCached(
      candidate,
      process.platform,
      undefined,
      signal
    )
    if (!session) {
      return null
    }
    return {
      ...session,
      executionHostId,
      id: `${executionHostId}:${session.agent}:${session.sessionId}:${session.filePath}`
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code
    if (code === 'ENOENT') {
      return null
    }
    // Why: parsers already represent malformed transcripts as null; unexpected
    // failures must not turn a partial inventory into an authoritative end-of-list.
    throw error
  }
}

function compareCandidates(left: SessionFileCandidate, right: SessionFileCandidate): number {
  const byMtime = right.file.mtimeMs - left.file.mtimeMs
  if (byMtime !== 0) {
    return byMtime
  }
  const byAgent = compareText(left.agent, right.agent)
  return byAgent !== 0 ? byAgent : compareText(left.file.path, right.file.path)
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function localInventoryBindingKey(args: LocalSpoolSessionInventoryPageArgs): string {
  return JSON.stringify([args.bindingKey, args.executionHostId])
}

function localSnapshotKey(args: LocalSpoolSessionInventoryPageArgs): string {
  return JSON.stringify([args.inventoryScope, args.executionHostId, localInventoryRuntime(args)])
}

async function resolveLocalInventoryRoots(
  args: LocalSpoolSessionInventoryPageArgs,
  signal: AbortSignal
) {
  const runtime = localInventoryRuntime(args)
  if (runtime.kind === 'wsl') {
    const wslHomeDirs = await resolveAiVaultWslHomeDirsForDistro(runtime.distro)
    signal.throwIfAborted()
    const claudeProjectsDirs =
      (await getConfiguredAiVaultClaudeProjectsDirs({
        runtime: 'wsl',
        wslDistro: runtime.distro
      })) ?? wslHomeDirs.map((home) => join(home, '.claude', 'projects'))
    signal.throwIfAborted()
    const primaryHome = wslHomeDirs[0]
    if (!primaryHome) {
      throw new Error('AI Vault WSL home is unavailable')
    }
    return {
      wslHomeDirs,
      claudeProjectsDirs,
      codexSessionDirs: codexSessionRootDirs(
        { codexSessionsDir: join(primaryHome, '.codex', 'sessions') },
        wslHomeDirs
      ),
      additionalCodexSessionsDirs: []
    }
  }
  const additionalCodexSessionsDirs = getConfiguredAiVaultAdditionalCodexSessionsDirs()
  signal.throwIfAborted()
  const claudeProjectsDirs =
    (await getConfiguredAiVaultClaudeProjectsDirs({ runtime: 'host' })) ??
    claudeProjectsRootDirs({})
  signal.throwIfAborted()
  return {
    wslHomeDirs: [],
    claudeProjectsDirs,
    codexSessionDirs: codexSessionRootDirs({ additionalCodexSessionsDirs }, []),
    additionalCodexSessionsDirs
  }
}

function localInventoryRuntime(
  args: LocalSpoolSessionInventoryPageArgs
): { kind: 'host' } | { kind: 'wsl'; distro: string } {
  const pathDistro = parseWslUncPath(args.worktreePath)?.distro ?? null
  const configuredDistro = args.localWslDistro?.trim() || null
  if (
    pathDistro &&
    configuredDistro &&
    pathDistro.toLowerCase() !== configuredDistro.toLowerCase()
  ) {
    throw new Error('AI Vault WSL target is inconsistent')
  }
  const distro = pathDistro ?? configuredDistro
  return distro ? { kind: 'wsl', distro } : { kind: 'host' }
}
