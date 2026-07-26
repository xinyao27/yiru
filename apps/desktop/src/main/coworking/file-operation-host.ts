import type { CoworkingContainedPath } from './worktree-containment'

export type CoworkingFileHostEntry = {
  name: string
  kind: 'file' | 'directory' | 'symlink'
  size?: number
  modifiedAt?: number
}

export type CoworkingFileHostPage = {
  entries: readonly CoworkingFileHostEntry[]
  nextOffset: number | null
}

export type CoworkingVerifiedFileRead = {
  bytes: Uint8Array<ArrayBufferLike>
  totalBytes: number
}

export type CoworkingFileOperationHost = {
  listVerified(
    path: CoworkingContainedPath,
    offset: number,
    limit: number,
    signal: AbortSignal
  ): Promise<CoworkingFileHostPage>
  readVerified(
    path: CoworkingContainedPath,
    offset: number,
    maxBytes: number,
    signal: AbortSignal
  ): Promise<CoworkingVerifiedFileRead>
  writeVerified(
    path: CoworkingContainedPath,
    bytes: Uint8Array<ArrayBufferLike>,
    mode: 'create' | 'replace',
    signal: AbortSignal
  ): Promise<void>
  createDirectoryVerified(path: CoworkingContainedPath, signal: AbortSignal): Promise<void>
  renameVerified(
    source: CoworkingContainedPath,
    destination: CoworkingContainedPath,
    signal: AbortSignal
  ): Promise<void>
  deleteVerified(
    path: CoworkingContainedPath,
    recursive: boolean,
    signal: AbortSignal
  ): Promise<void>
}
