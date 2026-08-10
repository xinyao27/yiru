import { z } from 'zod'

import {
  BrowserOptionalStringSchema,
  BrowserTargetInputSchema,
  requiredBrowserString
} from './target-input.js'

export const BrowserTabListInputSchema = z.object({
  worktree: BrowserOptionalStringSchema
})

export const BrowserTabSwitchInputSchema = BrowserTargetInputSchema.extend({
  index: z
    .unknown()
    .transform((value) => (typeof value === 'number' ? value : undefined))
    .pipe(z.union([z.number(), z.undefined()]))
    .optional(),
  focus: z.boolean().optional()
}).refine(
  (value) => {
    if (value.page !== undefined) {
      return true
    }
    return value.index !== undefined && Number.isInteger(value.index) && value.index >= 0
  },
  { message: 'Missing required --index (non-negative integer) or --page' }
)

export const BrowserTabCreateInputSchema = z.object({
  browserPageId: BrowserOptionalStringSchema,
  url: BrowserOptionalStringSchema,
  worktree: BrowserOptionalStringSchema,
  profileId: BrowserOptionalStringSchema,
  waitForRegistration: z.boolean().optional(),
  activate: z.boolean().optional(),
  targetGroupId: BrowserOptionalStringSchema
})

export const BrowserTabShowInputSchema = z.object({
  page: requiredBrowserString('Missing required --page'),
  worktree: BrowserOptionalStringSchema
})

export const BrowserTabCurrentInputSchema = z.object({
  worktree: BrowserOptionalStringSchema
})

export const BrowserTabCloseInputSchema = z.object({
  index: z
    .unknown()
    .transform((value) => (typeof value === 'number' ? value : undefined))
    .pipe(z.union([z.number(), z.undefined()]))
    .optional(),
  page: BrowserOptionalStringSchema,
  worktree: BrowserOptionalStringSchema
})

export const BrowserTabSetProfileInputSchema = BrowserTargetInputSchema.extend({
  profileId: requiredBrowserString('Missing required --profile')
})

export const BrowserTabProfileCloneInputSchema = BrowserTargetInputSchema.extend({
  profileId: requiredBrowserString('Missing required --profile')
})

export const BrowserProfileCreateInputSchema = z.object({
  label: requiredBrowserString('Missing required --label'),
  scope: z.enum(['isolated', 'imported'])
})

export const BrowserProfileDeleteInputSchema = z.object({
  profileId: requiredBrowserString('Missing required --profile')
})

export const BrowserProfileImportInputSchema = z.object({
  profileId: requiredBrowserString('Missing required --profile'),
  browserFamily: requiredBrowserString('Missing required --browser-family'),
  browserProfile: BrowserOptionalStringSchema
})

export type BrowserTabListInput = z.output<typeof BrowserTabListInputSchema>
export type BrowserTabSwitchInput = z.output<typeof BrowserTabSwitchInputSchema>
export type BrowserTabCreateInput = z.output<typeof BrowserTabCreateInputSchema>
export type BrowserTabShowInput = z.output<typeof BrowserTabShowInputSchema>
export type BrowserTabCurrentInput = z.output<typeof BrowserTabCurrentInputSchema>
export type BrowserTabCloseInput = z.output<typeof BrowserTabCloseInputSchema>
export type BrowserTabSetProfileInput = z.output<typeof BrowserTabSetProfileInputSchema>
export type BrowserTabProfileCloneInput = z.output<typeof BrowserTabProfileCloneInputSchema>
export type BrowserProfileCreateInput = z.output<typeof BrowserProfileCreateInputSchema>
export type BrowserProfileDeleteInput = z.output<typeof BrowserProfileDeleteInputSchema>
export type BrowserProfileImportInput = z.output<typeof BrowserProfileImportInputSchema>
