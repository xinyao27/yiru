import { z } from 'zod'
import type { SpoolExecutionOperation } from './spool-operation-contract'

const boundedText = z.string().max(8 * 1_024 * 1_024)
const pathText = z.string().max(32_768)
const nullableNumber = z.number().finite().nullable()

export const SpoolPairedRuntimeCanonicalPathSchema = z
  .object({
    scopeKey: z.string().min(1).max(4_096),
    rootKey: z.string().min(1).max(32_768),
    ancestorKeys: z.array(z.string().min(1).max(32_768)).max(2_048)
  })
  .strict()

export const SpoolPairedRuntimeInspectionSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('resolved'),
      root: SpoolPairedRuntimeCanonicalPathSchema,
      markerId: z.string().uuid().nullable()
    })
    .strict(),
  z
    .object({
      status: z.literal('unavailable'),
      reason: z.enum([
        'ambiguous-root',
        'host-unavailable',
        'invalid-host-response',
        'marker-unavailable',
        'not-git-worktree'
      ])
    })
    .strict()
])

export const SpoolPairedRuntimeCanonicalizeResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('resolved'), path: SpoolPairedRuntimeCanonicalPathSchema }).strict(),
  z.object({ status: z.literal('missing') }).strict(),
  z.object({ status: z.literal('unavailable') }).strict()
])

export const SpoolPairedRuntimeErrorCodeSchema = z.enum([
  'invalid_argument',
  'method_not_found',
  'outcome_unknown',
  'resource_busy',
  'resource_not_found',
  'resource_unavailable',
  'result_too_large',
  'unauthorized',
  'internal_error'
])

export const SpoolPairedRuntimeInvokeResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), result: z.unknown() }).strict(),
  z.object({ status: z.literal('error'), code: SpoolPairedRuntimeErrorCodeSchema }).strict()
])

const mutationResult = z.object({ ok: z.literal(true) }).strict()
const fileListResult = z
  .object({
    relativePath: pathText,
    entries: z
      .array(
        z
          .object({
            relativePath: pathText,
            name: z.string().max(4_096),
            kind: z.enum(['file', 'directory', 'symlink']),
            size: nullableNumber,
            modifiedAt: nullableNumber
          })
          .strict()
      )
      .max(5_000),
    truncated: z.boolean()
  })
  .strict()
const fileReadResult = z
  .object({
    relativePath: pathText,
    encoding: z.enum(['utf8', 'base64']),
    content: boundedText,
    offset: z.number().int().nonnegative().safe(),
    bytesRead: z.number().int().nonnegative().safe(),
    totalBytes: z.number().int().nonnegative().safe(),
    truncated: z.boolean()
  })
  .strict()
const fileDiffResult = z
  .object({
    relativePath: pathText,
    staged: z.boolean(),
    patch: boundedText,
    truncated: z.boolean()
  })
  .strict()
const gitStatusResult = z
  .object({
    branch: z.string().max(4_096).nullable(),
    upstream: z
      .object({
        name: z.string().max(4_096),
        ahead: z.number().int().nonnegative().safe(),
        behind: z.number().int().nonnegative().safe()
      })
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
const gitDiffResult = z
  .object({
    source: z.enum(['working-tree', 'index', 'commit']),
    relativePath: pathText.nullable(),
    patch: boundedText,
    truncated: z.boolean()
  })
  .strict()
const gitHistoryResult = z
  .object({
    entries: z
      .array(
        z
          .object({
            commitRef: z.string().min(1).max(4_096),
            parentRefs: z.array(z.string().min(1).max(4_096)).max(256),
            subject: boundedText,
            message: boundedText,
            author: z.string().max(4_096).nullable(),
            committedAt: nullableNumber
          })
          .strict()
      )
      .max(200),
    hasMore: z.boolean()
  })
  .strict()

const transcriptBlock = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: boundedText }).strict(),
  z.object({ type: z.literal('tool-call'), name: boundedText, input: boundedText }).strict(),
  z.object({ type: z.literal('tool-result'), output: boundedText, isError: z.boolean() }).strict(),
  z.object({ type: z.literal('image'), alt: boundedText.nullable() }).strict()
])
const sessionReadResult = z
  .object({
    messages: z
      .array(
        z
          .object({
            role: z.enum(['user', 'assistant', 'tool', 'reasoning', 'system']),
            blocks: z.array(transcriptBlock).max(10_000),
            timestamp: nullableNumber
          })
          .strict()
      )
      .max(2_000),
    truncated: z.boolean()
  })
  .strict()

export const SpoolPairedRuntimeTerminalEventSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('snapshot'),
      data: boundedText,
      cols: z.number().int().positive().max(1_000),
      rows: z.number().int().positive().max(1_000),
      sequence: z.number().int().positive().safe()
    })
    .strict(),
  z
    .object({
      kind: z.literal('output'),
      data: boundedText,
      sequence: z.number().int().positive().safe()
    })
    .strict(),
  z
    .object({
      kind: z.literal('resized'),
      cols: z.number().int().positive().max(1_000),
      rows: z.number().int().positive().max(1_000),
      sequence: z.number().int().positive().safe()
    })
    .strict(),
  z.object({ kind: z.literal('closed') }).strict()
])

export function parseSpoolPairedRuntimeResult(
  operation: SpoolExecutionOperation,
  value: unknown
): unknown {
  switch (operation.kind) {
    case 'files.list':
      return fileListResult.parse(value)
    case 'files.read':
      return fileReadResult.parse(value)
    case 'files.diff':
      return fileDiffResult.parse(value)
    case 'git.status':
      return gitStatusResult.parse(value)
    case 'git.diff':
      return gitDiffResult.parse(value)
    case 'git.history':
      return gitHistoryResult.parse(value)
    case 'session.read':
      return sessionReadResult.parse(value)
    case 'files.write':
    case 'files.mkdir':
    case 'files.rename':
    case 'files.delete':
    case 'git.stage':
    case 'git.unstage':
    case 'git.commit':
    case 'terminal.input':
    case 'terminal.resize':
    case 'session.continue':
      return mutationResult.parse(value)
  }
}
