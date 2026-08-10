import { z } from 'zod'

import {
  BrowserOptionalBooleanSchema,
  BrowserOptionalFiniteNumberSchema,
  BrowserOptionalPlainStringSchema,
  BrowserOptionalStringSchema,
  BrowserTargetInputSchema,
  requiredBrowserString,
  requiredBrowserStringAllowingEmpty
} from './target-input.js'

export const BrowserElementInputSchema = BrowserTargetInputSchema.extend({
  element: requiredBrowserString('Missing required --element')
})

export const BrowserGotoInputSchema = BrowserTargetInputSchema.extend({
  url: requiredBrowserString('Missing required --url')
})

export const BrowserFillInputSchema = BrowserTargetInputSchema.extend({
  element: requiredBrowserString('Missing required --element'),
  value: requiredBrowserStringAllowingEmpty('Missing required --value')
})

export const BrowserTypeInputSchema = BrowserTargetInputSchema.extend({
  input: requiredBrowserString('Missing required --input')
})

export const BrowserSelectInputSchema = BrowserTargetInputSchema.extend({
  element: requiredBrowserString('Missing required --element'),
  value: z.custom<string>((value) => typeof value === 'string', {
    message: 'Missing required --value'
  })
})

export const BrowserScrollInputSchema = BrowserTargetInputSchema.extend({
  direction: z.custom<'up' | 'down'>((value) => value === 'up' || value === 'down', {
    message: 'Missing required --direction (up or down)'
  }),
  amount: z
    .unknown()
    .transform((value) => (typeof value === 'number' && value > 0 ? value : undefined))
    .pipe(z.union([z.number(), z.undefined()]))
    .optional()
})

export const BrowserScreenshotInputSchema = BrowserTargetInputSchema.extend({
  format: z
    .unknown()
    .transform((value) => (value === 'png' || value === 'jpeg' ? value : undefined))
    .pipe(z.union([z.enum(['png', 'jpeg']), z.undefined()]))
    .optional()
})

export const BrowserFullScreenshotInputSchema = BrowserTargetInputSchema.extend({
  format: z
    .unknown()
    .optional()
    .transform((value) => (value === 'jpeg' ? 'jpeg' : 'png'))
    .pipe(z.enum(['png', 'jpeg']))
})

export const BrowserScreencastInputSchema = BrowserTargetInputSchema.extend({
  format: z
    .unknown()
    .optional()
    .transform((value) => (value === 'png' ? 'png' : 'jpeg'))
    .pipe(z.enum(['png', 'jpeg'])),
  quality: BrowserOptionalFiniteNumberSchema,
  maxWidth: BrowserOptionalFiniteNumberSchema,
  maxHeight: BrowserOptionalFiniteNumberSchema,
  viewportWidth: BrowserOptionalFiniteNumberSchema,
  viewportHeight: BrowserOptionalFiniteNumberSchema,
  deviceScaleFactor: BrowserOptionalFiniteNumberSchema,
  mobile: BrowserOptionalBooleanSchema,
  everyNthFrame: BrowserOptionalFiniteNumberSchema,
  minFrameIntervalMs: BrowserOptionalFiniteNumberSchema
})

export const BrowserScreencastUnsubscribeInputSchema = z.object({
  subscriptionId: z.string().min(1, 'Missing required --subscription-id')
})

export const BrowserEvalInputSchema = BrowserTargetInputSchema.extend({
  expression: requiredBrowserString('Missing required --expression')
})

export const BrowserDragInputSchema = BrowserTargetInputSchema.extend({
  from: requiredBrowserString('Missing required --from and --to element refs'),
  to: requiredBrowserString('Missing required --from and --to element refs')
})

export const BrowserUploadInputSchema = BrowserTargetInputSchema.extend({
  element: requiredBrowserString('Missing required --element and --files'),
  files: z.custom<string[]>(
    (value) =>
      Array.isArray(value) && value.length > 0 && value.every((file) => typeof file === 'string'),
    { message: 'Missing required --element and --files' }
  )
})

export const BrowserWaitInputSchema = BrowserTargetInputSchema.extend({
  selector: BrowserOptionalPlainStringSchema,
  timeout: z
    .unknown()
    .transform((value) => (typeof value === 'number' && value > 0 ? value : undefined))
    .pipe(z.union([z.number(), z.undefined()]))
    .optional(),
  text: BrowserOptionalPlainStringSchema,
  url: BrowserOptionalPlainStringSchema,
  load: BrowserOptionalPlainStringSchema,
  fn: BrowserOptionalPlainStringSchema,
  state: BrowserOptionalPlainStringSchema
})

export const BrowserCheckInputSchema = BrowserTargetInputSchema.extend({
  element: requiredBrowserString('Missing required --element'),
  checked: z
    .unknown()
    .optional()
    .transform((value) => (value === undefined ? true : value))
    .pipe(z.boolean())
})

export const BrowserKeypressInputSchema = BrowserTargetInputSchema.extend({
  key: requiredBrowserString('Missing required --key')
})

export const BrowserSelectorPathInputSchema = BrowserTargetInputSchema.extend({
  selector: requiredBrowserString('Missing required --selector and --path'),
  path: requiredBrowserString('Missing required --selector and --path')
})

export const BrowserHighlightInputSchema = BrowserTargetInputSchema.extend({
  selector: requiredBrowserString('Missing required --selector')
})

export const BrowserExecInputSchema = BrowserTargetInputSchema.extend({
  command: requiredBrowserString('Missing required --command')
})

export const BrowserGetInputSchema = BrowserTargetInputSchema.extend({
  what: requiredBrowserString('Missing required --what'),
  selector: BrowserOptionalStringSchema
})

export const BrowserIsInputSchema = BrowserTargetInputSchema.extend({
  what: z.custom<string>((value) => typeof value === 'string' && value.length > 0, {
    message: 'Missing required --what and --element'
  }),
  selector: z.custom<string>((value) => typeof value === 'string' && value.length > 0, {
    message: 'Missing required --what and --element'
  })
})

export const BrowserKeyboardInsertInputSchema = BrowserTargetInputSchema.extend({
  text: requiredBrowserString('Missing required --text')
})

export const BrowserLimitInputSchema = BrowserTargetInputSchema.extend({
  limit: BrowserOptionalFiniteNumberSchema
})

export const BrowserFindInputSchema = BrowserTargetInputSchema.extend({
  locator: requiredBrowserString('Missing required --locator, --value, and --action'),
  value: requiredBrowserString('Missing required --locator, --value, and --action'),
  action: requiredBrowserString('Missing required --locator, --value, and --action'),
  text: BrowserOptionalStringSchema
})

export const BrowserCertificateProceedInputSchema = BrowserTargetInputSchema.extend({
  challengeId: requiredBrowserString('Missing required challengeId')
})

export type BrowserElementInput = z.output<typeof BrowserElementInputSchema>
export type BrowserGotoInput = z.output<typeof BrowserGotoInputSchema>
export type BrowserFillInput = z.output<typeof BrowserFillInputSchema>
export type BrowserTypeInput = z.output<typeof BrowserTypeInputSchema>
export type BrowserSelectInput = z.output<typeof BrowserSelectInputSchema>
export type BrowserScrollInput = z.output<typeof BrowserScrollInputSchema>
export type BrowserScreenshotInput = z.output<typeof BrowserScreenshotInputSchema>
export type BrowserFullScreenshotInput = z.output<typeof BrowserFullScreenshotInputSchema>
export type BrowserScreencastInput = z.output<typeof BrowserScreencastInputSchema>
export type BrowserScreencastUnsubscribeInput = z.output<
  typeof BrowserScreencastUnsubscribeInputSchema
>
export type BrowserEvalInput = z.output<typeof BrowserEvalInputSchema>
export type BrowserDragInput = z.output<typeof BrowserDragInputSchema>
export type BrowserUploadInput = z.output<typeof BrowserUploadInputSchema>
export type BrowserWaitInput = z.output<typeof BrowserWaitInputSchema>
export type BrowserCheckInput = z.output<typeof BrowserCheckInputSchema>
export type BrowserKeypressInput = z.output<typeof BrowserKeypressInputSchema>
export type BrowserSelectorPathInput = z.output<typeof BrowserSelectorPathInputSchema>
export type BrowserHighlightInput = z.output<typeof BrowserHighlightInputSchema>
export type BrowserExecInput = z.output<typeof BrowserExecInputSchema>
export type BrowserGetInput = z.output<typeof BrowserGetInputSchema>
export type BrowserIsInput = z.output<typeof BrowserIsInputSchema>
export type BrowserKeyboardInsertInput = z.output<typeof BrowserKeyboardInsertInputSchema>
export type BrowserLimitInput = z.output<typeof BrowserLimitInputSchema>
export type BrowserFindInput = z.output<typeof BrowserFindInputSchema>
export type BrowserCertificateProceedInput = z.output<typeof BrowserCertificateProceedInputSchema>
