import { z } from 'zod'
import { SpoolAgentLaunchIdSchema } from './spool-agent-launch-contract'
import { SpoolChecksReadResultSchema } from './spool-checks-result-schema'
import type {
  SpoolChecksReadResult,
  SpoolExecutionOperation,
  SpoolFileDiffResult,
  SpoolFileListResult,
  SpoolFileReadResult,
  SpoolGitDiffResult,
  SpoolGitHistoryResult,
  SpoolGitStatusResult,
  SpoolMutationResult,
  SpoolSessionContinueHostResult,
  SpoolTerminalCreateHostResult,
  SpoolTerminalLaunchOptionsResult
} from './spool-operation-contract'

const MAX_PATH_CHARS = 32_768
const MAX_PROJECTED_TEXT_CHARS = 6 * 1_024 * 1_024
const pathText = z.string().max(MAX_PATH_CHARS)
const finiteNullableNumber = z.number().finite().nullable()
const safeCount = z.number().int().nonnegative().safe()

export const SpoolMutationResultSchema = z.object({ ok: z.literal(true) }).strict()

export const SpoolFileListResultSchema = z
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

export const SpoolFileReadResultSchema = z
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

export const SpoolFileDiffResultSchema = z
  .object({
    relativePath: pathText,
    staged: z.boolean(),
    patch: z.string().max(MAX_PROJECTED_TEXT_CHARS),
    truncated: z.boolean()
  })
  .strict()

export const SpoolGitStatusResultSchema = z
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

export const SpoolGitDiffResultSchema = z
  .object({
    source: z.enum(['working-tree', 'index', 'commit']),
    relativePath: pathText.nullable(),
    patch: z.string().max(MAX_PROJECTED_TEXT_CHARS),
    truncated: z.boolean()
  })
  .strict()

export const SpoolGitHistoryResultSchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            commitRef: z.string().min(1).max(4_096),
            parentRefs: z.array(z.string().min(1).max(4_096)).max(256),
            subject: z.string().max(MAX_PROJECTED_TEXT_CHARS),
            message: z.string().max(MAX_PROJECTED_TEXT_CHARS),
            author: z.string().max(4_096).nullable(),
            committedAt: finiteNullableNumber
          })
          .strict()
      )
      .max(200),
    hasMore: z.boolean()
  })
  .strict()

export const SpoolTerminalLaunchOptionsResultSchema = z
  .object({
    agents: z.array(SpoolAgentLaunchIdSchema).max(64),
    defaultAgent: SpoolAgentLaunchIdSchema.nullable()
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.agents).size !== value.agents.length) {
      context.addIssue({ code: 'custom' })
    }
    if (value.defaultAgent !== null && !value.agents.includes(value.defaultAgent)) {
      context.addIssue({ code: 'custom' })
    }
  })

export const SpoolTerminalCreateHostResultSchema = z
  .object({
    terminalHandle: boundedIdentity(2_048),
    sessionKey: boundedIdentity(2_048),
    provider: z.enum(['claude', 'codex', 'other']),
    title: catalogTitle()
  })
  .strict()

export const SpoolTerminalCreateRequesterResultSchema = z
  .object({
    sessionRef: boundedIdentity(2_048),
    session: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('terminal'),
          agent: z.null(),
          title: catalogTitle()
        })
        .strict(),
      z
        .object({
          kind: z.literal('agent'),
          agent: SpoolAgentLaunchIdSchema.nullable(),
          title: catalogTitle()
        })
        .strict()
    ])
  })
  .strict()

export type SpoolTerminalCreateRequesterResult = z.infer<
  typeof SpoolTerminalCreateRequesterResultSchema
>

export const SpoolSessionContinueHostResultSchema = z
  .object({ terminalHandle: boundedIdentity(2_048) })
  .strict()

export const SpoolTerminalSubscriptionEventSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('snapshot'),
      data: z.string().max(8 * 1_024 * 1_024),
      cols: z.number().int().positive().max(1_000),
      rows: z.number().int().positive().max(1_000),
      sequence: z.number().int().positive().safe()
    })
    .strict(),
  z
    .object({
      kind: z.literal('output'),
      data: z.string().max(8 * 1_024 * 1_024),
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
  z.object({ kind: z.literal('closed'), canContinue: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal('unavailable') }).strict()
])

export function parseSpoolExecutionResult(
  kind: SpoolExecutionOperation['kind'],
  value: unknown
): unknown {
  switch (kind) {
    case 'files.list':
      return SpoolFileListResultSchema.parse(value) satisfies SpoolFileListResult
    case 'files.read':
      return SpoolFileReadResultSchema.parse(value) satisfies SpoolFileReadResult
    case 'files.diff':
      return SpoolFileDiffResultSchema.parse(value) satisfies SpoolFileDiffResult
    case 'git.status':
      return SpoolGitStatusResultSchema.parse(value) satisfies SpoolGitStatusResult
    case 'git.diff':
      return SpoolGitDiffResultSchema.parse(value) satisfies SpoolGitDiffResult
    case 'git.history':
      return SpoolGitHistoryResultSchema.parse(value) satisfies SpoolGitHistoryResult
    case 'checks.read':
      return SpoolChecksReadResultSchema.parse(value) satisfies SpoolChecksReadResult
    case 'terminal.launchOptions':
      return SpoolTerminalLaunchOptionsResultSchema.parse(
        value
      ) satisfies SpoolTerminalLaunchOptionsResult
    case 'terminal.create':
      return SpoolTerminalCreateHostResultSchema.parse(
        value
      ) satisfies SpoolTerminalCreateHostResult
    case 'session.continue':
      return SpoolSessionContinueHostResultSchema.parse(
        value
      ) satisfies SpoolSessionContinueHostResult
    case 'files.write':
    case 'files.mkdir':
    case 'files.rename':
    case 'files.delete':
    case 'git.stage':
    case 'git.unstage':
    case 'git.commit':
    case 'terminal.input':
    case 'terminal.resize':
      return SpoolMutationResultSchema.parse(value) satisfies SpoolMutationResult
  }
}

function boundedIdentity(maxLength: number) {
  return z
    .string()
    .min(1)
    .max(maxLength)
    .refine((value) => !value.includes('\0'))
}

function catalogTitle() {
  return z
    .string()
    .min(1)
    .max(240)
    .refine(
      (value) =>
        value.trim().length > 0 &&
        [...value].every((character) => {
          const code = character.charCodeAt(0)
          return code > 0x1f && code !== 0x7f
        })
    )
}

function isCanonicalBase64(value: string, expectedBytes: number): boolean {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return false
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return (value.length / 4) * 3 - padding === expectedBytes
}
