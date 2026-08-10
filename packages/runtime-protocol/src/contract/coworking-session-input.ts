import { z } from 'zod'

import {
  CoworkingPairedRuntimeBoundWorktreeSchema,
  CoworkingPairedRuntimeWorktreeSelectorSchema
} from './coworking-input.js'

const channelRef = z.string().uuid()

export const CoworkingPairedRuntimeSessionWorktreeSchema = z
  .object({
    ...CoworkingPairedRuntimeWorktreeSelectorSchema.shape,
    coworkingIncarnationId: z.string().uuid()
  })
  .strict()

export const CoworkingPairedRuntimeListLiveSessionsParamsSchema = z
  .object({ target: CoworkingPairedRuntimeSessionWorktreeSchema })
  .strict()

export const CoworkingPairedRuntimeSubscribeSessionChangesParamsSchema = z
  .object({ target: CoworkingPairedRuntimeSessionWorktreeSchema })
  .strict()

const historicalSessionPageParams = z
  .object({
    target: CoworkingPairedRuntimeSessionWorktreeSchema,
    purpose: z.enum(['catalog', 'legacy-attestation']),
    inventoryScope: z.string().uuid(),
    cursor: z.string().uuid().nullable()
  })
  .strict()

export const CoworkingPairedRuntimeListHistoricalSessionPageParamsSchema =
  historicalSessionPageParams

export const CoworkingPairedRuntimeReleaseHistoricalSessionPageParamsSchema =
  historicalSessionPageParams

export const CoworkingPairedRuntimeUnsubscribeSessionChangesParamsSchema = z
  .object({ requestId: z.string().uuid() })
  .strict()

export const CoworkingPairedRuntimeSessionRecordSchema = z
  .object({
    title: z.string().min(1).max(2_048).refine(withoutNull),
    provider: z.enum(['claude', 'codex']),
    providerSessionId: z.string().min(1).max(512).refine(withoutNull),
    transcriptPath: z.string().min(1).max(32_768).refine(withoutNull),
    resumeCommand: z
      .string()
      .min(1)
      .max(128 * 1_024)
      .refine(withoutNull)
  })
  .strict()

export const CoworkingPairedRuntimeSessionInvokeParamsSchema = z
  .object({
    target: CoworkingPairedRuntimeBoundWorktreeSchema,
    channelRef,
    operation: z.object({ kind: z.literal('session.continue') }).strict(),
    record: CoworkingPairedRuntimeSessionRecordSchema
  })
  .strict()

function withoutNull(value: string): boolean {
  return !value.includes('\0')
}

export type CoworkingPairedRuntimeListLiveSessionsParams = z.infer<
  typeof CoworkingPairedRuntimeListLiveSessionsParamsSchema
>
export type CoworkingPairedRuntimeSubscribeSessionChangesParams = z.infer<
  typeof CoworkingPairedRuntimeSubscribeSessionChangesParamsSchema
>
export type CoworkingPairedRuntimeHistoricalSessionPageParams = z.infer<
  typeof CoworkingPairedRuntimeListHistoricalSessionPageParamsSchema
>
export type CoworkingPairedRuntimeUnsubscribeSessionChangesParams = z.infer<
  typeof CoworkingPairedRuntimeUnsubscribeSessionChangesParamsSchema
>
export type CoworkingPairedRuntimeSessionInvokeParams = z.infer<
  typeof CoworkingPairedRuntimeSessionInvokeParamsSchema
>
