import { z } from 'zod'
import type {
  SpoolFileDiffResult,
  SpoolFileListResult,
  SpoolFileReadResult,
  SpoolGitDiffResult,
  SpoolGitHistoryResult,
  SpoolGitStatusResult,
  SpoolMutationResult
} from '../../../../shared/spool/spool-operation-contract'

const MAX_PATH_CHARS = 32_768
const MAX_OWNER_TEXT_CHARS = 6 * 1_024 * 1_024
const pathText = z.string().max(MAX_PATH_CHARS)
const finiteNullableNumber = z.number().finite().nullable()
const safeCount = z.number().int().nonnegative().safe()
const exactMutation = z.object({ ok: z.literal(true) }).strict()

const fileListSchema = z
  .object({
    relativePath: pathText,
    entries: z
      .array(
        z
          .object({
            relativePath: pathText,
            name: z.string().min(1).max(4_096),
            kind: z.enum(['file', 'directory', 'symlink']),
            size: finiteNullableNumber,
            modifiedAt: finiteNullableNumber
          })
          .strict()
      )
      .max(5_000),
    truncated: z.boolean()
  })
  .strict()

const fileReadSchema = z
  .object({
    relativePath: pathText,
    encoding: z.enum(['utf8', 'base64']),
    content: z.string().max(3 * 1_024 * 1_024),
    offset: safeCount,
    bytesRead: safeCount,
    totalBytes: safeCount,
    truncated: z.boolean()
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.offset + value.bytesRead > value.totalBytes ||
      value.truncated !== value.offset + value.bytesRead < value.totalBytes
    ) {
      context.addIssue({ code: 'custom' })
    }
    if (value.encoding === 'base64' && !isCanonicalBase64(value.content, value.bytesRead)) {
      context.addIssue({ code: 'custom' })
    }
    if (
      value.encoding === 'utf8' &&
      new TextEncoder().encode(value.content).byteLength !== value.bytesRead
    ) {
      context.addIssue({ code: 'custom' })
    }
  })

const fileDiffSchema = z
  .object({
    relativePath: pathText,
    staged: z.boolean(),
    patch: z.string().max(MAX_OWNER_TEXT_CHARS),
    truncated: z.boolean()
  })
  .strict()

const gitStatusSchema = z
  .object({
    branch: z.string().max(4_096).nullable(),
    upstream: z
      .object({ name: z.string().max(4_096), ahead: safeCount, behind: safeCount })
      .strict()
      .nullable(),
    entries: z
      .array(
        z
          .object({
            relativePath: pathText,
            oldRelativePath: pathText.optional(),
            status: z.enum(['modified', 'added', 'deleted', 'renamed', 'untracked', 'copied']),
            area: z.enum(['staged', 'unstaged', 'untracked']),
            conflicted: z.boolean().optional()
          })
          .strict()
      )
      .max(20_000),
    truncated: z.boolean()
  })
  .strict()

const gitDiffSchema = z
  .object({
    source: z.enum(['working-tree', 'index', 'commit']),
    relativePath: pathText.nullable(),
    patch: z.string().max(MAX_OWNER_TEXT_CHARS),
    truncated: z.boolean()
  })
  .strict()

const gitHistorySchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            commitRef: z.string().min(1).max(4_096),
            parentRefs: z.array(z.string().min(1).max(4_096)).max(256),
            subject: z.string().max(64 * 1_024),
            message: z.string().max(MAX_OWNER_TEXT_CHARS),
            author: z.string().max(4_096).nullable(),
            committedAt: finiteNullableNumber
          })
          .strict()
      )
      .max(200),
    hasMore: z.boolean()
  })
  .strict()

export function parseSpoolFileListResult(value: unknown): SpoolFileListResult {
  return fileListSchema.parse(value)
}

export function parseSpoolFileReadResult(value: unknown): SpoolFileReadResult {
  return fileReadSchema.parse(value)
}

export function parseSpoolFileDiffResult(value: unknown): SpoolFileDiffResult {
  return fileDiffSchema.parse(value)
}

export function parseSpoolGitStatusResult(value: unknown): SpoolGitStatusResult {
  return gitStatusSchema.parse(value)
}

export function parseSpoolGitDiffResult(value: unknown): SpoolGitDiffResult {
  return gitDiffSchema.parse(value)
}

export function parseSpoolGitHistoryResult(value: unknown): SpoolGitHistoryResult {
  return gitHistorySchema.parse(value)
}

export function parseSpoolMutationResult(value: unknown): SpoolMutationResult {
  return exactMutation.parse(value)
}

function isCanonicalBase64(value: string, expectedBytes: number): boolean {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return false
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return (value.length / 4) * 3 - padding === expectedBytes
}
