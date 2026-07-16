import { z } from 'zod'
import type { SpoolChecksReadResult } from './spool-operation-contract'

const safeHttpUrl = z
  .string()
  .min(1)
  .max(8_192)
  .transform((value, context) => {
    const normalized = normalizeSpoolChecksHttpUrl(value)
    if (!normalized) {
      context.addIssue({ code: 'custom', message: 'Expected a credential-free HTTP(S) URL' })
      return z.NEVER
    }
    return normalized
  })

const checkConclusion = z.enum([
  'success',
  'failure',
  'cancelled',
  'timed_out',
  'neutral',
  'skipped',
  'pending',
  'action_required'
])

/** Canonical owner-boundary schema for the sanitized Checks projection. */
export const SpoolChecksReadResultSchema: z.ZodType<SpoolChecksReadResult> = z
  .object({
    review: z
      .object({
        provider: z.enum(['github', 'gitlab', 'bitbucket', 'azure-devops', 'gitea', 'unsupported']),
        number: z.number().int().positive().safe(),
        title: z.string().min(1).max(1_024),
        state: z.enum(['open', 'closed', 'merged', 'draft']),
        url: safeHttpUrl.nullable(),
        status: z.enum(['pending', 'success', 'failure', 'neutral']),
        updatedAt: z
          .string()
          .min(1)
          .max(256)
          .refine((value) => Number.isFinite(Date.parse(value))),
        mergeable: z.enum(['MERGEABLE', 'CONFLICTING', 'UNKNOWN']),
        reviewDecision: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'REVIEW_REQUIRED']).nullable()
      })
      .strict()
      .nullable(),
    checks: z
      .array(
        z
          .object({
            name: z.string().min(1).max(1_024),
            status: z.enum(['queued', 'in_progress', 'completed']),
            conclusion: checkConclusion.nullable(),
            url: safeHttpUrl.nullable()
          })
          .strict()
      )
      .max(256),
    truncated: z.boolean(),
    detailStatus: z.enum(['complete', 'unavailable', 'unsupported'])
  })
  .strict()

export function normalizeSpoolChecksHttpUrl(value: string): string | null {
  if (value.length > 8_192) {
    return null
  }
  try {
    const url = new URL(value)
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username.length > 0 ||
      url.password.length > 0
    ) {
      return null
    }
    // Why: CI targets may place bearer tokens or signed credentials in query/fragment fields.
    url.search = ''
    url.hash = ''
    return url.href.length <= 8_192 ? url.href : null
  } catch {
    return null
  }
}
