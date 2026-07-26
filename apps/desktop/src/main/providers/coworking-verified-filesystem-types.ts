export type CoworkingVerifiedRemoteExistingPath = {
  path: string
  expectedRealPath: string
  expectedStatIdentity: string
}

export type CoworkingVerifiedRemoteFileRead = {
  bytes: Uint8Array<ArrayBufferLike>
  totalBytes: number
}

export type CoworkingVerifiedRemoteDirectoryEntry = {
  name: string
  kind: 'file' | 'directory' | 'symlink'
}

export type CoworkingVerifiedRemoteDirectoryPage = {
  entries: readonly CoworkingVerifiedRemoteDirectoryEntry[]
  nextOffset: number | null
}

export type CoworkingVerifiedRemoteDirectoryIdentity = {
  canonicalPath: string
  deviceId: string
  inodeId: string
}

export type CoworkingVerifiedRemoteFileWrite =
  | {
      mode: 'create'
      targetPath: string
      parent: CoworkingVerifiedRemoteExistingPath
      bytes: Uint8Array<ArrayBufferLike>
    }
  | {
      mode: 'replace'
      target: CoworkingVerifiedRemoteExistingPath
      parent: CoworkingVerifiedRemoteExistingPath
      bytes: Uint8Array<ArrayBufferLike>
    }

export type CoworkingVerifiedRemoteFilesystem = {
  inspectDirectoryIdentity(
    directoryPath: string,
    signal?: AbortSignal
  ): Promise<CoworkingVerifiedRemoteDirectoryIdentity>
  readOrCreateIncarnationMarker(
    directoryPath: string,
    filename: string,
    proposedMarkerId: string,
    signal?: AbortSignal
  ): Promise<string>
  list(
    target: CoworkingVerifiedRemoteExistingPath,
    offset: number,
    limit: number,
    signal?: AbortSignal
  ): Promise<CoworkingVerifiedRemoteDirectoryPage>
  read(
    target: CoworkingVerifiedRemoteExistingPath,
    offset: number,
    maxBytes: number,
    signal?: AbortSignal
  ): Promise<CoworkingVerifiedRemoteFileRead>
  write(request: CoworkingVerifiedRemoteFileWrite, signal?: AbortSignal): Promise<void>
  createDirectory(
    targetPath: string,
    parent: CoworkingVerifiedRemoteExistingPath,
    signal?: AbortSignal
  ): Promise<void>
  rename(
    source: CoworkingVerifiedRemoteExistingPath,
    sourceParent: CoworkingVerifiedRemoteExistingPath,
    destinationPath: string,
    destinationParent: CoworkingVerifiedRemoteExistingPath,
    signal?: AbortSignal
  ): Promise<void>
  delete(
    target: CoworkingVerifiedRemoteExistingPath,
    parent: CoworkingVerifiedRemoteExistingPath,
    recursive: boolean,
    signal?: AbortSignal
  ): Promise<void>
}
