import type { TuiAgent } from '@yiru/workbench-model/agent'
import { z } from 'zod'

export const COWORKING_AGENT_LAUNCH_IDS = [
  'claude',
  'claude-agent-teams',
  'openclaude',
  'codex',
  'autohand',
  'ante',
  'trae',
  'opencode',
  'mimo-code',
  'pi',
  'omp',
  'gemini',
  'antigravity',
  'aider',
  'goose',
  'amp',
  'kilo',
  'kiro',
  'crush',
  'aug',
  'cline',
  'codebuff',
  'command-code',
  'continue',
  'cursor',
  'droid',
  'kimi',
  'mistral-vibe',
  'qwen-code',
  'rovo',
  'hermes',
  'openclaw',
  'copilot',
  'grok',
  'devin'
] as const satisfies readonly TuiAgent[]

export const CoworkingAgentLaunchIdSchema = z.enum(COWORKING_AGENT_LAUNCH_IDS)

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
const channelRef = z.string().uuid()

export const CoworkingPairedRuntimeWorktreeSelectorSchema = z
  .object({
    kind: z.enum(['git', 'folder']),
    worktreeId: identifier,
    instanceId: identifier
  })
  .strict()

export const CoworkingPairedRuntimeWorktreeCatalogParamsSchema = z
  .object({ repoId: identifier })
  .strict()

export const CoworkingPairedRuntimeBoundWorktreeSchema =
  CoworkingPairedRuntimeWorktreeSelectorSchema.extend({
    shareEpoch: identifier,
    coworkingIncarnationId: z.string().uuid()
  }).strict()

const directExecutionOperations = [
  z
    .object({
      kind: z.literal('files.list'),
      relativePath,
      limit: z.number().int().positive().max(5_000).optional()
    })
    .strict(),
  z
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
    .strict(),
  z.object({ kind: z.literal('files.diff'), relativePath, staged: z.boolean() }).strict(),
  z
    .object({
      kind: z.literal('files.write'),
      relativePath,
      content: safeString,
      encoding: z.enum(['utf8', 'base64']),
      mode: z.enum(['create', 'replace'])
    })
    .strict(),
  z.object({ kind: z.literal('files.mkdir'), relativePath }).strict(),
  z
    .object({
      kind: z.literal('files.rename'),
      relativePath,
      destinationRelativePath: relativePath
    })
    .strict(),
  z
    .object({ kind: z.literal('files.delete'), relativePath, recursive: z.boolean().optional() })
    .strict(),
  z.object({ kind: z.literal('git.status') }).strict(),
  z
    .object({
      kind: z.literal('git.diff'),
      source: z.enum(['working-tree', 'index', 'commit']),
      relativePath: relativePath.optional(),
      commitRef: identifier.optional()
    })
    .strict(),
  z
    .object({
      kind: z.literal('git.history'),
      limit: z.number().int().positive().max(200).optional()
    })
    .strict(),
  z
    .object({ kind: z.literal('git.stage'), relativePaths: z.array(relativePath).min(1).max(500) })
    .strict(),
  z
    .object({
      kind: z.literal('git.unstage'),
      relativePaths: z.array(relativePath).min(1).max(500)
    })
    .strict(),
  z
    .object({
      kind: z.literal('git.commit'),
      message: z
        .string()
        .min(1)
        .max(128 * 1_024)
    })
    .strict(),
  z.object({ kind: z.literal('checks.read') }).strict(),
  z.object({ kind: z.literal('terminal.input'), terminalRef, data: safeString }).strict(),
  z
    .object({
      kind: z.literal('terminal.resize'),
      terminalRef,
      cols: z.number().int().positive().max(1_000),
      rows: z.number().int().positive().max(1_000)
    })
    .strict(),
  z.object({ kind: z.literal('terminal.launchOptions') }).strict(),
  z
    .object({
      kind: z.literal('terminal.create'),
      clientMutationId: z.string().uuid(),
      launch: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('shell') }).strict(),
        z.object({ kind: z.literal('agent'), agent: CoworkingAgentLaunchIdSchema }).strict()
      ])
    })
    .strict()
] as const

export const CoworkingPairedRuntimeDirectExecutionOperationSchema = z.discriminatedUnion(
  'kind',
  directExecutionOperations
)

export const CoworkingPairedRuntimeTerminalSubscribeSchema = z
  .object({
    kind: z.literal('terminal.subscribe'),
    terminalRef,
    scrollbackRows: z.number().int().nonnegative().max(50_000).optional()
  })
  .strict()

export const CoworkingPairedRuntimeInspectParamsSchema = z
  .object({
    target: CoworkingPairedRuntimeWorktreeSelectorSchema,
    mode: z.enum(['resolve-root', 'resolve-or-create-marker'])
  })
  .strict()

export const CoworkingPairedRuntimeCanonicalizeParamsSchema = z
  .object({
    target: CoworkingPairedRuntimeWorktreeSelectorSchema,
    path: z
      .string()
      .min(1)
      .max(32_768)
      .refine((value) => !value.includes('\0'))
  })
  .strict()

export const CoworkingPairedRuntimeInvokeParamsSchema = z
  .object({
    target: CoworkingPairedRuntimeBoundWorktreeSchema,
    channelRef,
    operation: CoworkingPairedRuntimeDirectExecutionOperationSchema
  })
  .strict()

export const CoworkingPairedRuntimeSubscribeParamsSchema = z
  .object({
    target: CoworkingPairedRuntimeBoundWorktreeSchema,
    channelRef,
    operation: CoworkingPairedRuntimeTerminalSubscribeSchema
  })
  .strict()

export const CoworkingPairedRuntimeReleaseChannelParamsSchema = z.object({ channelRef }).strict()

export const CoworkingPairedRuntimeRevokeWorktreeParamsSchema = z
  .object({ instanceId: identifier, channelRef })
  .strict()

export type CoworkingAgentLaunchId = (typeof COWORKING_AGENT_LAUNCH_IDS)[number]
export type CoworkingPairedRuntimeDirectExecutionOperation = z.infer<
  typeof CoworkingPairedRuntimeDirectExecutionOperationSchema
>
export type CoworkingPairedRuntimeWorktreeSelector = z.infer<
  typeof CoworkingPairedRuntimeWorktreeSelectorSchema
>
export type CoworkingPairedRuntimeBoundWorktree = z.infer<
  typeof CoworkingPairedRuntimeBoundWorktreeSchema
>
export type CoworkingPairedRuntimeWorktreeCatalogParams = z.infer<
  typeof CoworkingPairedRuntimeWorktreeCatalogParamsSchema
>
export type CoworkingPairedRuntimeInspectParams = z.infer<
  typeof CoworkingPairedRuntimeInspectParamsSchema
>
export type CoworkingPairedRuntimeCanonicalizeParams = z.infer<
  typeof CoworkingPairedRuntimeCanonicalizeParamsSchema
>
export type CoworkingPairedRuntimeInvokeParams = z.infer<
  typeof CoworkingPairedRuntimeInvokeParamsSchema
>
export type CoworkingPairedRuntimeSubscribeParams = z.infer<
  typeof CoworkingPairedRuntimeSubscribeParamsSchema
>
export type CoworkingPairedRuntimeReleaseChannelParams = z.infer<
  typeof CoworkingPairedRuntimeReleaseChannelParamsSchema
>
export type CoworkingPairedRuntimeRevokeWorktreeParams = z.infer<
  typeof CoworkingPairedRuntimeRevokeWorktreeParamsSchema
>
