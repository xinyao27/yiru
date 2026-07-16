import { z } from 'zod'
import type { ExecutionHostId } from '../execution-host'
import { SpoolAgentLaunchIdSchema } from './spool-agent-launch-contract'
import type { SpoolExecutionOperation } from './spool-operation-contract'
import type { SpoolWorktreeKind } from './spool-worktree-kind'

const identifier = z
  .string()
  .min(1)
  .max(32_768)
  .refine((value) => value.trim().length > 0 && !value.includes('\0'))
const relativePath = z
  .string()
  .max(32_768)
  .refine((value) => !value.includes('\0'))
const terminalRef = z.string().min(1).max(4_096)
const safeString = z.string().max(8 * 1_024 * 1_024)

export const SpoolPairedRuntimeWorktreeSelectorSchema = z
  .object({
    kind: z.enum(['git', 'folder']),
    worktreeId: identifier,
    instanceId: identifier
  })
  .strict()

export const SpoolPairedRuntimeWorktreeCatalogParamsSchema = z
  .object({ repoId: identifier })
  .strict()

export const SpoolPairedRuntimeBoundWorktreeSchema =
  SpoolPairedRuntimeWorktreeSelectorSchema.extend({
    shareEpoch: identifier,
    spoolIncarnationId: z.string().uuid()
  }).strict()

const fileList = z
  .object({
    kind: z.literal('files.list'),
    relativePath,
    limit: z.number().int().positive().max(5_000).optional()
  })
  .strict()
const fileRead = z
  .object({
    kind: z.literal('files.read'),
    relativePath,
    offset: z.number().int().nonnegative().safe().optional(),
    maxBytes: z
      .number()
      .int()
      .positive()
      .max(2 * 1_024 * 1_024)
      .optional()
  })
  .strict()
const fileDiff = z
  .object({ kind: z.literal('files.diff'), relativePath, staged: z.boolean() })
  .strict()
const fileWrite = z
  .object({
    kind: z.literal('files.write'),
    relativePath,
    content: safeString,
    encoding: z.enum(['utf8', 'base64']),
    mode: z.enum(['create', 'replace'])
  })
  .strict()
const fileMkdir = z.object({ kind: z.literal('files.mkdir'), relativePath }).strict()
const fileRename = z
  .object({
    kind: z.literal('files.rename'),
    relativePath,
    destinationRelativePath: relativePath
  })
  .strict()
const fileDelete = z
  .object({ kind: z.literal('files.delete'), relativePath, recursive: z.boolean().optional() })
  .strict()

const gitStatus = z.object({ kind: z.literal('git.status') }).strict()
const gitDiff = z
  .object({
    kind: z.literal('git.diff'),
    source: z.enum(['working-tree', 'index', 'commit']),
    relativePath: relativePath.optional(),
    commitRef: identifier.optional()
  })
  .strict()
const gitHistory = z
  .object({
    kind: z.literal('git.history'),
    limit: z.number().int().positive().max(200).optional()
  })
  .strict()
const gitStage = z
  .object({ kind: z.literal('git.stage'), relativePaths: z.array(relativePath).min(1).max(500) })
  .strict()
const gitUnstage = z
  .object({ kind: z.literal('git.unstage'), relativePaths: z.array(relativePath).min(1).max(500) })
  .strict()
const gitCommit = z
  .object({
    kind: z.literal('git.commit'),
    message: z
      .string()
      .min(1)
      .max(128 * 1_024)
  })
  .strict()
const checksRead = z.object({ kind: z.literal('checks.read') }).strict()

const terminalInput = z
  .object({ kind: z.literal('terminal.input'), terminalRef, data: safeString })
  .strict()
const terminalResize = z
  .object({
    kind: z.literal('terminal.resize'),
    terminalRef,
    cols: z.number().int().positive().max(1_000),
    rows: z.number().int().positive().max(1_000)
  })
  .strict()
const terminalLaunchOptions = z.object({ kind: z.literal('terminal.launchOptions') }).strict()
const terminalCreate = z
  .object({
    kind: z.literal('terminal.create'),
    clientMutationId: z.string().uuid(),
    launch: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('shell') }).strict(),
      z.object({ kind: z.literal('agent'), agent: SpoolAgentLaunchIdSchema }).strict()
    ])
  })
  .strict()
const sessionContinue = z
  .object({ kind: z.literal('session.continue'), ownerRecordKey: identifier })
  .strict()

const directExecutionOperations = [
  fileList,
  fileRead,
  fileDiff,
  fileWrite,
  fileMkdir,
  fileRename,
  fileDelete,
  gitStatus,
  gitDiff,
  gitHistory,
  gitStage,
  gitUnstage,
  gitCommit,
  checksRead,
  terminalInput,
  terminalResize,
  terminalLaunchOptions,
  terminalCreate
] as const

export const SpoolPairedRuntimeDirectExecutionOperationSchema = z.discriminatedUnion(
  'kind',
  directExecutionOperations
)

export const SpoolPairedRuntimeExecutionOperationSchema = z.discriminatedUnion('kind', [
  ...directExecutionOperations,
  sessionContinue
])

export const SpoolPairedRuntimeTerminalSubscribeSchema = z
  .object({
    kind: z.literal('terminal.subscribe'),
    terminalRef,
    scrollbackRows: z.number().int().nonnegative().max(50_000).optional()
  })
  .strict()

export const SpoolPairedRuntimeInspectParamsSchema = z
  .object({
    target: SpoolPairedRuntimeWorktreeSelectorSchema,
    mode: z.enum(['resolve-root', 'resolve-or-create-marker'])
  })
  .strict()

export const SpoolPairedRuntimeCanonicalizeParamsSchema = z
  .object({
    target: SpoolPairedRuntimeWorktreeSelectorSchema,
    path: z
      .string()
      .min(1)
      .max(32_768)
      .refine((value) => !value.includes('\0'))
  })
  .strict()

const channelRef = z.string().uuid()

export const SpoolPairedRuntimeInvokeParamsSchema = z
  .object({
    target: SpoolPairedRuntimeBoundWorktreeSchema,
    channelRef,
    operation: SpoolPairedRuntimeDirectExecutionOperationSchema
  })
  .strict()

export const SpoolPairedRuntimeSubscribeParamsSchema = z
  .object({
    target: SpoolPairedRuntimeBoundWorktreeSchema,
    channelRef,
    operation: SpoolPairedRuntimeTerminalSubscribeSchema
  })
  .strict()

export const SpoolPairedRuntimeReleaseChannelParamsSchema = z.object({ channelRef }).strict()

export const SpoolPairedRuntimeRevokeWorktreeParamsSchema = z
  .object({ instanceId: identifier, channelRef })
  .strict()

export type SpoolPairedRuntimeResolvedWorktree = {
  kind: SpoolWorktreeKind
  worktreeId: string
  instanceId: string
  projectId: string | null
  repoId: string
  executionHostId: ExecutionHostId
  connectionId: string | null
  projectHostSetupId?: string
  worktreePath: string
  localWslDistro: string | null
}

export type SpoolPairedRuntimeWorktreeSelector = z.infer<
  typeof SpoolPairedRuntimeWorktreeSelectorSchema
>
export type SpoolPairedRuntimeBoundWorktree = z.infer<typeof SpoolPairedRuntimeBoundWorktreeSchema>

export function parseSpoolPairedRuntimeOperation(value: unknown): SpoolExecutionOperation {
  return SpoolPairedRuntimeExecutionOperationSchema.parse(value) as SpoolExecutionOperation
}
