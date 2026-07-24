import { mkdir, open } from 'node:fs/promises'
import { join } from 'node:path'

import {
  isWindowsAbsolutePathLike,
  normalizeRuntimePathSeparators
} from '@yiru/workbench-model/platform'
import type { FileEntryWithStats, SFTPWrapper } from 'ssh2'

import { sanitizeLocalDownloadFilename } from '../local-download-filename'
import type { SftpFactory } from './ssh-filesystem-file-upload'
import { fastGetViaSftp, readDirViaSftp, statViaSftp } from './ssh-filesystem-provider-sftp'

export type FolderDownloadOptions = { signal?: AbortSignal; windowsRemotePaths?: boolean }
export type FolderDownloader = (
  sourcePath: string,
  destinationPath: string,
  options?: Pick<FolderDownloadOptions, 'signal'>
) => Promise<void>

const DOWNLOAD_UNAVAILABLE_MESSAGE =
  'Remote folder download is unavailable. Reconnect the SSH target and retry.'

function isEEXIST(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'EEXIST'
  )
}

async function reserveLocalFile(localPath: string, localName: string): Promise<void> {
  try {
    const handle = await open(localPath, 'wx')
    await handle.close()
  } catch (error) {
    if (isEEXIST(error)) {
      throw new Error(`Remote entries map to the same local name '${localName}'`)
    }
    throw error
  }
}

function remotePathsAreWindows(sourceDir: string, windowsRemotePaths?: boolean): boolean {
  // Why: remote path rules belong to the SSH host. Prefer the known platform
  // and only fall back to string shape while an older relay is reconnecting.
  return windowsRemotePaths ?? isWindowsAbsolutePathLike(sourceDir)
}

function joinSftpChildPath(
  sourceDir: string,
  childName: string,
  windowsRemotePaths?: boolean
): string {
  const windowsPath = remotePathsAreWindows(sourceDir, windowsRemotePaths)
  if (
    !childName ||
    childName === '.' ||
    childName === '..' ||
    childName.includes('/') ||
    (windowsPath && childName.includes('\\'))
  ) {
    throw new Error(`Invalid remote directory entry '${childName}'`)
  }
  const normalizedSource = windowsPath ? normalizeRuntimePathSeparators(sourceDir) : sourceDir
  return `${normalizedSource.replace(/\/+$/g, '')}/${childName}`
}

function classifySftpEntry(entry: FileEntryWithStats): 'directory' | 'file' {
  if (entry.attrs.isSymbolicLink()) {
    // Why: following links can escape the selected tree, and creating local
    // links is not portable across Yiru's supported desktop hosts.
    throw new Error(`Cannot download symbolic link '${entry.filename}'`)
  }
  if (entry.attrs.isDirectory()) {
    return 'directory'
  }
  if (entry.attrs.isFile()) {
    return 'file'
  }
  throw new Error(`Cannot download unsupported remote entry '${entry.filename}'`)
}

async function downloadDirectoryTree(
  sftp: SFTPWrapper,
  sourceDir: string,
  destinationDir: string,
  signal?: AbortSignal,
  windowsRemotePaths?: boolean
): Promise<void> {
  signal?.throwIfAborted()
  const entries = (await readDirViaSftp(sftp, sourceDir, { signal })).filter(
    (entry) => entry.filename !== '.' && entry.filename !== '..'
  )
  signal?.throwIfAborted()
  const usedLocalNames = new Set<string>()
  const plannedEntries = entries.map((entry) => {
    const localName = sanitizeLocalDownloadFilename(entry.filename)
    if (usedLocalNames.has(localName)) {
      throw new Error(`Remote entries map to the same local name '${localName}'`)
    }
    usedLocalNames.add(localName)
    return { entry, kind: classifySftpEntry(entry), localName }
  })

  await mkdir(destinationDir, { recursive: false })
  for (const { entry, kind, localName } of plannedEntries) {
    signal?.throwIfAborted()
    const remotePath = joinSftpChildPath(sourceDir, entry.filename, windowsRemotePaths)
    const localPath = join(destinationDir, localName)
    if (kind === 'directory') {
      await downloadDirectoryTree(sftp, remotePath, localPath, signal, windowsRemotePaths)
      continue
    }
    // Why: the selected local volume decides case and Unicode equivalence; an
    // exclusive placeholder prevents aliases from overwriting one another.
    await reserveLocalFile(localPath, localName)
    await fastGetViaSftp(sftp, remotePath, localPath, { signal })
  }
}

export async function downloadFileViaSftp(
  createSftp: SftpFactory | undefined,
  sourcePath: string,
  destinationPath: string
): Promise<void> {
  if (!createSftp) {
    throw new Error('Remote file download is unavailable. Reconnect the SSH target and retry.')
  }
  const sftp = await createSftp()
  try {
    await fastGetViaSftp(sftp, sourcePath, destinationPath)
  } finally {
    sftp.end()
  }
}

export async function downloadFolderViaSftp(
  createSftp: SftpFactory | undefined,
  sourcePath: string,
  destinationPath: string,
  options?: FolderDownloadOptions
): Promise<void> {
  if (!createSftp) {
    throw new Error(DOWNLOAD_UNAVAILABLE_MESSAGE)
  }
  const signal = options?.signal
  signal?.throwIfAborted()
  const sftp = await createSftp({ signal })
  let ended = false
  const endSftp = (): void => {
    if (ended) {
      return
    }
    ended = true
    try {
      sftp.end()
    } catch {
      // Cleanup is best-effort and must not mask the transfer or abort error.
    }
  }
  signal?.addEventListener('abort', endSftp, { once: true })
  try {
    const rootStats = await statViaSftp(sftp, sourcePath, { signal })
    if (!rootStats.isDirectory()) {
      throw new Error('Cannot download a file as a folder')
    }
    await downloadDirectoryTree(
      sftp,
      sourcePath,
      destinationPath,
      signal,
      options?.windowsRemotePaths
    )
  } finally {
    signal?.removeEventListener('abort', endSftp)
    endSftp()
  }
}
