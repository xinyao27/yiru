export type SpoolVerifiedRemoteExistingPath = {
  path: string
  expectedRealPath: string
  expectedStatIdentity: string
}

export type SpoolVerifiedRemoteFileRead = {
  bytes: Uint8Array<ArrayBufferLike>
  totalBytes: number
}

export type SpoolVerifiedRemoteDirectoryEntry = {
  name: string
  kind: 'file' | 'directory' | 'symlink'
}

export type SpoolVerifiedRemoteFileWrite =
  | {
      mode: 'create'
      targetPath: string
      parent: SpoolVerifiedRemoteExistingPath
      bytes: Uint8Array<ArrayBufferLike>
    }
  | {
      mode: 'replace'
      target: SpoolVerifiedRemoteExistingPath
      parent: SpoolVerifiedRemoteExistingPath
      bytes: Uint8Array<ArrayBufferLike>
    }

export type SpoolVerifiedRemoteFilesystem = {
  list(
    target: SpoolVerifiedRemoteExistingPath,
    limit: number,
    signal?: AbortSignal
  ): Promise<readonly SpoolVerifiedRemoteDirectoryEntry[]>
  read(
    target: SpoolVerifiedRemoteExistingPath,
    offset: number,
    maxBytes: number,
    signal?: AbortSignal
  ): Promise<SpoolVerifiedRemoteFileRead>
  write(request: SpoolVerifiedRemoteFileWrite, signal?: AbortSignal): Promise<void>
  createDirectory(
    targetPath: string,
    parent: SpoolVerifiedRemoteExistingPath,
    signal?: AbortSignal
  ): Promise<void>
  rename(
    source: SpoolVerifiedRemoteExistingPath,
    sourceParent: SpoolVerifiedRemoteExistingPath,
    destinationPath: string,
    destinationParent: SpoolVerifiedRemoteExistingPath,
    signal?: AbortSignal
  ): Promise<void>
  delete(
    target: SpoolVerifiedRemoteExistingPath,
    parent: SpoolVerifiedRemoteExistingPath,
    recursive: boolean,
    signal?: AbortSignal
  ): Promise<void>
}
