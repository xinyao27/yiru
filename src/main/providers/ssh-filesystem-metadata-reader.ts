import type { DirEntry } from '../../shared/types'
import type { SshChannelMultiplexer } from '../ssh/ssh-channel-multiplexer'
import { isMethodNotFoundError } from '../ssh/ssh-filesystem-stream-reader'
import type { SftpFactory } from './ssh-filesystem-file-upload'
import { lstatViaSftp } from './ssh-filesystem-provider-sftp'
import type { FileStat } from './types'

export async function readSshDirectory(
  mux: SshChannelMultiplexer,
  dirPath: string,
  options: { limit?: number; signal?: AbortSignal }
): Promise<DirEntry[]> {
  return (await mux.request(
    'fs.readDir',
    { dirPath, ...(options.limit !== undefined ? { limit: options.limit } : {}) },
    { signal: options.signal }
  )) as DirEntry[]
}

export async function readSshFileStat(
  mux: SshChannelMultiplexer,
  filePath: string,
  signal?: AbortSignal
): Promise<FileStat> {
  return (await mux.request('fs.stat', { filePath }, { signal })) as FileStat
}

export async function readSshFileLstat(
  mux: SshChannelMultiplexer,
  filePath: string,
  createSftp?: SftpFactory
): Promise<FileStat> {
  try {
    return (await mux.request('fs.lstat', { filePath })) as FileStat
  } catch (error) {
    if (!isMethodNotFoundError(error)) {
      throw error
    }
    if (!createSftp) {
      throw new Error('remote_lstat_unavailable')
    }
    const sftp = await createSftp()
    try {
      // Why: older relays predate fs.lstat, but SFTP can still preserve
      // symlink identity for orphaned-worktree safety checks.
      return await lstatViaSftp(sftp, filePath)
    } finally {
      sftp.end()
    }
  }
}
