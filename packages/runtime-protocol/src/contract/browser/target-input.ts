import { z } from 'zod'

export const BrowserOptionalFiniteNumberSchema = z
  .unknown()
  .transform((value) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined))
  .pipe(z.union([z.number(), z.undefined()]))
  .optional()

export const BrowserOptionalStringSchema = z
  .unknown()
  .transform((value) => (typeof value === 'string' && value.length > 0 ? value : undefined))
  .pipe(z.union([z.string(), z.undefined()]))
  .optional()

export const BrowserOptionalPlainStringSchema = z
  .unknown()
  .transform((value) => (typeof value === 'string' ? value : undefined))
  .pipe(z.union([z.string(), z.undefined()]))
  .optional()

export const BrowserOptionalBooleanSchema = z
  .unknown()
  .transform((value) => (typeof value === 'boolean' ? value : undefined))
  .pipe(z.union([z.boolean(), z.undefined()]))
  .optional()

// Why: legacy callers may use an empty worktree string to mean an unscoped
// target, while page IDs are meaningful only when non-empty.
export const BrowserTargetInputSchema = z.object({
  worktree: BrowserOptionalPlainStringSchema,
  page: BrowserOptionalStringSchema
})

export function requiredBrowserString(message: string) {
  return z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string().min(1, message))
}

export function requiredBrowserStringAllowingEmpty(message: string) {
  return z.unknown().refine((value): value is string => typeof value === 'string', { message })
}

export type BrowserTargetInput = z.output<typeof BrowserTargetInputSchema>
