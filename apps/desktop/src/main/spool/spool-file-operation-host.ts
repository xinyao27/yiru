import type { SpoolContainedPath } from './spool-worktree-containment'

export type SpoolFileHostEntry = {
  name: string
  kind: 'file' | 'directory' | 'symlink'
  size?: number
  modifiedAt?: number
}

export type SpoolFileHostPage = {
  entries: readonly SpoolFileHostEntry[]
  nextOffset: number | null
}

export type SpoolVerifiedFileRead = {
  bytes: Uint8Array<ArrayBufferLike>
  totalBytes: number
}

export type SpoolFileOperationHost = {
  listVerified(
    path: SpoolContainedPath,
    offset: number,
    limit: number,
    signal: AbortSignal
  ): Promise<SpoolFileHostPage>
  readVerified(
    path: SpoolContainedPath,
    offset: number,
    maxBytes: number,
    signal: AbortSignal
  ): Promise<SpoolVerifiedFileRead>
  writeVerified(
    path: SpoolContainedPath,
    bytes: Uint8Array<ArrayBufferLike>,
    mode: 'create' | 'replace',
    signal: AbortSignal
  ): Promise<void>
  createDirectoryVerified(path: SpoolContainedPath, signal: AbortSignal): Promise<void>
  renameVerified(
    source: SpoolContainedPath,
    destination: SpoolContainedPath,
    signal: AbortSignal
  ): Promise<void>
  deleteVerified(path: SpoolContainedPath, recursive: boolean, signal: AbortSignal): Promise<void>
}
