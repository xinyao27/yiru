import type {
  CoworkingExecutionOperation,
  CoworkingFileListResult,
  CoworkingFileReadResult,
  CoworkingMutationResult
} from '~shared/coworking/operation-contract'
import {
  COWORKING_FILE_LIST_DEFAULT_LIMIT,
  COWORKING_FILE_LIST_MAX_LIMIT,
  COWORKING_FILE_READ_DEFAULT_BYTES,
  COWORKING_FILE_READ_MAX_BYTES
} from '~shared/coworking/operation-contract'
import { getCoworkingResourceQuota } from '~shared/coworking/resource-limits'

import { asCoworkingExecutionError, CoworkingExecutionError } from './execution-error'
import type { ExecutionAdmissionGuard } from './execution-gateway'
import { decodeCoworkingFileBytes, decodeCoworkingFileWriteContent } from './file-content-codec'
import type { CoworkingFileOperationHost } from './file-operation-host'
import { listVisibleCoworkingFiles } from './visible-file-listing'
import type { CoworkingContainedPath } from './worktree-containment'
import {
  normalizeCoworkingRelativePath,
  type CoworkingWorktreeContainment
} from './worktree-containment'
import type { CoworkingPublicWorktreeInstance } from './worktree-publication-state'

type CoworkingFileOperation = Extract<
  CoworkingExecutionOperation,
  {
    kind:
      | 'files.list'
      | 'files.read'
      | 'files.write'
      | 'files.mkdir'
      | 'files.rename'
      | 'files.delete'
  }
>

export class CoworkingFileOperationExecutor {
  constructor(
    private readonly containment: CoworkingWorktreeContainment,
    private readonly host: CoworkingFileOperationHost
  ) {}

  supports(operation: CoworkingExecutionOperation): operation is CoworkingFileOperation {
    return operation.kind.startsWith('files.') && operation.kind !== 'files.diff'
  }

  async invoke(
    target: CoworkingPublicWorktreeInstance,
    operation: CoworkingFileOperation,
    signal: AbortSignal,
    admissionGuard?: ExecutionAdmissionGuard
  ): Promise<CoworkingFileListResult | CoworkingFileReadResult | CoworkingMutationResult> {
    try {
      switch (operation.kind) {
        case 'files.list':
          return await this.list(target, operation.relativePath, operation.limit, signal)
        case 'files.read':
          return await this.read(
            target,
            operation.relativePath,
            operation.offset,
            operation.maxBytes,
            signal
          )
        case 'files.write':
          return await this.write(target, operation, requireGuard(admissionGuard), signal)
        case 'files.mkdir':
          return await this.mkdir(
            target,
            operation.relativePath,
            requireGuard(admissionGuard),
            signal
          )
        case 'files.rename':
          return await this.rename(target, operation, requireGuard(admissionGuard), signal)
        case 'files.delete':
          return await this.delete(target, operation, requireGuard(admissionGuard), signal)
      }
    } catch (error) {
      throw asCoworkingExecutionError(error)
    }
  }

  private async list(
    target: CoworkingPublicWorktreeInstance,
    relativePath: string,
    requestedLimit: number | undefined,
    signal: AbortSignal
  ): Promise<CoworkingFileListResult> {
    const normalized = normalizeCoworkingRelativePath(relativePath, true)
    const path = await this.containment.bindExisting(target.ownerWorktree, normalized, {
      allowRoot: true
    })
    await requireRevalidation(path)
    const limit = boundedInteger(
      requestedLimit,
      COWORKING_FILE_LIST_DEFAULT_LIMIT,
      1,
      COWORKING_FILE_LIST_MAX_LIMIT
    )
    return await listVisibleCoworkingFiles({
      host: this.host,
      path,
      relativePath: normalized,
      limit,
      signal
    })
  }

  private async read(
    target: CoworkingPublicWorktreeInstance,
    relativePath: string,
    requestedOffset: number | undefined,
    requestedBytes: number | undefined,
    signal: AbortSignal
  ): Promise<CoworkingFileReadResult> {
    const normalized = normalizeCoworkingRelativePath(relativePath)
    const path = await this.containment.bindExisting(target.ownerWorktree, normalized)
    await requireRevalidation(path)
    const offset = boundedInteger(requestedOffset, 0, 0, Number.MAX_SAFE_INTEGER)
    const requestedMaxBytes = boundedInteger(
      requestedBytes,
      COWORKING_FILE_READ_DEFAULT_BYTES,
      1,
      COWORKING_FILE_READ_MAX_BYTES
    )
    const readQuota = getCoworkingResourceQuota('worktree', 'read').fileReadMaxBytes
    if (offset >= readQuota) {
      throw new CoworkingExecutionError('invalid_argument')
    }
    const maxBytes = Math.min(requestedMaxBytes, readQuota - offset)
    const result = await this.host.readVerified(path, offset, maxBytes, signal)
    if (
      result.bytes.byteLength > maxBytes ||
      !Number.isSafeInteger(result.totalBytes) ||
      result.totalBytes < offset + result.bytes.byteLength
    ) {
      throw new CoworkingExecutionError('result_too_large')
    }
    const text = decodeCoworkingFileBytes(result.bytes)
    return {
      relativePath: normalized,
      encoding: text === null ? 'base64' : 'utf8',
      content: text ?? Buffer.from(result.bytes).toString('base64'),
      offset,
      bytesRead: result.bytes.byteLength,
      totalBytes: result.totalBytes,
      truncated: offset + result.bytes.byteLength < result.totalBytes
    }
  }

  private async write(
    target: CoworkingPublicWorktreeInstance,
    operation: Extract<CoworkingExecutionOperation, { kind: 'files.write' }>,
    guard: ExecutionAdmissionGuard,
    signal: AbortSignal
  ): Promise<CoworkingMutationResult> {
    const bytes = decodeCoworkingFileWriteContent(operation.content, operation.encoding)
    const path =
      operation.mode === 'create'
        ? await this.containment.bindForCreate(target.ownerWorktree, operation.relativePath)
        : await this.containment.bindExisting(target.ownerWorktree, operation.relativePath)
    if (operation.mode === 'create' && path.exists) {
      throw new CoworkingExecutionError('invalid_argument')
    }
    await requireRevalidation(path)
    await guard.beforeSideEffect()
    await this.host.writeVerified(path, bytes, operation.mode, signal)
    return { ok: true }
  }

  private async mkdir(
    target: CoworkingPublicWorktreeInstance,
    relativePath: string,
    guard: ExecutionAdmissionGuard,
    signal: AbortSignal
  ): Promise<CoworkingMutationResult> {
    const path = await this.containment.bindForCreate(target.ownerWorktree, relativePath)
    if (path.exists) {
      throw new CoworkingExecutionError('invalid_argument')
    }
    await requireRevalidation(path)
    await guard.beforeSideEffect()
    await this.host.createDirectoryVerified(path, signal)
    return { ok: true }
  }

  private async rename(
    target: CoworkingPublicWorktreeInstance,
    operation: Extract<CoworkingExecutionOperation, { kind: 'files.rename' }>,
    guard: ExecutionAdmissionGuard,
    signal: AbortSignal
  ): Promise<CoworkingMutationResult> {
    const [source, destination] = await Promise.all([
      this.containment.bindExisting(target.ownerWorktree, operation.relativePath),
      this.containment.bindForCreate(target.ownerWorktree, operation.destinationRelativePath)
    ])
    if (destination.exists) {
      throw new CoworkingExecutionError('invalid_argument')
    }
    await Promise.all([requireRevalidation(source), requireRevalidation(destination)])
    await guard.beforeSideEffect()
    await this.host.renameVerified(source, destination, signal)
    return { ok: true }
  }

  private async delete(
    target: CoworkingPublicWorktreeInstance,
    operation: Extract<CoworkingExecutionOperation, { kind: 'files.delete' }>,
    guard: ExecutionAdmissionGuard,
    signal: AbortSignal
  ): Promise<CoworkingMutationResult> {
    const path = await this.containment.bindExisting(target.ownerWorktree, operation.relativePath)
    await requireRevalidation(path)
    await guard.beforeSideEffect()
    await this.host.deleteVerified(path, operation.recursive === true, signal)
    return { ok: true }
  }
}

async function requireRevalidation(path: CoworkingContainedPath): Promise<void> {
  if (!(await path.revalidate())) {
    throw new CoworkingExecutionError('resource_not_found')
  }
}

function requireGuard(guard: ExecutionAdmissionGuard | undefined): ExecutionAdmissionGuard {
  if (!guard) {
    throw new CoworkingExecutionError('unauthorized')
  }
  return guard
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (value === undefined) {
    return fallback
  }
  if (!Number.isSafeInteger(value) || value < min) {
    throw new CoworkingExecutionError('invalid_argument')
  }
  return Math.min(max, value)
}
