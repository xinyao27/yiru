import type { AiVaultSession } from '@yiru/workbench-model/agent'

import type { FileReadResult, FileStat, IFilesystemProvider } from '../providers/types'
import type { RemoteScannerContext, RemoteSessionCandidate } from './remote-session-scanner-types'
import type { FileWithMtime } from './session-scanner-types'

export async function statRemoteInventoryFile(
  provider: IFilesystemProvider,
  path: string,
  signal?: AbortSignal
): Promise<FileWithMtime | null> {
  try {
    const stat = await provider.stat(path, { signal })
    signal?.throwIfAborted()
    const mtimeMs = remoteInventoryMtimeMs(stat)
    return { path, mtimeMs, modifiedAt: new Date(mtimeMs).toISOString() }
  } catch (error) {
    // Rotation between directory discovery and stat is benign; transport and
    // permission failures must still invalidate the frozen inventory.
    if (isRemotePathMissing(error)) {
      return null
    }
    throw error
  }
}

export async function parseRemoteInventoryCandidate(
  candidate: RemoteSessionCandidate,
  context: RemoteScannerContext,
  signal: AbortSignal
): Promise<AiVaultSession | null> {
  if (candidate.source.parseIncrementally && context.provider.consumeSessionInventoryJsonLines) {
    try {
      const session = await candidate.source.parseIncrementally(candidate.file, context, signal)
      signal.throwIfAborted()
      return withSubagentTranscriptCount(session, candidate.subagentTranscriptCount)
    } catch (error) {
      if (isRemotePathMissing(error)) {
        return null
      }
      throw error
    }
  }
  let read: FileReadResult
  try {
    read = await context.provider.readFile(candidate.file.path, { signal })
    signal.throwIfAborted()
  } catch (error) {
    if (isRemotePathMissing(error)) {
      return null
    }
    throw error
  }
  if (read.isBinary) {
    return null
  }
  // Why: malformed transcripts return null, but transport/parser failures must
  // abort rather than making a partial frozen inventory look authoritative.
  const session = await candidate.source.parse(candidate.file, read.content, context)
  signal.throwIfAborted()
  return withSubagentTranscriptCount(session, candidate.subagentTranscriptCount)
}

export function isRemotePathMissing(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: unknown }).code
      : null
  if (code === 'ENOENT') {
    return true
  }
  const message = error instanceof Error ? error.message : String(error)
  return /\bENOENT\b|no such file or directory/i.test(message)
}

function withSubagentTranscriptCount(
  session: AiVaultSession | null,
  count: number | undefined
): AiVaultSession | null {
  const subagentTranscriptCount = count ?? 0
  return session && subagentTranscriptCount > 0 ? { ...session, subagentTranscriptCount } : session
}

function remoteInventoryMtimeMs(stat: FileStat): number {
  if (typeof stat.mtimeMs === 'number' && Number.isFinite(stat.mtimeMs)) {
    return stat.mtimeMs
  }
  return stat.mtime > 10_000_000_000 ? stat.mtime : stat.mtime * 1000
}
