import type {
  SpoolExecutionOperation,
  SpoolFileListResult,
  SpoolFileReadResult,
  SpoolMutationResult
} from '../../shared/spool/spool-operation-contract'
import {
  SPOOL_FILE_LIST_DEFAULT_LIMIT,
  SPOOL_FILE_LIST_MAX_LIMIT,
  SPOOL_FILE_READ_DEFAULT_BYTES,
  SPOOL_FILE_READ_MAX_BYTES
} from '../../shared/spool/spool-operation-contract'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-publication-state'
import type { ExecutionAdmissionGuard } from './spool-execution-gateway'
import { asSpoolExecutionError, SpoolExecutionError } from './spool-execution-error'
import { decodeSpoolFileBytes, decodeSpoolFileWriteContent } from './spool-file-content-codec'
import type { SpoolFileOperationHost } from './spool-file-operation-host'
import { listVisibleSpoolFiles } from './spool-visible-file-listing'
import type { SpoolContainedPath } from './spool-worktree-containment'
import {
  normalizeSpoolRelativePath,
  type SpoolWorktreeContainment
} from './spool-worktree-containment'

type SpoolFileOperation = Extract<
  SpoolExecutionOperation,
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

export class SpoolFileOperationExecutor {
  constructor(
    private readonly containment: SpoolWorktreeContainment,
    private readonly host: SpoolFileOperationHost
  ) {}

  supports(operation: SpoolExecutionOperation): operation is SpoolFileOperation {
    return operation.kind.startsWith('files.') && operation.kind !== 'files.diff'
  }

  async invoke(
    target: SpoolPublicWorktreeInstance,
    operation: SpoolFileOperation,
    signal: AbortSignal,
    admissionGuard?: ExecutionAdmissionGuard
  ): Promise<SpoolFileListResult | SpoolFileReadResult | SpoolMutationResult> {
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
      throw asSpoolExecutionError(error)
    }
  }

  private async list(
    target: SpoolPublicWorktreeInstance,
    relativePath: string,
    requestedLimit: number | undefined,
    signal: AbortSignal
  ): Promise<SpoolFileListResult> {
    const normalized = normalizeSpoolRelativePath(relativePath, true)
    const path = await this.containment.bindExisting(target.ownerWorktree, normalized, {
      allowRoot: true
    })
    await requireRevalidation(path)
    const limit = boundedInteger(
      requestedLimit,
      SPOOL_FILE_LIST_DEFAULT_LIMIT,
      1,
      SPOOL_FILE_LIST_MAX_LIMIT
    )
    return await listVisibleSpoolFiles({
      host: this.host,
      path,
      relativePath: normalized,
      limit,
      signal
    })
  }

  private async read(
    target: SpoolPublicWorktreeInstance,
    relativePath: string,
    requestedOffset: number | undefined,
    requestedBytes: number | undefined,
    signal: AbortSignal
  ): Promise<SpoolFileReadResult> {
    const normalized = normalizeSpoolRelativePath(relativePath)
    const path = await this.containment.bindExisting(target.ownerWorktree, normalized)
    await requireRevalidation(path)
    const offset = boundedInteger(requestedOffset, 0, 0, Number.MAX_SAFE_INTEGER)
    const maxBytes = boundedInteger(
      requestedBytes,
      SPOOL_FILE_READ_DEFAULT_BYTES,
      1,
      SPOOL_FILE_READ_MAX_BYTES
    )
    const result = await this.host.readVerified(path, offset, maxBytes, signal)
    if (
      result.bytes.byteLength > maxBytes ||
      !Number.isSafeInteger(result.totalBytes) ||
      result.totalBytes < offset + result.bytes.byteLength
    ) {
      throw new SpoolExecutionError('result_too_large')
    }
    const text = decodeSpoolFileBytes(result.bytes)
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
    target: SpoolPublicWorktreeInstance,
    operation: Extract<SpoolExecutionOperation, { kind: 'files.write' }>,
    guard: ExecutionAdmissionGuard,
    signal: AbortSignal
  ): Promise<SpoolMutationResult> {
    const bytes = decodeSpoolFileWriteContent(operation.content, operation.encoding)
    const path =
      operation.mode === 'create'
        ? await this.containment.bindForCreate(target.ownerWorktree, operation.relativePath)
        : await this.containment.bindExisting(target.ownerWorktree, operation.relativePath)
    if (operation.mode === 'create' && path.exists) {
      throw new SpoolExecutionError('invalid_argument')
    }
    await requireRevalidation(path)
    await guard.beforeSideEffect()
    await this.host.writeVerified(path, bytes, operation.mode, signal)
    return { ok: true }
  }

  private async mkdir(
    target: SpoolPublicWorktreeInstance,
    relativePath: string,
    guard: ExecutionAdmissionGuard,
    signal: AbortSignal
  ): Promise<SpoolMutationResult> {
    const path = await this.containment.bindForCreate(target.ownerWorktree, relativePath)
    if (path.exists) {
      throw new SpoolExecutionError('invalid_argument')
    }
    await requireRevalidation(path)
    await guard.beforeSideEffect()
    await this.host.createDirectoryVerified(path, signal)
    return { ok: true }
  }

  private async rename(
    target: SpoolPublicWorktreeInstance,
    operation: Extract<SpoolExecutionOperation, { kind: 'files.rename' }>,
    guard: ExecutionAdmissionGuard,
    signal: AbortSignal
  ): Promise<SpoolMutationResult> {
    const [source, destination] = await Promise.all([
      this.containment.bindExisting(target.ownerWorktree, operation.relativePath),
      this.containment.bindForCreate(target.ownerWorktree, operation.destinationRelativePath)
    ])
    if (destination.exists) {
      throw new SpoolExecutionError('invalid_argument')
    }
    await Promise.all([requireRevalidation(source), requireRevalidation(destination)])
    await guard.beforeSideEffect()
    await this.host.renameVerified(source, destination, signal)
    return { ok: true }
  }

  private async delete(
    target: SpoolPublicWorktreeInstance,
    operation: Extract<SpoolExecutionOperation, { kind: 'files.delete' }>,
    guard: ExecutionAdmissionGuard,
    signal: AbortSignal
  ): Promise<SpoolMutationResult> {
    const path = await this.containment.bindExisting(target.ownerWorktree, operation.relativePath)
    await requireRevalidation(path)
    await guard.beforeSideEffect()
    await this.host.deleteVerified(path, operation.recursive === true, signal)
    return { ok: true }
  }
}

async function requireRevalidation(path: SpoolContainedPath): Promise<void> {
  if (!(await path.revalidate())) {
    throw new SpoolExecutionError('resource_not_found')
  }
}

function requireGuard(guard: ExecutionAdmissionGuard | undefined): ExecutionAdmissionGuard {
  if (!guard) {
    throw new SpoolExecutionError('unauthorized')
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
    throw new SpoolExecutionError('invalid_argument')
  }
  return Math.min(max, value)
}
