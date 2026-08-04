const REMOTE_FILE_OPERATION_TIMEOUT_MS = 10_000

export type RemoteFileOperationCallback<Value = void> = (error: Error | null, value?: Value) => void

export type RemoteDirectoryEntry = {
  filename: string
}

export type RemoteFileWriteOptions = {
  encoding: 'utf8'
  mode?: number
}

export type RemoteFileOperations = {
  readFile: (
    remotePath: string,
    encoding: 'utf8',
    callback: RemoteFileOperationCallback<string | Buffer>
  ) => void
  writeFile: (
    remotePath: string,
    content: string,
    options: RemoteFileWriteOptions,
    callback: RemoteFileOperationCallback
  ) => void
  stat: (remotePath: string, callback: RemoteFileOperationCallback<{ mode: number }>) => void
  replaceFile?: (
    sourcePath: string,
    destinationPath: string,
    callback: RemoteFileOperationCallback
  ) => void
  rename: (
    sourcePath: string,
    destinationPath: string,
    callback: RemoteFileOperationCallback
  ) => void
  unlink: (remotePath: string, callback: RemoteFileOperationCallback) => void
  chmod: (remotePath: string, mode: number, callback: RemoteFileOperationCallback) => void
  readdir: (
    remotePath: string,
    callback: RemoteFileOperationCallback<RemoteDirectoryEntry[]>
  ) => void
  mkdir: (remotePath: string, callback: RemoteFileOperationCallback) => void
}

export async function readRemoteFile(
  remoteFiles: RemoteFileOperations,
  remotePath: string
): Promise<string> {
  const data = await remoteFileOperation<string | Buffer>(`readFile ${remotePath}`, (callback) => {
    remoteFiles.readFile(remotePath, 'utf8', callback)
  })
  return typeof data === 'string' ? data : data.toString('utf8')
}

export async function writeRemoteFile(
  remoteFiles: RemoteFileOperations,
  remotePath: string,
  content: string,
  mode?: number
): Promise<void> {
  const options: RemoteFileWriteOptions =
    mode === undefined ? { encoding: 'utf8' } : { encoding: 'utf8', mode }
  await remoteFileOperation<void>(`writeFile ${remotePath}`, (callback) => {
    remoteFiles.writeFile(remotePath, content, options, callback)
  })
}

export async function getRemoteFileModeOrDefault(
  remoteFiles: RemoteFileOperations,
  remotePath: string,
  defaultMode: number
): Promise<number> {
  try {
    const stats = await remoteFileOperation<{ mode: number }>(`stat ${remotePath}`, (callback) => {
      remoteFiles.stat(remotePath, callback)
    })
    return stats.mode & 0o7777
  } catch (err) {
    if (isNoEntryError(err)) {
      return defaultMode
    }
    throw err
  }
}

export async function renameRemoteFile(
  remoteFiles: RemoteFileOperations,
  sourcePath: string,
  destinationPath: string
): Promise<void> {
  const replaceFile = remoteFiles.replaceFile
  if (replaceFile) {
    try {
      await remoteFileOperation<void>(`replace ${sourcePath}`, (callback) => {
        replaceFile(sourcePath, destinationPath, callback)
      })
      return
    } catch (err) {
      if (!isUnsupportedExtensionError(err)) {
        throw err
      }
    }
  }

  // Why: remote runtimes without overwrite-rename cannot safely replace an
  // existing live config path. Renaming the destination aside would leave
  // settings.json missing if the file channel dies before the source is moved,
  // so fail closed and keep the existing file intact.
  await remoteFileOperation<void>(`rename ${sourcePath}`, (callback) => {
    remoteFiles.rename(sourcePath, destinationPath, callback)
  })
}

export async function unlinkRemoteFile(
  remoteFiles: RemoteFileOperations,
  remotePath: string
): Promise<void> {
  await remoteFileOperation<void>(`unlink ${remotePath}`, (callback) => {
    remoteFiles.unlink(remotePath, callback)
  })
}

export async function chmodRemoteFile(
  remoteFiles: RemoteFileOperations,
  remotePath: string,
  mode: number
): Promise<void> {
  await remoteFileOperation<void>(`chmod ${remotePath}`, (callback) => {
    remoteFiles.chmod(remotePath, mode, callback)
  })
}

async function readRemoteDirectory(
  remoteFiles: RemoteFileOperations,
  remotePath: string
): Promise<RemoteDirectoryEntry[]> {
  return await remoteFileOperation<RemoteDirectoryEntry[]>(`readdir ${remotePath}`, (callback) => {
    remoteFiles.readdir(remotePath, callback)
  })
}

async function mkdirRemoteDirectory(
  remoteFiles: RemoteFileOperations,
  remotePath: string
): Promise<void> {
  await remoteFileOperation<void>(`mkdir ${remotePath}`, (callback) => {
    remoteFiles.mkdir(remotePath, callback)
  })
}

export async function mkdirpRemote(
  remoteFiles: RemoteFileOperations,
  remotePath: string
): Promise<void> {
  if (remotePath === '/' || remotePath === '' || remotePath === '.') {
    return
  }
  // Why: walk the path top-down rather than bottom-up so an existing parent
  // chain doesn't cost a full readdir per segment. POSIX-only — Windows-
  // remote is out of scope for v1.
  const segments = remotePath.split('/').filter((segment) => segment.length > 0)
  let current = remotePath.startsWith('/') ? '' : '.'
  for (const segment of segments) {
    current = current === '' ? `/${segment}` : current === '.' ? segment : `${current}/${segment}`
    try {
      await readRemoteDirectory(remoteFiles, current)
    } catch {
      try {
        await mkdirRemoteDirectory(remoteFiles, current)
      } catch (err) {
        // Why: re-raise only when the directory really isn't there. A generic
        // already-exists status from a concurrent mkdir is harmless — readdir
        // on the next iteration will succeed.
        if (!isAlreadyExistsError(err)) {
          throw err
        }
      }
    }
  }
}

export function dirnamePosix(path: string): string {
  const idx = path.lastIndexOf('/')
  if (idx <= 0) {
    return idx === 0 ? '/' : '.'
  }
  return path.slice(0, idx)
}

export function isNoEntryError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false
  }
  // Why: the remote file layer uses code 2 to represent a missing entry.
  return (err as { code?: unknown }).code === 2
}

function isAlreadyExistsError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false
  }
  // Why: code 4 is the remote file layer's catch-all for an already-existing
  // directory alongside other mkdir failures; the next readdir proves success.
  return (err as { code?: unknown }).code === 4
}

function isUnsupportedExtensionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false
  }
  const code = (err as { code?: unknown }).code
  const message = (err as { message?: unknown }).message
  return code === 8 || (typeof message === 'string' && /unsupported/i.test(message))
}

function remoteFileOperation<T>(
  label: string,
  run: (callback: (err: unknown, value?: T) => void) => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) {
        return
      }
      settled = true
      // Why: remote hook installation must fail open; a wedged file callback
      // should degrade hook status, not block workspace startup forever.
      reject(new Error(`Timed out waiting for remote file operation ${label}`))
    }, REMOTE_FILE_OPERATION_TIMEOUT_MS)
    if (typeof timer === 'object' && 'unref' in timer) {
      timer.unref()
    }

    const finish = (err: unknown, value?: T): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      if (err) {
        reject(err)
        return
      }
      resolve(value as T)
    }

    try {
      run(finish)
    } catch (error) {
      finish(error)
    }
  })
}
