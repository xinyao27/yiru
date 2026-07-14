import { z } from 'zod'
import { SpoolPairedRuntimeBoundWorktreeSchema } from './spool-paired-runtime-host-contract'
import { SpoolPairedRuntimeErrorCodeSchema } from './spool-paired-runtime-result-contract'

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

export const SpoolPairedRuntimeListHistoricalSessionsParamsSchema = z
  .object({
    target: SpoolPairedRuntimeSessionWorktreeSchema,
    purpose: z.enum(['catalog', 'legacy-attestation'])
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
  .object({ sessions: z.array(SpoolPairedRuntimeLiveSessionSchema).max(5_000) })
  .strict()
const historicalSessionsResult = z
  .object({
    sessions: z.array(SpoolPairedRuntimeHistoricalSessionSchema).max(5_000),
    scannedAt: z.string().min(1).max(128)
  })
  .strict()

export const SpoolPairedRuntimeLiveSessionsResponseSchema = sessionResponse(liveSessionsResult)
export const SpoolPairedRuntimeHistoricalSessionsResponseSchema =
  sessionResponse(historicalSessionsResult)

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
