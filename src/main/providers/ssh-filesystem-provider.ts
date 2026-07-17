import type { SshChannelMultiplexer } from '../ssh/ssh-channel-multiplexer'
import {
  consumeSessionInventoryJsonLines,
  isMethodNotFoundError
} from '../ssh/ssh-filesystem-stream-reader'
import { uploadBuffer } from '../ssh/sftp-upload'
import { fastGetViaSftp } from './ssh-filesystem-provider-sftp'
import {
  openSshFileUploadSession,
  type SftpFactory,
  type SshRawTransferOptions
} from './ssh-filesystem-file-upload'
import { readSshFilesystemFile } from './ssh-filesystem-file-reader'
import {
  closeSshFilesystemWatch,
  registerSshFilesystemWatch,
  stopSshFilesystemWatchRegistration,
  type WatchRegistration
} from './ssh-filesystem-provider-watch'
import {
  readSshDirectory,
  readSshFileLstat,
  readSshFileStat
} from './ssh-filesystem-metadata-reader'
import { createSshSpoolVerifiedFilesystem } from './ssh-spool-verified-filesystem'
import type { SpoolVerifiedRemoteFilesystem } from './spool-verified-filesystem-types'
import type {
  IFilesystemProvider,
  FileStat,
  FileReadResult,
  FileUploadSession,
  TerminalArtifactAccessOptions
} from './types'
import type { DirEntry, FsChangeEvent, SearchOptions, SearchResult } from '../../shared/types'
import { routeSshFilesystemWatchNotification } from './ssh-filesystem-watch-notifications'
import type { WorkspaceSpaceDirectoryScanResult } from '../../shared/workspace-space-types'
const WORKSPACE_SPACE_SCAN_TIMEOUT_MS = 130_000

export class SshFilesystemProvider implements IFilesystemProvider {
  readonly spoolVerifiedFiles: SpoolVerifiedRemoteFilesystem
  private connectionId: string
  private mux: SshChannelMultiplexer
  private watchListeners = new Map<string, WatchRegistration>()
  private unsubscribeNotifications: (() => void) | null = null
  private tempDirPromise: Promise<string> | null = null
  private disposed = false

  constructor(
    connectionId: string,
    mux: SshChannelMultiplexer,
    private readonly createSftp?: SftpFactory,
    private readonly rawTransfer?: SshRawTransferOptions
  ) {
    this.connectionId = connectionId
    this.mux = mux
    this.spoolVerifiedFiles = createSshSpoolVerifiedFilesystem(mux)

    this.unsubscribeNotifications = mux.onNotification((method, params) =>
      routeSshFilesystemWatchNotification(this.watchListeners, method, params)
    )
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    if (this.unsubscribeNotifications) {
      this.unsubscribeNotifications()
      this.unsubscribeNotifications = null
    }
    for (const registration of this.watchListeners.values()) {
      stopSshFilesystemWatchRegistration(this.mux, registration)
    }
    this.watchListeners.clear()
  }

  getConnectionId(): string {
    return this.connectionId
  }

  async readDir(
    dirPath: string,
    options: { limit?: number; signal?: AbortSignal } = {}
  ): Promise<DirEntry[]> {
    return readSshDirectory(this.mux, dirPath, options)
  }

  async readFile(
    filePath: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<FileReadResult> {
    return readSshFilesystemFile(this.mux, filePath, options.signal)
  }

  async consumeSessionInventoryJsonLines(
    filePath: string,
    consumeLine: (line: string) => void,
    options: { signal?: AbortSignal } = {}
  ): Promise<void> {
    // Why: falling back to fs.readFile would reintroduce both the legacy 10 MB
    // cap and whole-transcript buffering; stale relays fail closed instead.
    await consumeSessionInventoryJsonLines(this.mux, filePath, consumeLine, options.signal)
  }

  async readTerminalArtifact(
    filePath: string,
    options: TerminalArtifactAccessOptions
  ): Promise<FileReadResult> {
    try {
      return (await this.mux.request('fs.readTerminalArtifact', {
        filePath,
        expectedRealPath: options.expectedRealPath,
        expectedStatIdentity: options.expectedStatIdentity,
        maxBytes: options.maxBytes
      })) as FileReadResult
    } catch (err) {
      if (isMethodNotFoundError(err)) {
        throw new Error(
          'Remote terminal artifact access is unavailable. Reconnect the SSH target before retrying.'
        )
      }
      throw err
    }
  }

  async downloadFile(sourcePath: string, destinationPath: string): Promise<void> {
    if (this.rawTransfer?.downloadFile) {
      await this.rawTransfer.downloadFile(sourcePath, destinationPath)
      return
    }
    if (!this.createSftp) {
      throw new Error('Remote file download is unavailable. Reconnect the SSH target and retry.')
    }
    const sftp = await this.createSftp()
    try {
      await fastGetViaSftp(sftp, sourcePath, destinationPath)
    } finally {
      sftp.end()
    }
  }

  async openFileUploadSession(): Promise<FileUploadSession> {
    return openSshFileUploadSession(this.createSftp, this.rawTransfer)
  }

  async getTempDir(): Promise<string> {
    this.tempDirPromise ??= this.mux.request('fs.tempDir', {}).then(
      (result) => result as string,
      (err) => {
        this.tempDirPromise = null
        if (isMethodNotFoundError(err)) {
          return '/tmp'
        }
        throw err
      }
    )
    return this.tempDirPromise
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await this.mux.request('fs.writeFile', { filePath, content })
  }

  async writeTerminalArtifact(
    filePath: string,
    content: string,
    options: TerminalArtifactAccessOptions
  ): Promise<FileStat> {
    let result: { stat?: FileStat }
    try {
      result = (await this.mux.request('fs.writeTerminalArtifact', {
        filePath,
        content,
        expectedRealPath: options.expectedRealPath,
        expectedStatIdentity: options.expectedStatIdentity,
        maxBytes: options.maxBytes
      })) as { stat?: FileStat }
    } catch (err) {
      if (isMethodNotFoundError(err)) {
        throw new Error(
          'Remote terminal artifact access is unavailable. Reconnect the SSH target before retrying.'
        )
      }
      throw err
    }
    if (!result.stat) {
      throw new Error('terminal_file_grant_stale')
    }
    return result.stat
  }

  async writeFileBase64(filePath: string, contentBase64: string): Promise<void> {
    await this.writeFileBase64Chunk(filePath, contentBase64, false)
  }

  async writeFileBase64Chunk(
    filePath: string,
    contentBase64: string,
    append: boolean
  ): Promise<void> {
    const contents = Buffer.from(contentBase64, 'base64')
    if (this.rawTransfer?.writeBuffer) {
      await this.rawTransfer.writeBuffer(filePath, contents, { append, exclusive: !append })
      return
    }
    if (!this.createSftp) {
      throw new Error('remote_binary_upload_unavailable')
    }
    const sftp = await this.createSftp()
    try {
      // Why: relay fs.writeFile is text-only. SFTP writes the decoded bytes
      // directly so runtime uploads do not corrupt images, PDFs, or archives.
      await uploadBuffer(sftp, contents, filePath, {
        append,
        exclusive: !append
      })
    } finally {
      sftp.end()
    }
  }

  async stat(filePath: string, options: { signal?: AbortSignal } = {}): Promise<FileStat> {
    return readSshFileStat(this.mux, filePath, options.signal)
  }

  async lstat(filePath: string): Promise<FileStat> {
    return readSshFileLstat(this.mux, filePath, this.createSftp)
  }

  async scanWorkspaceSpace(
    rootPath: string,
    options?: { signal?: AbortSignal }
  ): Promise<WorkspaceSpaceDirectoryScanResult> {
    return (await this.mux.request(
      'fs.workspaceSpaceScan',
      { rootPath },
      { signal: options?.signal, timeoutMs: WORKSPACE_SPACE_SCAN_TIMEOUT_MS }
    )) as WorkspaceSpaceDirectoryScanResult
  }

  async deletePath(targetPath: string, recursive?: boolean): Promise<void> {
    await this.mux.request('fs.deletePath', { targetPath, recursive })
  }

  async createFile(filePath: string): Promise<void> {
    await this.mux.request('fs.createFile', { filePath })
  }

  async createDir(dirPath: string): Promise<void> {
    await this.mux.request('fs.createDir', { dirPath })
  }

  async createDirNoClobber(dirPath: string): Promise<void> {
    await this.mux.request('fs.createDirNoClobber', { dirPath })
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.mux.request('fs.rename', { oldPath, newPath })
  }

  async renameNoClobber(oldPath: string, newPath: string): Promise<void> {
    try {
      await this.mux.request('fs.renameNoClobber', { oldPath, newPath })
    } catch (err) {
      if (isMethodNotFoundError(err)) {
        // Why: falling back to raw fs.rename can silently clobber the target on
        // older relays. Fail closed and let reconnect deploy the safe relay.
        throw new Error('Remote safe rename is unavailable. Reconnect the SSH target and retry.')
      }
      throw err
    }
  }

  async copy(source: string, destination: string): Promise<void> {
    await this.mux.request('fs.copy', { source, destination })
  }

  async realpath(filePath: string): Promise<string> {
    return (await this.mux.request('fs.realpath', { filePath })) as string
  }

  async search(opts: SearchOptions): Promise<SearchResult> {
    return (await this.mux.request('fs.search', opts)) as SearchResult
  }

  async listFiles(
    rootPath: string,
    options?: { excludePaths?: string[]; signal?: AbortSignal; maxResults?: number }
  ): Promise<string[]> {
    const params: Record<string, unknown> = { rootPath }
    if (options?.excludePaths && options.excludePaths.length > 0) {
      params.excludePaths = options.excludePaths
    }
    if (options?.maxResults !== undefined) {
      params.maxResults = options.maxResults
    }
    // Why #7721: the signal lets a workspace switch send rpc.cancel so the
    // relay aborts the full-tree scan instead of stacking abandoned scans
    // that starve interactive fs.readDir/fs.stat on the shared SSH channel.
    return (await this.mux.request('fs.listFiles', params, {
      signal: options?.signal
    })) as string[]
  }

  async watch(
    rootPath: string,
    callback: (events: FsChangeEvent[]) => void,
    options?: { signal?: AbortSignal; onTerminalError?: (error: Error) => void }
  ): Promise<() => void> {
    return registerSshFilesystemWatch({
      mux: this.mux,
      disposed: () => this.disposed,
      registrations: this.watchListeners,
      rootPath,
      callback,
      onTerminalError: options?.onTerminalError,
      signal: options?.signal
    })
  }

  async closeWatch(rootPath: string): Promise<void> {
    await closeSshFilesystemWatch(this.mux, this.watchListeners, rootPath)
  }
}
