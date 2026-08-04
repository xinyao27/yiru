import { constants } from 'node:fs'
import { mkdir, open, opendir, realpath, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { assertNoClobberRenameDestinationAvailable } from '~shared/filesystem-rename-collision'

import { CoworkingExecutionError } from './execution-error'
import type {
  CoworkingFileHostEntry,
  CoworkingFileHostPage,
  CoworkingFileOperationHost,
  CoworkingVerifiedFileRead
} from './file-operation-host'
import type { CoworkingCanonicalHostPath, CoworkingContainedPath } from './worktree-containment'
import {
  localCoworkingPathIdentity,
  localStatsIdentity,
  requireCoworkingPathIdentity
} from './yiru-host/paths'

const OPEN_NOFOLLOW = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
const OPEN_DIRECTORY = typeof constants.O_DIRECTORY === 'number' ? constants.O_DIRECTORY : 0

export class YiruCoworkingVerifiedFileOperations implements CoworkingFileOperationHost {
  async listVerified(
    contained: CoworkingContainedPath,
    offset: number,
    limit: number,
    signal: AbortSignal
  ): Promise<CoworkingFileHostPage> {
    signal.throwIfAborted()
    const handle = await open(
      contained.target.absolutePath,
      constants.O_RDONLY | OPEN_DIRECTORY | OPEN_NOFOLLOW
    )
    try {
      const before = await handle.stat()
      if (!before.isDirectory()) {
        throw new CoworkingExecutionError('resource_not_found')
      }
      requireCoworkingPathIdentity(localStatsIdentity(before), contained.target.identity)
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
        const entries: CoworkingFileHostEntry[] = []
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
        requireCoworkingPathIdentity(
          localStatsIdentity(await handle.stat()),
          contained.target.identity
        )
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
    contained: CoworkingContainedPath,
    offset: number,
    maxBytes: number,
    signal: AbortSignal
  ): Promise<CoworkingVerifiedFileRead> {
    signal.throwIfAborted()
    const handle = await open(contained.target.absolutePath, constants.O_RDONLY | OPEN_NOFOLLOW)
    try {
      const stats = await handle.stat()
      requireCoworkingPathIdentity(localStatsIdentity(stats), contained.target.identity)
      const buffer = Buffer.alloc(Math.min(maxBytes, Math.max(0, stats.size - offset)))
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset)
      return { bytes: buffer.subarray(0, bytesRead), totalBytes: stats.size }
    } finally {
      await handle.close()
    }
  }

  async writeVerified(
    contained: CoworkingContainedPath,
    bytes: Uint8Array<ArrayBufferLike>,
    mode: 'create' | 'replace',
    signal: AbortSignal
  ): Promise<void> {
    signal.throwIfAborted()
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
        throw new CoworkingExecutionError('resource_not_found')
      }
      if (mode === 'replace') {
        requireCoworkingPathIdentity(localStatsIdentity(stats), contained.target.identity)
        // Why: truncation must happen only after the open handle matches the granted file.
        await handle.truncate(0)
      }
      await handle.writeFile(bytes)
    } finally {
      await handle.close()
    }
  }

  async createDirectoryVerified(
    contained: CoworkingContainedPath,
    signal: AbortSignal
  ): Promise<void> {
    signal.throwIfAborted()
    await requireLocalIdentity(contained.parent)
    await mkdir(contained.target.absolutePath, { recursive: false })
  }

  async renameVerified(
    source: CoworkingContainedPath,
    destination: CoworkingContainedPath,
    signal: AbortSignal
  ): Promise<void> {
    signal.throwIfAborted()
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
    contained: CoworkingContainedPath,
    recursive: boolean,
    signal: AbortSignal
  ): Promise<void> {
    signal.throwIfAborted()
    await Promise.all([
      requireLocalIdentity(contained.target),
      requireLocalIdentity(contained.parent)
    ])
    await rm(contained.target.absolutePath, { recursive, force: false })
  }
}

async function requireLocalIdentity(pathValue: CoworkingCanonicalHostPath): Promise<void> {
  requireCoworkingPathIdentity(
    await localCoworkingPathIdentity(pathValue.absolutePath),
    pathValue.identity
  )
}

function verifiedDirectoryDescriptorPath(fd: number): string {
  return join('/proc/self/fd', String(fd))
}

async function requireLocalDirectoryPath(pathValue: CoworkingCanonicalHostPath): Promise<void> {
  if ((await realpath(pathValue.absolutePath)) !== pathValue.absolutePath) {
    throw new CoworkingExecutionError('resource_not_found')
  }
  await requireLocalIdentity(pathValue)
}
