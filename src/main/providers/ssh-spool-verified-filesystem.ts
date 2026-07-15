import {
  SPOOL_FILE_LIST_VERIFIED_HOST_MAX_LIMIT,
  SPOOL_FILE_LIST_VERIFIED_HOST_PAGE_LIMIT,
  SPOOL_FILE_READ_MAX_BYTES,
  SPOOL_FILE_WRITE_MAX_BYTES
} from '../../shared/spool/spool-operation-contract'
import { isSpoolIncarnationMarkerId } from '../../shared/spool/spool-incarnation-marker-id'
import { hasExactSpoolWireKeys } from '../../shared/spool/spool-exact-wire-record'
import type { SshChannelMultiplexer } from '../ssh/ssh-channel-multiplexer'
import { isMethodNotFoundError } from '../ssh/ssh-filesystem-stream-reader'
import type {
  SpoolVerifiedRemoteFileRead,
  SpoolVerifiedRemoteFilesystem
} from './spool-verified-filesystem-types'

const VERIFIED_IO_UNAVAILABLE =
  'Remote verified file access is unavailable. Reconnect the SSH target and retry.'

export function createSshSpoolVerifiedFilesystem(
  mux: SshChannelMultiplexer
): SpoolVerifiedRemoteFilesystem {
  return {
    inspectDirectoryIdentity: async (directoryPath, signal) => {
      const result = await verifiedRequest(
        mux,
        'fs.spoolInspectDirectoryIdentity',
        { directoryPath },
        signal
      )
      if (
        !isRecord(result) ||
        !hasExactSpoolWireKeys(result, ['canonicalPath', 'deviceId', 'inodeId']) ||
        typeof result.canonicalPath !== 'string' ||
        !result.canonicalPath ||
        typeof result.deviceId !== 'string' ||
        !/^\d+$/u.test(result.deviceId) ||
        typeof result.inodeId !== 'string' ||
        !/^[1-9]\d*$/u.test(result.inodeId)
      ) {
        throw new Error('remote_spool_directory_identity_invalid')
      }
      return {
        canonicalPath: result.canonicalPath,
        deviceId: result.deviceId,
        inodeId: result.inodeId
      }
    },
    readOrCreateIncarnationMarker: async (directoryPath, filename, proposedMarkerId, signal) => {
      const result = await verifiedRequest(
        mux,
        'fs.spoolReadOrCreateIncarnationMarker',
        { directoryPath, filename, proposedMarkerId },
        signal
      )
      if (
        !isRecord(result) ||
        !hasExactSpoolWireKeys(result, ['markerId']) ||
        !isSpoolIncarnationMarkerId(result.markerId)
      ) {
        throw new Error('remote_spool_marker_invalid')
      }
      return result.markerId
    },
    list: async (target, offset, limit, signal) => {
      requireInteger(offset, 0, SPOOL_FILE_LIST_VERIFIED_HOST_MAX_LIMIT)
      requireInteger(limit, 1, SPOOL_FILE_LIST_VERIFIED_HOST_PAGE_LIMIT)
      const result = await verifiedRequest(
        mux,
        'fs.spoolListVerified',
        { target, offset, limit },
        signal
      )
      return parseDirectoryPage(result, offset, limit)
    },
    read: async (target, offset, maxBytes, signal) => {
      requireInteger(offset, 0, Number.MAX_SAFE_INTEGER)
      requireInteger(maxBytes, 1, SPOOL_FILE_READ_MAX_BYTES)
      const result = await verifiedRequest(
        mux,
        'fs.spoolReadVerified',
        { target, offset, maxBytes },
        signal
      )
      return parseReadResult(result, offset, maxBytes)
    },
    write: async (request, signal) => {
      const bytes = Buffer.from(request.bytes)
      if (bytes.byteLength > SPOOL_FILE_WRITE_MAX_BYTES) {
        throw new Error('remote_spool_write_too_large')
      }
      const params =
        request.mode === 'create'
          ? {
              mode: request.mode,
              targetPath: request.targetPath,
              parent: request.parent,
              contentBase64: bytes.toString('base64')
            }
          : {
              mode: request.mode,
              target: request.target,
              parent: request.parent,
              contentBase64: bytes.toString('base64')
            }
      requireOk(await verifiedRequest(mux, 'fs.spoolWriteVerified', params, signal))
    },
    createDirectory: async (targetPath, parent, signal) => {
      requireOk(
        await verifiedRequest(
          mux,
          'fs.spoolCreateDirectoryVerified',
          { targetPath, parent },
          signal
        )
      )
    },
    rename: async (source, sourceParent, destinationPath, destinationParent, signal) => {
      requireOk(
        await verifiedRequest(
          mux,
          'fs.spoolRenameVerified',
          { source, sourceParent, destinationPath, destinationParent },
          signal
        )
      )
    },
    delete: async (target, parent, recursive, signal) => {
      requireOk(
        await verifiedRequest(mux, 'fs.spoolDeleteVerified', { target, parent, recursive }, signal)
      )
    }
  }
}

function parseDirectoryPage(
  value: unknown,
  offset: number,
  limit: number
): {
  entries: readonly { name: string; kind: 'file' | 'directory' | 'symlink' }[]
  nextOffset: number | null
} {
  if (!isRecord(value) || !hasExactSpoolWireKeys(value, ['entries', 'nextOffset'])) {
    throw new Error('remote_spool_list_invalid')
  }
  const { entries, nextOffset } = value
  if (
    !Array.isArray(entries) ||
    entries.length > limit ||
    (nextOffset !== null &&
      (!Number.isSafeInteger(nextOffset) ||
        nextOffset !== offset + entries.length ||
        entries.length !== limit ||
        nextOffset > SPOOL_FILE_LIST_VERIFIED_HOST_MAX_LIMIT))
  ) {
    throw new Error('remote_spool_list_invalid')
  }
  const projected: { name: string; kind: 'file' | 'directory' | 'symlink' }[] = entries.map(
    (entry) => {
      if (
        !isRecord(entry) ||
        !hasExactSpoolWireKeys(entry, ['name', 'kind']) ||
        typeof entry.name !== 'string' ||
        !entry.name ||
        entry.name.length > 4_096 ||
        (entry.kind !== 'file' && entry.kind !== 'directory' && entry.kind !== 'symlink')
      ) {
        throw new Error('remote_spool_list_invalid')
      }
      return { name: entry.name, kind: entry.kind }
    }
  )
  return { entries: projected, nextOffset: nextOffset as number | null }
}

async function verifiedRequest(
  mux: SshChannelMultiplexer,
  method: string,
  params: Record<string, unknown>,
  signal?: AbortSignal
): Promise<unknown> {
  try {
    return await mux.request(method, params, { signal })
  } catch (error) {
    if (isMethodNotFoundError(error)) {
      // Why: an older relay cannot keep validation adjacent to the mutation.
      throw new Error(VERIFIED_IO_UNAVAILABLE)
    }
    throw error
  }
}

function parseReadResult(
  value: unknown,
  offset: number,
  maxBytes: number
): SpoolVerifiedRemoteFileRead {
  if (!isRecord(value) || !hasExactSpoolWireKeys(value, ['contentBase64', 'totalBytes'])) {
    throw new Error('remote_spool_read_invalid')
  }
  const contentBase64 = value.contentBase64
  const totalBytes = value.totalBytes
  if (
    typeof contentBase64 !== 'string' ||
    !Number.isSafeInteger(totalBytes) ||
    (totalBytes as number) < offset
  ) {
    throw new Error('remote_spool_read_invalid')
  }
  const bytes = decodeCanonicalBase64(contentBase64)
  if (bytes.byteLength > maxBytes || offset + bytes.byteLength > (totalBytes as number)) {
    throw new Error('remote_spool_read_invalid')
  }
  return { bytes, totalBytes: totalBytes as number }
}

function decodeCanonicalBase64(value: string): Buffer {
  if (value.length > Math.ceil(SPOOL_FILE_READ_MAX_BYTES / 3) * 4) {
    throw new Error('remote_spool_read_invalid')
  }
  const decoded = Buffer.from(value, 'base64')
  if (decoded.toString('base64') !== value) {
    throw new Error('remote_spool_read_invalid')
  }
  return decoded
}

function requireOk(value: unknown): void {
  if (!isRecord(value) || !hasExactSpoolWireKeys(value, ['ok']) || value.ok !== true) {
    throw new Error('remote_spool_mutation_invalid')
  }
}

function requireInteger(value: number, min: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error('remote_spool_parameter_invalid')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
