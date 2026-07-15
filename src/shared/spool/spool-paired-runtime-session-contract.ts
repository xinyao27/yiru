import { z } from 'zod'
import { SpoolPairedRuntimeBoundWorktreeSchema } from './spool-paired-runtime-host-contract'
import { SpoolPairedRuntimeErrorCodeSchema } from './spool-paired-runtime-result-contract'
import { SPOOL_MAX_LIVE_SESSIONS_PER_WORKTREE } from './spool-resource-limits'

const identifier = z
  .string()
  .min(1)
  .max(32_768)
  .refine((value) => value.trim().length > 0 && !value.includes('\0'))
const title = z.string().min(1).max(2_048).refine(withoutNull)
const providerSessionId = z.string().min(1).max(512).refine(withoutNull)
const pathText = z.string().min(1).max(32_768).refine(withoutNull)
const resumeCommand = z
  .string()
  .min(1)
  .max(128 * 1_024)
  .refine(withoutNull)
const historicalSessionCursor = z.string().uuid()

export const SPOOL_PAIRED_RUNTIME_HISTORICAL_SESSION_PAGE_SIZE = 512

export const SpoolPairedRuntimeSessionWorktreeSchema = z
  .object({
    worktreeId: identifier,
    instanceId: identifier,
    spoolIncarnationId: z.string().uuid()
  })
  .strict()

export const SpoolPairedRuntimeListLiveSessionsParamsSchema = z
  .object({ target: SpoolPairedRuntimeSessionWorktreeSchema })
  .strict()

export const SpoolPairedRuntimeListHistoricalSessionPageParamsSchema = z
  .object({
    target: SpoolPairedRuntimeSessionWorktreeSchema,
    purpose: z.enum(['catalog', 'legacy-attestation']),
    inventoryScope: z.string().uuid(),
    cursor: historicalSessionCursor.nullable()
  })
  .strict()

export const SpoolPairedRuntimeReleaseHistoricalSessionPageParamsSchema = z
  .object({
    target: SpoolPairedRuntimeSessionWorktreeSchema,
    purpose: z.enum(['catalog', 'legacy-attestation']),
    inventoryScope: z.string().uuid(),
    cursor: historicalSessionCursor.nullable()
  })
  .strict()

export const SpoolPairedRuntimeSubscribeSessionChangesParamsSchema = z
  .object({ target: SpoolPairedRuntimeSessionWorktreeSchema })
  .strict()

export const SpoolPairedRuntimeUnsubscribeSessionChangesParamsSchema = z
  .object({ requestId: z.string().uuid() })
  .strict()

export const SpoolPairedRuntimeSessionChangedEventSchema = z
  .object({ kind: z.literal('changed') })
  .strict()

export const SpoolPairedRuntimeLiveSessionSchema = z
  .object({
    terminalRef: z.string().min(1).max(2_048).refine(withoutNull),
    title,
    provider: z.enum(['claude', 'codex', 'other']),
    providerSessionId: providerSessionId.nullable()
  })
  .strict()

export const SpoolPairedRuntimeHistoricalSessionSchema = z
  .object({
    sessionRef: identifier,
    title,
    provider: z.enum(['claude', 'codex']),
    providerSessionId,
    cwd: pathText.nullable(),
    transcriptPath: pathText,
    resumeCommand
  })
  .strict()

const liveSessionsResult = z
  .object({
    sessions: z.array(SpoolPairedRuntimeLiveSessionSchema).max(SPOOL_MAX_LIVE_SESSIONS_PER_WORKTREE)
  })
  .strict()
const historicalSessionPageResult = z
  .object({
    sessions: z
      .array(SpoolPairedRuntimeHistoricalSessionSchema)
      .max(SPOOL_PAIRED_RUNTIME_HISTORICAL_SESSION_PAGE_SIZE),
    nextCursor: historicalSessionCursor.nullable(),
    scannedAt: z.iso.datetime()
  })
  .strict()

export const SpoolPairedRuntimeLiveSessionsResponseSchema = sessionResponse(liveSessionsResult)
export const SpoolPairedRuntimeHistoricalSessionPageResponseSchema = sessionResponse(
  historicalSessionPageResult
)

export const SpoolPairedRuntimeSessionRecordSchema = z
  .object({
    title,
    provider: z.enum(['claude', 'codex']),
    providerSessionId,
    transcriptPath: pathText,
    resumeCommand
  })
  .strict()

export const SpoolPairedRuntimeSessionInvokeParamsSchema = z
  .object({
    target: SpoolPairedRuntimeBoundWorktreeSchema,
    channelRef: z.string().uuid(),
    operation: z.object({ kind: z.enum(['session.read', 'session.continue']) }).strict(),
    record: SpoolPairedRuntimeSessionRecordSchema
  })
  .strict()

export type SpoolPairedRuntimeSessionWorktree = z.infer<
  typeof SpoolPairedRuntimeSessionWorktreeSchema
>
export type SpoolPairedRuntimeSessionRecord = z.infer<typeof SpoolPairedRuntimeSessionRecordSchema>

function sessionResponse<TResult extends z.ZodTypeAny>(result: TResult) {
  return z.discriminatedUnion('status', [
    z.object({ status: z.literal('ok'), result }).strict(),
    z.object({ status: z.literal('error'), code: SpoolPairedRuntimeErrorCodeSchema }).strict()
  ])
}

function withoutNull(value: string): boolean {
  return !value.includes('\0')
}
