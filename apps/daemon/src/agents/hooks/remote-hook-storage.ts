// Why: Remote-file equivalents of `managed-hook-commands.ts` for the remote-install
// flow. Each function takes a file-operations handle plus paths the agent CLI expects
// on the remote (e.g. `~/.claude/settings.json`). Lives in `agent-hooks/`
// because it shares the contract with the local installer (script body,
// hook-event shape, atomic-rename semantics) and any drift between them is
// exactly the bug we want to avoid.
//
// We deliberately keep the JSON merge logic in the existing
// `managed-hook-commands.ts` and only swap fs primitives — the JSON shape and
// managed-command matching must stay identical to the local install.
//
import { randomUUID } from 'node:crypto'

import { isPlainObject, type HooksConfig } from './managed-hook-commands'
import {
  chmodRemoteFile,
  dirnamePosix,
  getRemoteFileModeOrDefault,
  isNoEntryError,
  mkdirpRemote,
  readRemoteFile,
  renameRemoteFile,
  unlinkRemoteFile,
  writeRemoteFile,
  type RemoteFileOperations
} from './remote-file-operations'

const DEFAULT_REMOTE_CONFIG_MODE = 0o600

/** Read+JSON-parse a remote file. Returns `null` on parse failure (caller
 *  surfaces "could not parse" status to the UI), `{}` on missing file
 *  (matches local behavior — first-install case). Rethrows on other I/O
 *  failures (permission denied, EIO, channel closed) so the caller can
 *  distinguish transient remote-file errors from a malformed-JSON case rather
 *  than collapsing both into a misleading "could not parse" diagnostic. */
export async function readHooksJsonRemote(
  remoteFiles: RemoteFileOperations,
  remotePath: string
): Promise<HooksConfig | null> {
  let body: string
  try {
    body = await readRemoteFile(remoteFiles, remotePath)
  } catch (err) {
    if (isNoEntryError(err)) {
      return {}
    }
    throw err
  }
  try {
    const parsed = JSON.parse(body)
    return isPlainObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Atomically write a JSON config to the remote — write to a tmp path then
 *  rename, mirroring the local writeHooksJson contract. The .bak rotation is
 *  intentionally NOT carried over: the remote file is the user's, and a
 *  per-target backup convention belongs alongside the remote installer UI
 *  (out of scope for this commit). */
export async function writeHooksJsonRemote(
  remoteFiles: RemoteFileOperations,
  remotePath: string,
  config: HooksConfig
): Promise<void> {
  const dir = dirnamePosix(remotePath)
  await mkdirpRemote(remoteFiles, dir)
  const serialized = `${JSON.stringify(config, null, 2)}\n`
  // Why: skip the write when on-disk content is identical so repeated
  // install() calls do not bump the file's mtime / inode unnecessarily.
  try {
    const existing = await readRemoteFile(remoteFiles, remotePath)
    if (existing === serialized) {
      return
    }
  } catch {
    // ENOENT or read error — fall through to the write below.
  }
  // Why: tmp + rename so a partial network drop mid-write does not leave a
  // truncated settings.json that the agent CLI would refuse to load.
  const tmp = `${dir}/.${Date.now()}-${randomUUID()}.tmp`
  try {
    const mode = await getRemoteFileModeOrDefault(
      remoteFiles,
      remotePath,
      DEFAULT_REMOTE_CONFIG_MODE
    )
    await writeRemoteFile(remoteFiles, tmp, serialized, mode)
    await chmodRemoteFile(remoteFiles, tmp, mode)
    await renameRemoteFile(remoteFiles, tmp, remotePath)
  } finally {
    // Best-effort cleanup if rename failed.
    try {
      await unlinkRemoteFile(remoteFiles, tmp)
    } catch {
      // already gone or never created
    }
  }
}

/** Write the managed hook script to the remote and chmod 0o755. POSIX-only —
 *  the relay deliberately does not support Windows-remote in v1 (see design
 *  doc §3 + §6). */
export async function writeManagedScriptRemote(
  remoteFiles: RemoteFileOperations,
  remotePath: string,
  content: string
): Promise<void> {
  const dir = dirnamePosix(remotePath)
  await mkdirpRemote(remoteFiles, dir)
  try {
    const existing = await readRemoteFile(remoteFiles, remotePath)
    if (existing === content) {
      await chmodRemoteFile(remoteFiles, remotePath, 0o755)
      return
    }
  } catch {
    // ENOENT or read error — fall through to the atomic write below.
  }

  // Why: existing configs may already invoke this script. Write/chmod a temp
  // file first, then rename it into place so interrupted reinstalls do not
  // leave the configured hook path truncated or non-executable.
  const tmp = `${dir}/.${Date.now()}-${randomUUID()}.tmp`
  try {
    await writeRemoteFile(remoteFiles, tmp, content, 0o755)
    await chmodRemoteFile(remoteFiles, tmp, 0o755)
    await renameRemoteFile(remoteFiles, tmp, remotePath)
  } finally {
    try {
      await unlinkRemoteFile(remoteFiles, tmp)
    } catch {
      // already gone or never created
    }
  }
}

export async function readTextFileRemote(
  remoteFiles: RemoteFileOperations,
  remotePath: string
): Promise<string | null> {
  try {
    return await readRemoteFile(remoteFiles, remotePath)
  } catch (err) {
    if (isNoEntryError(err)) {
      return null
    }
    throw err
  }
}

export async function writeTextFileRemoteAtomic(
  remoteFiles: RemoteFileOperations,
  remotePath: string,
  content: string
): Promise<void> {
  const dir = dirnamePosix(remotePath)
  await mkdirpRemote(remoteFiles, dir)
  try {
    const existing = await readRemoteFile(remoteFiles, remotePath)
    if (existing === content) {
      return
    }
  } catch {
    // ENOENT or read error — fall through to the atomic write below.
  }

  const tmp = `${dir}/.${Date.now()}-${randomUUID()}.tmp`
  try {
    const mode = await getRemoteFileModeOrDefault(
      remoteFiles,
      remotePath,
      DEFAULT_REMOTE_CONFIG_MODE
    )
    await writeRemoteFile(remoteFiles, tmp, content, mode)
    await chmodRemoteFile(remoteFiles, tmp, mode)
    await renameRemoteFile(remoteFiles, tmp, remotePath)
  } finally {
    try {
      await unlinkRemoteFile(remoteFiles, tmp)
    } catch {
      // already gone or never created
    }
  }
}
