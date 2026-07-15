import { extname } from 'node:path'
import type { AiVaultSession } from '../../shared/ai-vault-types'
import type { ExecutionHostId } from '../../shared/execution-host'
import type { IFilesystemProvider } from '../providers/types'
import type { RemoteHostPlatform } from '../ssh/ssh-remote-platform'
import { joinRemotePath } from '../ssh/ssh-remote-platform'
import type {
  AiVaultSessionInventorySlice,
  AiVaultSessionInventorySnapshot
} from './session-inventory-page-types'
import { partitionSubagentTranscriptPaths } from './session-scanner-subagent-transcripts'
import type { FileWithMtime } from './session-scanner-types'
import { remoteClaudeCodexSessionSources } from './remote-session-scanner-sources'
import type {
  RemoteScannerContext,
  RemoteSessionCandidate,
  RemoteSessionSource
} from './remote-session-scanner-types'
import {
  consumeRemoteSessionInventoryCandidate,
  consumeRemoteSessionInventoryEntry,
  createRemoteSessionInventoryBudget,
  remainingRemoteSessionInventoryEntries,
  type RemoteSessionInventoryBudget
} from './remote-session-inventory-budget'
import { SessionFileDiscoveryLimitError } from './session-scanner-discovery'
import {
  isRemotePathMissing,
  parseRemoteInventoryCandidate,
  statRemoteInventoryFile
} from './remote-session-inventory-candidates'

const REMOTE_INVENTORY_CONCURRENCY = 8

export type RemoteAiVaultSessionInventorySnapshot = AiVaultSessionInventorySnapshot & {
  provider: IFilesystemProvider
  targetId: string
  executionHostId: ExecutionHostId
  remoteHome: string
  hostPlatform: RemoteHostPlatform
  candidates: readonly RemoteSessionCandidate[]
  context: RemoteScannerContext
  // Why: batch publication coalesces equal offsets without retaining all remote file reads.
  pageReads: Map<string, Promise<AiVaultSessionInventorySlice>>
}

export async function openRemoteAiVaultSessionInventory(args: {
  provider: IFilesystemProvider
  targetId: string
  executionHostId: ExecutionHostId
  remoteHome: string
  hostPlatform: RemoteHostPlatform
  signal?: AbortSignal
}): Promise<RemoteAiVaultSessionInventorySnapshot> {
  args.signal?.throwIfAborted()
  const context: RemoteScannerContext = {
    provider: args.provider,
    executionHostId: args.executionHostId,
    hostPlatform: args.hostPlatform,
    titleCaches: new Map()
  }
  const budget = createRemoteSessionInventoryBudget()
  const candidates: RemoteSessionCandidate[] = []
  for (const source of remoteClaudeCodexSessionSources(args.remoteHome, args.hostPlatform)) {
    args.signal?.throwIfAborted()
    candidates.push(
      ...(await discoverRemoteInventoryCandidates(source, context, budget, args.signal))
    )
  }
  candidates.sort(compareRemoteInventoryCandidates)

  return {
    provider: args.provider,
    targetId: args.targetId,
    executionHostId: args.executionHostId,
    remoteHome: args.remoteHome,
    hostPlatform: args.hostPlatform,
    candidates,
    context,
    pageReads: new Map(),
    scannedAt: new Date().toISOString()
  }
}

export async function readRemoteAiVaultSessionInventoryPage(
  snapshot: RemoteAiVaultSessionInventorySnapshot,
  offset: number,
  pageSize: number,
  signal: AbortSignal
): Promise<AiVaultSessionInventorySlice> {
  const key = `${offset}:${pageSize}`
  const existing = snapshot.pageReads.get(key)
  if (existing) {
    return await existing
  }
  const read = readRemoteAiVaultSessionInventoryPageUncached(snapshot, offset, pageSize, signal)
  snapshot.pageReads.set(key, read)
  try {
    return await read
  } finally {
    if (snapshot.pageReads.get(key) === read) {
      snapshot.pageReads.delete(key)
    }
  }
}

async function readRemoteAiVaultSessionInventoryPageUncached(
  snapshot: RemoteAiVaultSessionInventorySnapshot,
  offset: number,
  pageSize: number,
  signal: AbortSignal
): Promise<AiVaultSessionInventorySlice> {
  const sessions: AiVaultSession[] = []
  const nextOffset = Math.min(offset + pageSize, snapshot.candidates.length)
  for (let index = offset; index < nextOffset; index += REMOTE_INVENTORY_CONCURRENCY) {
    signal.throwIfAborted()
    const batch = snapshot.candidates.slice(
      index,
      Math.min(index + REMOTE_INVENTORY_CONCURRENCY, nextOffset)
    )
    const parsed = await Promise.all(
      batch.map((candidate) => parseRemoteInventoryCandidate(candidate, snapshot.context, signal))
    )
    signal.throwIfAborted()
    for (const session of parsed) {
      if (session) {
        sessions.push(session)
      }
    }
  }

  return {
    sessions,
    nextOffset,
    complete: nextOffset >= snapshot.candidates.length
  }
}

async function discoverRemoteInventoryCandidates(
  source: RemoteSessionSource,
  context: RemoteScannerContext,
  budget: RemoteSessionInventoryBudget,
  signal?: AbortSignal
): Promise<RemoteSessionCandidate[]> {
  const walked = await walkRemoteInventoryFiles(
    source,
    context.provider,
    context.hostPlatform,
    budget,
    signal
  )
  const partition = source.collectSubagentSiblingCounts
    ? partitionSubagentTranscriptPaths(walked)
    : null
  const paths = partition ? partition.sessionFilePaths : walked
  const files = await mapRemoteInventoryConcurrently(
    paths,
    (path) => statRemoteInventoryFile(context.provider, path, signal),
    signal
  )
  return files
    .filter((file): file is FileWithMtime => file !== null)
    .map((file) => ({
      source,
      file,
      subagentTranscriptCount: partition?.subagentTranscriptCounts.get(file.path) ?? 0
    }))
}

async function walkRemoteInventoryFiles(
  source: RemoteSessionSource,
  provider: IFilesystemProvider,
  hostPlatform: RemoteHostPlatform,
  budget: RemoteSessionInventoryBudget,
  signal?: AbortSignal,
  dirPath = source.rootDir,
  isRoot = true
): Promise<string[]> {
  let entries
  try {
    signal?.throwIfAborted()
    const remainingEntries = remainingRemoteSessionInventoryEntries(budget)
    if (remainingEntries < 0) {
      throw new SessionFileDiscoveryLimitError()
    }
    entries = await provider.readDir(dirPath, {
      limit: remainingEntries + 1,
      signal
    })
    signal?.throwIfAborted()
    if (entries.length > remainingEntries) {
      throw new SessionFileDiscoveryLimitError()
    }
  } catch (error) {
    if (isRoot && isRemotePathMissing(error)) {
      return []
    }
    // Missing nested paths and transport failures invalidate the frozen inventory.
    throw error
  }

  const extensions = new Set(source.extensions)
  const files: string[] = []
  for (const entry of entries) {
    signal?.throwIfAborted()
    const fullPath = joinRemotePath(hostPlatform, dirPath, entry.name)
    consumeRemoteSessionInventoryEntry(fullPath, budget)
    if (entry.isDirectory && !entry.isSymlink) {
      files.push(
        ...(await walkRemoteInventoryFiles(
          source,
          provider,
          hostPlatform,
          budget,
          signal,
          fullPath,
          false
        ))
      )
      continue
    }
    if (
      !entry.isSymlink &&
      extensions.has(extname(entry.name).toLowerCase()) &&
      (source.filePredicate?.(fullPath) ?? true)
    ) {
      consumeRemoteSessionInventoryCandidate(budget)
      files.push(fullPath)
    }
  }
  return files
}

function compareRemoteInventoryCandidates(
  left: RemoteSessionCandidate,
  right: RemoteSessionCandidate
): number {
  return (
    right.file.mtimeMs - left.file.mtimeMs ||
    compareInventoryText(left.source.agent, right.source.agent) ||
    compareInventoryText(left.file.path, right.file.path)
  )
}

function compareInventoryText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

async function mapRemoteInventoryConcurrently<T, U>(
  items: readonly T[],
  mapper: (item: T) => Promise<U>,
  signal?: AbortSignal
): Promise<U[]> {
  const results: U[] = []
  for (let index = 0; index < items.length; index += REMOTE_INVENTORY_CONCURRENCY) {
    signal?.throwIfAborted()
    const batch = items.slice(index, index + REMOTE_INVENTORY_CONCURRENCY)
    results.push(...(await Promise.all(batch.map(mapper))))
    signal?.throwIfAborted()
  }
  return results
}
