import { z } from 'zod'

import {
  BrowserOptionalBooleanSchema,
  BrowserOptionalFiniteNumberSchema,
  BrowserOptionalPlainStringSchema,
  BrowserTargetInputSchema,
  requiredBrowserString
} from './target-input.js'

export const BrowserCookieGetInputSchema = BrowserTargetInputSchema.extend({
  url: BrowserOptionalPlainStringSchema
})

export const BrowserCookieSetInputSchema = BrowserTargetInputSchema.extend({
  name: z.custom<string>((value) => typeof value === 'string' && value.length > 0, {
    message: 'Missing name or value'
  }),
  value: z.custom<string>((value) => typeof value === 'string', {
    message: 'Missing name or value'
  }),
  domain: BrowserOptionalPlainStringSchema,
  path: BrowserOptionalPlainStringSchema,
  secure: BrowserOptionalBooleanSchema,
  httpOnly: BrowserOptionalBooleanSchema,
  sameSite: BrowserOptionalPlainStringSchema,
  expires: BrowserOptionalFiniteNumberSchema
})

export const BrowserCookieDeleteInputSchema = BrowserTargetInputSchema.extend({
  name: requiredBrowserString('Missing cookie name'),
  domain: BrowserOptionalPlainStringSchema,
  url: BrowserOptionalPlainStringSchema
})

export const BrowserViewportInputSchema = BrowserTargetInputSchema.extend({
  width: z.custom<number>((value) => typeof value === 'number' && value > 0, {
    message: 'Width and height must be positive numbers'
  }),
  height: z.custom<number>((value) => typeof value === 'number' && value > 0, {
    message: 'Width and height must be positive numbers'
  }),
  deviceScaleFactor: BrowserOptionalFiniteNumberSchema,
  mobile: BrowserOptionalBooleanSchema
})

export const BrowserGeolocationInputSchema = BrowserTargetInputSchema.extend({
  latitude: z.custom<number>((value) => typeof value === 'number', {
    message: 'Missing latitude or longitude'
  }),
  longitude: z.custom<number>((value) => typeof value === 'number', {
    message: 'Missing latitude or longitude'
  }),
  accuracy: BrowserOptionalFiniteNumberSchema
})

export const BrowserInterceptEnableInputSchema = BrowserTargetInputSchema.extend({
  patterns: z
    .unknown()
    .transform((value) => (Array.isArray(value) ? value : undefined))
    .pipe(z.union([z.array(z.string()), z.undefined()]))
    .optional()
})

export const BrowserMouseCoordinatesInputSchema = BrowserTargetInputSchema.extend({
  x: z.custom<number>((value) => typeof value === 'number', {
    message: 'Missing required x and y coordinates'
  }),
  y: z.custom<number>((value) => typeof value === 'number', {
    message: 'Missing required x and y coordinates'
  })
})

export const BrowserMouseButtonInputSchema = BrowserTargetInputSchema.extend({
  button: BrowserOptionalPlainStringSchema
})

const BrowserMouseModifiersSchema = z
  .unknown()
  .transform((value) => (Array.isArray(value) ? value : undefined))
  .pipe(z.union([z.array(z.enum(['cmd', 'ctrl', 'alt', 'shift'])), z.undefined()]))
  .optional()

export const BrowserMouseClickInputSchema = BrowserMouseCoordinatesInputSchema.merge(
  BrowserMouseButtonInputSchema
).extend({
  radius: BrowserOptionalFiniteNumberSchema,
  modifiers: BrowserMouseModifiersSchema
})

export const BrowserMouseWheelInputSchema = BrowserTargetInputSchema.extend({
  dy: z.custom<number>((value) => typeof value === 'number', {
    message: 'Missing required --dy'
  }),
  dx: BrowserOptionalFiniteNumberSchema
})

export const BrowserSetDeviceInputSchema = BrowserTargetInputSchema.extend({
  name: requiredBrowserString('Missing required --name')
})

export const BrowserSetOfflineInputSchema = BrowserTargetInputSchema.extend({
  state: BrowserOptionalPlainStringSchema
})

export const BrowserSetHeadersInputSchema = BrowserTargetInputSchema.extend({
  headers: requiredBrowserString('Missing required --headers (JSON string)')
})

export const BrowserSetCredentialsInputSchema = BrowserTargetInputSchema.extend({
  user: z.custom<string>((value) => typeof value === 'string' && value.length > 0, {
    message: 'Missing required --user and --pass'
  }),
  pass: z.custom<string>((value) => typeof value === 'string', {
    message: 'Missing required --user and --pass'
  })
})

export const BrowserSetMediaInputSchema = BrowserTargetInputSchema.extend({
  colorScheme: BrowserOptionalPlainStringSchema,
  reducedMotion: BrowserOptionalPlainStringSchema
})

export const BrowserClipboardWriteInputSchema = BrowserTargetInputSchema.extend({
  text: requiredBrowserString('Missing required --text')
})

export const BrowserDialogAcceptInputSchema = BrowserTargetInputSchema.extend({
  text: BrowserOptionalPlainStringSchema
})

export const BrowserStorageKeyInputSchema = BrowserTargetInputSchema.extend({
  key: requiredBrowserString('Missing required --key')
})

export const BrowserStorageKeyValueInputSchema = BrowserTargetInputSchema.extend({
  key: z.custom<string>((value) => typeof value === 'string' && value.length > 0, {
    message: 'Missing required --key and --value'
  }),
  value: z.custom<string>((value) => typeof value === 'string', {
    message: 'Missing required --key and --value'
  })
})

export type BrowserCookieGetInput = z.output<typeof BrowserCookieGetInputSchema>
export type BrowserCookieSetInput = z.output<typeof BrowserCookieSetInputSchema>
export type BrowserCookieDeleteInput = z.output<typeof BrowserCookieDeleteInputSchema>
export type BrowserViewportInput = z.output<typeof BrowserViewportInputSchema>
export type BrowserGeolocationInput = z.output<typeof BrowserGeolocationInputSchema>
export type BrowserInterceptEnableInput = z.output<typeof BrowserInterceptEnableInputSchema>
export type BrowserMouseCoordinatesInput = z.output<typeof BrowserMouseCoordinatesInputSchema>
export type BrowserMouseButtonInput = z.output<typeof BrowserMouseButtonInputSchema>
export type BrowserMouseClickInput = z.output<typeof BrowserMouseClickInputSchema>
export type BrowserMouseWheelInput = z.output<typeof BrowserMouseWheelInputSchema>
export type BrowserSetDeviceInput = z.output<typeof BrowserSetDeviceInputSchema>
export type BrowserSetOfflineInput = z.output<typeof BrowserSetOfflineInputSchema>
export type BrowserSetHeadersInput = z.output<typeof BrowserSetHeadersInputSchema>
export type BrowserSetCredentialsInput = z.output<typeof BrowserSetCredentialsInputSchema>
export type BrowserSetMediaInput = z.output<typeof BrowserSetMediaInputSchema>
export type BrowserClipboardWriteInput = z.output<typeof BrowserClipboardWriteInputSchema>
export type BrowserDialogAcceptInput = z.output<typeof BrowserDialogAcceptInputSchema>
export type BrowserStorageKeyInput = z.output<typeof BrowserStorageKeyInputSchema>
export type BrowserStorageKeyValueInput = z.output<typeof BrowserStorageKeyValueInputSchema>
