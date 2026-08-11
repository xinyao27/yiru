import { z } from 'zod'

import { CoworkingAgentLaunchIdSchema } from './agent-launch-contract'
import {
  CoworkingPairedRuntimeBoundWorktreeSchema,
  CoworkingPairedRuntimeWorktreeSelectorSchema
} from './paired-runtime-host-contract'
import { CoworkingPairedRuntimeErrorCodeSchema } from './paired-runtime-result-contract'
import { COWORKING_MAX_LIVE_SESSIONS_PER_WORKTREE } from './resource-limits'

const identifier = z
  .string()
  .min(1)
  .max(32_768)
  .refine((value) => value.trim().length > 0 && !value.includes('\0'))
const title = z.string().min(1).max(2_048).refine(withoutNull)
const providerSessionId = z.string().min(1).max(512).refine(withoutNull)
const liveSessionKey = z.string().min(1).max(512).refine(withoutNull)
const pathText = z.string().min(1).max(32_768).refine(withoutNull)
const resumeCommand = z
  .string()
  .min(1)
  .max(128 * 1_024)
  .refine(withoutNull)
const historicalSessionCursor = z.string().uuid()

export const COWORKING_PAIRED_RUNTIME_HISTORICAL_SESSION_PAGE_SIZE = 512

export const CoworkingPairedRuntimeSessionWorktreeSchema = z
  .object({
    ...CoworkingPairedRuntimeWorktreeSelectorSchema.shape,
    coworkingIncarnationId: z.string().uuid()
  })
  .strict()

export const CoworkingPairedRuntimeListLiveSessionsParamsSchema = z
  .object({ target: CoworkingPairedRuntimeSessionWorktreeSchema })
  .strict()

export const CoworkingPairedRuntimeListHistoricalSessionPageParamsSchema = z
  .object({
    target: CoworkingPairedRuntimeSessionWorktreeSchema,
    purpose: z.enum(['catalog', 'legacy-attestation']),
    inventoryScope: z.string().uuid(),
    cursor: historicalSessionCursor.nullable()
  })
  .strict()

export const CoworkingPairedRuntimeReleaseHistoricalSessionPageParamsSchema = z
  .object({
    target: CoworkingPairedRuntimeSessionWorktreeSchema,
    purpose: z.enum(['catalog', 'legacy-attestation']),
    inventoryScope: z.string().uuid(),
    cursor: historicalSessionCursor.nullable()
  })
  .strict()

export const CoworkingPairedRuntimeSubscribeSessionChangesParamsSchema = z
  .object({ target: CoworkingPairedRuntimeSessionWorktreeSchema })
  .strict()

export const CoworkingPairedRuntimeUnsubscribeSessionChangesParamsSchema = z
  .object({ requestId: z.string().uuid() })
  .strict()

export const CoworkingPairedRuntimeObservedProviderSessionSchema = z
  .object({
    provider: z.enum(['claude', 'codex']),
    providerSessionId,
    sessionKey: liveSessionKey.nullable()
  })
  .strict()

export const CoworkingPairedRuntimeSessionChangedEventSchema = z
  .object({
    kind: z.literal('changed'),
    providerSessions: z
      .array(CoworkingPairedRuntimeObservedProviderSessionSchema)
      .max(COWORKING_MAX_LIVE_SESSIONS_PER_WORKTREE)
  })
  .strict()

export const CoworkingPairedRuntimeLiveSessionSchema = z
  .object({
    terminalRef: z.string().min(1).max(2_048).refine(withoutNull),
    title,
    // Why: older paired hosts omit this field; false preserves their prior ordering fallback.
    isActive: z.boolean().default(false),
    provider: z.enum(['claude', 'codex', 'other']),
    providerSessionId: providerSessionId.nullable(),
    sessionKind: z.enum(['terminal', 'agent']),
    agent: CoworkingAgentLaunchIdSchema.nullable(),
    sessionKey: liveSessionKey.nullable()
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.sessionKind === 'terminal' && (value.agent !== null || value.provider !== 'other')) ||
      (value.sessionKind === 'agent' && value.agent === null && value.provider !== 'other') ||
      (value.provider === 'other' && value.providerSessionId !== null)
    ) {
      context.addIssue({ code: 'custom', message: 'Invalid live session display identity' })
    }
  })

export const CoworkingPairedRuntimeHistoricalSessionSchema = z
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
    sessions: z
      .array(CoworkingPairedRuntimeLiveSessionSchema)
      .max(COWORKING_MAX_LIVE_SESSIONS_PER_WORKTREE)
  })
  .strict()
const historicalSessionPageResult = z
  .object({
    sessions: z
      .array(CoworkingPairedRuntimeHistoricalSessionSchema)
      .max(COWORKING_PAIRED_RUNTIME_HISTORICAL_SESSION_PAGE_SIZE),
    nextCursor: historicalSessionCursor.nullable(),
    scannedAt: z.iso.datetime()
  })
  .strict()

export const CoworkingPairedRuntimeLiveSessionsResponseSchema = sessionResponse(liveSessionsResult)
export const CoworkingPairedRuntimeHistoricalSessionPageResponseSchema = sessionResponse(
  historicalSessionPageResult
)

export const CoworkingPairedRuntimeSessionRecordSchema = z
  .object({
    title,
    provider: z.enum(['claude', 'codex']),
    providerSessionId,
    transcriptPath: pathText,
    resumeCommand
  })
  .strict()

export const CoworkingPairedRuntimeSessionInvokeParamsSchema = z
  .object({
    target: CoworkingPairedRuntimeBoundWorktreeSchema,
    channelRef: z.string().uuid(),
    operation: z.object({ kind: z.literal('session.continue') }).strict(),
    record: CoworkingPairedRuntimeSessionRecordSchema
  })
  .strict()

export type CoworkingPairedRuntimeSessionWorktree = z.infer<
  typeof CoworkingPairedRuntimeSessionWorktreeSchema
>
export type CoworkingPairedRuntimeSessionRecord = z.infer<
  typeof CoworkingPairedRuntimeSessionRecordSchema
>
export type CoworkingPairedRuntimeObservedProviderSession = z.infer<
  typeof CoworkingPairedRuntimeObservedProviderSessionSchema
>

function sessionResponse<TResult extends z.ZodTypeAny>(result: TResult) {
  return z.discriminatedUnion('status', [
    z.object({ status: z.literal('ok'), result }).strict(),
    z.object({ status: z.literal('error'), code: CoworkingPairedRuntimeErrorCodeSchema }).strict()
  ])
}

function withoutNull(value: string): boolean {
  return !value.includes('\0')
}
