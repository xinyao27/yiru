import { constants } from 'node:fs'
import { mkdir, open, opendir, realpath, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { assertNoClobberRenameDestinationAvailable } from '../../shared/filesystem-rename-collision'
import type {
  SpoolVerifiedRemoteExistingPath,
  SpoolVerifiedRemoteFilesystem
} from '../providers/spool-verified-filesystem-types'
import { SpoolExecutionError } from './spool-execution-error'
import type {
  SpoolFileHostEntry,
  SpoolFileHostPage,
  SpoolFileOperationHost,
  SpoolVerifiedFileRead
} from './spool-file-operation-host'
import type { SpoolCanonicalHostPath, SpoolContainedPath } from './spool-worktree-containment'
import {
  localSpoolPathIdentity,
  localStatsIdentity,
  requireSpoolPathIdentity,
  SPOOL_LOCAL_SCOPE_PREFIX,
  SPOOL_SSH_SCOPE_PREFIX,
  spoolFilesystemProvider
} from './spool-yiru-host-paths'

const OPEN_NOFOLLOW = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
const OPEN_DIRECTORY = typeof constants.O_DIRECTORY === 'number' ? constants.O_DIRECTORY : 0

export class YiruSpoolVerifiedFileOperations implements SpoolFileOperationHost {
  async listVerified(
    contained: SpoolContainedPath,
    offset: number,
    limit: number,
    signal: AbortSignal
  ): Promise<SpoolFileHostPage> {
    signal.throwIfAborted()
    const remote = verifiedRemoteFilesystem(contained.root)
    if (remote) {
      return await remote.list(remotePathProof(contained.target), offset, limit, signal)
    }
    const handle = await open(
      contained.target.absolutePath,
      constants.O_RDONLY | OPEN_DIRECTORY | OPEN_NOFOLLOW
    )
    try {
      const before = await handle.stat()
      if (!before.isDirectory()) {
        throw new SpoolExecutionError('resource_not_found')
      }
      requireSpoolPathIdentity(localStatsIdentity(before), contained.target.identity)
      const descriptorBound = process.platform === 'linux'
      if (!descriptorBound) {
        await requireLocalDirectoryPath(contained.target)
      }
      const directory = await opendir(
        descriptorBound ? verifiedDirectoryDescriptorPath(handle.fd) : contained.target.absolutePath
      )
      try {
        if (!descriptorBound) {
          await requireLocalDirectoryPath(contained.target)
        }
        const entries: SpoolFileHostEntry[] = []
        let seen = 0
        for await (const entry of directory) {
          signal.throwIfAborted()
          if (seen < offset) {
            seen += 1
            continue
          }
          entries.push({
            name: entry.name,
            kind: entry.isSymbolicLink() ? 'symlink' : entry.isDirectory() ? 'directory' : 'file'
          })
          if (entries.length > limit) {
            break
          }
        }
        requireSpoolPathIdentity(localStatsIdentity(await handle.stat()), contained.target.identity)
        if (!descriptorBound) {
          // Why: non-Linux Node cannot scandir from a directory handle; keep the
          // complete buffered result behind an identity sandwich instead of streaming it.
          await requireLocalDirectoryPath(contained.target)
        }
        return {
          entries: entries.slice(0, limit),
          nextOffset: entries.length > limit ? offset + limit : null
        }
      } finally {
        await directory.close().catch(() => {})
      }
    } finally {
      await handle.close()
    }
  }

  async readVerified(
    contained: SpoolContainedPath,
    offset: number,
    maxBytes: number,
    signal: AbortSignal
  ): Promise<SpoolVerifiedFileRead> {
    signal.throwIfAborted()
    const remote = verifiedRemoteFilesystem(contained.root)
    if (remote) {
      return remote.read(remotePathProof(contained.target), offset, maxBytes, signal)
    }
    const handle = await open(contained.target.absolutePath, constants.O_RDONLY | OPEN_NOFOLLOW)
    try {
      const stats = await handle.stat()
      requireSpoolPathIdentity(localStatsIdentity(stats), contained.target.identity)
      const buffer = Buffer.alloc(Math.min(maxBytes, Math.max(0, stats.size - offset)))
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset)
      return { bytes: buffer.subarray(0, bytesRead), totalBytes: stats.size }
    } finally {
      await handle.close()
    }
  }

  async writeVerified(
    contained: SpoolContainedPath,
    bytes: Uint8Array<ArrayBufferLike>,
    mode: 'create' | 'replace',
    signal: AbortSignal
  ): Promise<void> {
    signal.throwIfAborted()
    const remote = verifiedRemoteFilesystem(contained.root)
    if (remote) {
      const request =
        mode === 'create'
          ? {
              mode,
              targetPath: contained.target.absolutePath,
              parent: remotePathProof(contained.parent),
              bytes
            }
          : {
              mode,
              target: remotePathProof(contained.target),
              parent: remotePathProof(contained.parent),
              bytes
            }
      await remote.write(request, signal)
      return
    }
    if (mode === 'create') {
      await requireLocalIdentity(contained.parent)
    }
    const flags =
      constants.O_WRONLY |
      OPEN_NOFOLLOW |
      (mode === 'create' ? constants.O_CREAT | constants.O_EXCL : 0)
    const handle = await open(contained.target.absolutePath, flags)
    try {
      const stats = await handle.stat()
      if (!stats.isFile()) {
        throw new SpoolExecutionError('resource_not_found')
      }
      if (mode === 'replace') {
        requireSpoolPathIdentity(localStatsIdentity(stats), contained.target.identity)
        // Why: truncation must happen only after the open handle matches the granted file.
        await handle.truncate(0)
      }
      await handle.writeFile(bytes)
    } finally {
      await handle.close()
    }
  }

  async createDirectoryVerified(contained: SpoolContainedPath, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    const remote = verifiedRemoteFilesystem(contained.root)
    if (remote) {
      await remote.createDirectory(
        contained.target.absolutePath,
        remotePathProof(contained.parent),
        signal
      )
      return
    }
    await requireLocalIdentity(contained.parent)
    await mkdir(contained.target.absolutePath, { recursive: false })
  }

  async renameVerified(
    source: SpoolContainedPath,
    destination: SpoolContainedPath,
    signal: AbortSignal
  ): Promise<void> {
    signal.throwIfAborted()
    const remote = verifiedRemoteFilesystem(source.root)
    if (remote) {
      await remote.rename(
        remotePathProof(source.target),
        remotePathProof(source.parent),
        destination.target.absolutePath,
        remotePathProof(destination.parent),
        signal
      )
      return
    }
    await Promise.all([
      requireLocalIdentity(source.target),
      requireLocalIdentity(source.parent),
      requireLocalIdentity(destination.parent)
    ])
    await assertNoClobberRenameDestinationAvailable(
      source.target.absolutePath,
      destination.target.absolutePath
    )
    await rename(source.target.absolutePath, destination.target.absolutePath)
  }

  async deleteVerified(
    contained: SpoolContainedPath,
    recursive: boolean,
    signal: AbortSignal
  ): Promise<void> {
    signal.throwIfAborted()
    const remote = verifiedRemoteFilesystem(contained.root)
    if (remote) {
      await remote.delete(
        remotePathProof(contained.target),
        remotePathProof(contained.parent),
        recursive,
        signal
      )
      return
    }
    await Promise.all([
      requireLocalIdentity(contained.target),
      requireLocalIdentity(contained.parent)
    ])
    await rm(contained.target.absolutePath, { recursive, force: false })
  }
}

function verifiedRemoteFilesystem(
  root: SpoolCanonicalHostPath
): SpoolVerifiedRemoteFilesystem | null {
  if (root.scopeKey.startsWith(SPOOL_LOCAL_SCOPE_PREFIX)) {
    return null
  }
  if (!root.scopeKey.startsWith(SPOOL_SSH_SCOPE_PREFIX)) {
    throw new SpoolExecutionError('resource_unavailable')
  }
  const verified = spoolFilesystemProvider(root)?.spoolVerifiedFiles
  if (!verified) {
    // Why: an old or disconnected relay cannot safely emulate handle-bound operations.
    throw new SpoolExecutionError('resource_unavailable')
  }
  return verified
}

function remotePathProof(pathValue: SpoolCanonicalHostPath): SpoolVerifiedRemoteExistingPath {
  if (!pathValue.identity) {
    throw new SpoolExecutionError('resource_unavailable')
  }
  return {
    path: pathValue.absolutePath,
    expectedRealPath: pathValue.absolutePath,
    expectedStatIdentity: pathValue.identity
  }
}

async function requireLocalIdentity(pathValue: SpoolCanonicalHostPath): Promise<void> {
  requireSpoolPathIdentity(await localSpoolPathIdentity(pathValue.absolutePath), pathValue.identity)
}

function verifiedDirectoryDescriptorPath(fd: number): string {
  return join('/proc/self/fd', String(fd))
}

async function requireLocalDirectoryPath(pathValue: SpoolCanonicalHostPath): Promise<void> {
  if ((await realpath(pathValue.absolutePath)) !== pathValue.absolutePath) {
    throw new SpoolExecutionError('resource_not_found')
  }
  await requireLocalIdentity(pathValue)
}
