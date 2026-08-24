// Adapter over the WSL hook relay's file bridge. It lets the shared remote
// hook installers write into a WSL distro's home over the relay's already-open
// stdio channel. Only the primitives `remote-hook-storage.ts` touches are
// implemented.
import { WSL_HOOK_FS_METHODS, type WslFsResult } from '~shared/wsl-hook-relay-contract'

import type { ChannelMultiplexer } from '../channel-multiplexer/multiplexer'
import { wslCodexRuntimeHomeForGuestHome } from '../pty/codex-home-wsl-env'
import type {
  RemoteDirectoryEntry,
  RemoteFileOperationCallback,
  RemoteFileOperations,
  RemoteFileWriteOptions
} from './remote-file-operations'
import type { installRemoteManagedAgentHooks } from './remote-managed-hook-installers'

/** Run the shared remote hook installers against a WSL guest over the relay's
 *  fs bridge. Codex is the one agent whose home Yiru redirects for WSL
 *  sessions, so its hooks go to the managed runtime home. */
export async function installWslGuestHooks(options: {
  mux: ChannelMultiplexer
  guestHome: string
  distro: string
  installHooks: typeof installRemoteManagedAgentHooks
  warn: (message: string) => void
}): Promise<void> {
  const { mux, guestHome, distro, installHooks, warn } = options
  const results = await installHooks(createWslHookRemoteFileAdapter(mux), guestHome, {
    codexHomeDir: wslCodexRuntimeHomeForGuestHome(guestHome)
  })
  const failed = results.filter((r) => r.state === 'error').length
  if (failed > 0) {
    warn(
      `[agent-hooks] WSL hook install for '${distro}': ${failed}/${results.length} agents failed`
    )
  }
}

// Why: remote-hook-storage classifies remote file failures by numeric status
// codes (missing entry=2, already-exists=4). Map guest POSIX errno onto those
// so the shared classifiers keep working across transports.
const REMOTE_FILE_ERROR_CODE_BY_ERRNO: Record<string, number> = {
  ENOENT: 2,
  ENOTDIR: 2,
  EACCES: 3,
  EEXIST: 4
}

function toRemoteFileError(failure: { errno?: string; message?: string }): Error {
  const err = new Error(failure.message ?? 'wsl fs bridge failure') as Error & { code?: number }
  err.code = REMOTE_FILE_ERROR_CODE_BY_ERRNO[failure.errno ?? ''] ?? 5
  return err
}

export function createWslHookRemoteFileAdapter(mux: ChannelMultiplexer): RemoteFileOperations {
  const call = <Wire extends object, Value>(
    method: string,
    params: Record<string, unknown>,
    callback: RemoteFileOperationCallback<Value>,
    pick: (result: { ok: true } & Wire) => Value
  ): void => {
    mux
      .request(method, params)
      .then((raw) => {
        const result = raw as WslFsResult<Wire>
        if (!result || typeof result !== 'object' || result.ok !== true) {
          callback(toRemoteFileError((result ?? {}) as { errno?: string; message?: string }))
          return
        }
        callback(null, pick(result))
      })
      .catch((err) => callback(err instanceof Error ? err : new Error(String(err))))
  }
  const callVoid = (
    method: string,
    params: Record<string, unknown>,
    callback: RemoteFileOperationCallback
  ): void => {
    call<Record<string, never>, undefined>(method, params, callback, () => undefined)
  }
  const renameRemoteFile = (
    src: string,
    dst: string,
    callback: RemoteFileOperationCallback
  ): void => {
    callVoid(WSL_HOOK_FS_METHODS.rename, { src, dst }, callback)
  }

  const adapter = {
    readFile(
      path: string,
      _encoding: 'utf8',
      callback: RemoteFileOperationCallback<string | Buffer>
    ): void {
      call<{ content: string }, string>(
        WSL_HOOK_FS_METHODS.readFile,
        { path },
        callback,
        (r) => r.content
      )
    },
    writeFile(
      path: string,
      content: string,
      options: RemoteFileWriteOptions,
      callback: RemoteFileOperationCallback
    ): void {
      callVoid(WSL_HOOK_FS_METHODS.writeFile, { path, content, mode: options?.mode }, callback)
    },
    stat(path: string, callback: RemoteFileOperationCallback<{ mode: number }>): void {
      call<{ mode: number }, { mode: number }>(
        WSL_HOOK_FS_METHODS.stat,
        { path },
        callback,
        (r) => ({
          mode: r.mode
        })
      )
    },
    // Why: POSIX rename overwrites atomically, so this adapter can offer the
    // optional replacement operation without a second remote-file primitive.
    replaceFile: renameRemoteFile,
    rename: renameRemoteFile,
    unlink(path: string, callback: RemoteFileOperationCallback): void {
      callVoid(WSL_HOOK_FS_METHODS.unlink, { path }, callback)
    },
    chmod(path: string, mode: number, callback: RemoteFileOperationCallback): void {
      callVoid(WSL_HOOK_FS_METHODS.chmod, { path, mode }, callback)
    },
    readdir(path: string, callback: RemoteFileOperationCallback<RemoteDirectoryEntry[]>): void {
      call<{ entries: RemoteDirectoryEntry[] }, RemoteDirectoryEntry[]>(
        WSL_HOOK_FS_METHODS.readdir,
        { path },
        callback,
        (r) => r.entries
      )
    },
    mkdir(path: string, callback: RemoteFileOperationCallback): void {
      callVoid(WSL_HOOK_FS_METHODS.mkdir, { path }, callback)
    }
  } satisfies RemoteFileOperations

  return adapter
}
