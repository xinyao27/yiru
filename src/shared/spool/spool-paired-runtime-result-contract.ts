import { z } from 'zod'
import type { SpoolExecutionOperation } from './spool-operation-contract'
import { parseSpoolExecutionResult } from './spool-execution-result-schema'
import { SPOOL_RPC_ERROR_CODES } from './spool-wire-contract'

const boundedText = z.string().max(8 * 1_024 * 1_024)

export const SpoolPairedRuntimeCanonicalPathSchema = z
  .object({
    scopeKey: z.string().min(1).max(4_096),
    rootKey: z.string().min(1).max(32_768),
    ancestorKeys: z.array(z.string().min(1).max(32_768)).max(2_048)
  })
  .strict()

export const SpoolPairedRuntimeWorktreeCatalogSchema = z
  .object({
    actualHostScope: z.string().min(1).max(4_096),
    inventory: z.unknown()
  })
  .strict()

export const SpoolPairedRuntimeInspectionSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('resolved'),
      root: SpoolPairedRuntimeCanonicalPathSchema,
      markerId: z.string().uuid().nullable(),
      actualHostScope: z.string().min(1).max(4_096)
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
      ]),
      actualHostScope: z.string().min(1).max(4_096).optional()
    })
    .strict()
])

export const SpoolPairedRuntimeCanonicalizeResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('resolved'), path: SpoolPairedRuntimeCanonicalPathSchema }).strict(),
  z.object({ status: z.literal('missing') }).strict(),
  z.object({ status: z.literal('invalid') }).strict(),
  z.object({ status: z.literal('unavailable') }).strict()
])

export const SpoolPairedRuntimeErrorCodeSchema = z.enum(SPOOL_RPC_ERROR_CODES)

export const SpoolPairedRuntimeInvokeResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), result: z.unknown() }).strict(),
  z.object({ status: z.literal('error'), code: SpoolPairedRuntimeErrorCodeSchema }).strict()
])

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
  return parseSpoolExecutionResult(operation.kind, value)
}
