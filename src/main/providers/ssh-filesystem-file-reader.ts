import type { SshChannelMultiplexer } from '../ssh/ssh-channel-multiplexer'
import { isMethodNotFoundError, readFileViaStream } from '../ssh/ssh-filesystem-stream-reader'
import type { FileReadResult } from './types'

const warnedLegacyRelays = new WeakSet<SshChannelMultiplexer>()

export async function readSshFilesystemFile(
  mux: SshChannelMultiplexer,
  filePath: string,
  signal?: AbortSignal
): Promise<FileReadResult> {
  try {
    return await readFileViaStream(mux, filePath, signal)
  } catch (error) {
    if (!isMethodNotFoundError(error)) {
      throw error
    }
    if (!warnedLegacyRelays.has(mux)) {
      warnedLegacyRelays.add(mux)
      console.warn(
        '[ssh-fs] Relay does not implement fs.readFileStream; falling back to fs.readFile (10 MB cap)'
      )
    }
    const result = signal
      ? await mux.request('fs.readFile', { filePath }, { signal })
      : await mux.request('fs.readFile', { filePath })
    return result as FileReadResult
  }
}
