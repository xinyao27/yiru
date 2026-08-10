import { z } from 'zod'

export const CLIPBOARD_IMAGE_MAX_BASE64_CHARS = 24 * 1024 * 1024
export const CLIPBOARD_IMAGE_UPLOAD_CHUNK_BASE64_CHARS = 512 * 1024
export const CLIPBOARD_IMAGE_TOO_LARGE_ERROR = 'Clipboard image is too large'

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/

function isValidBase64(value: string): boolean {
  return value.length % 4 !== 1 && BASE64_PATTERN.test(value)
}

function clipboardImageBase64Payload(maxChars: number, tooLargeMessage: string) {
  return z.unknown().transform((value, context): string => {
    if (typeof value !== 'string') {
      context.addIssue({ code: 'custom', message: 'Missing image content' })
      return z.NEVER
    }
    if (value.length > maxChars) {
      context.addIssue({ code: 'custom', message: tooLargeMessage })
      return z.NEVER
    }
    if (!isValidBase64(value)) {
      context.addIssue({ code: 'custom', message: 'Clipboard image content must be base64' })
      return z.NEVER
    }
    return value
  })
}

export const ClipboardSaveImageAsTempFileInputSchema = z.object({
  contentBase64: clipboardImageBase64Payload(
    CLIPBOARD_IMAGE_MAX_BASE64_CHARS,
    CLIPBOARD_IMAGE_TOO_LARGE_ERROR
  ),
  connectionId: z.string().min(1).nullable().optional()
})

export const ClipboardStartImageUploadInputSchema = z.object({
  expectedBase64Length: z
    .number()
    .int()
    .nonnegative()
    .max(CLIPBOARD_IMAGE_MAX_BASE64_CHARS, CLIPBOARD_IMAGE_TOO_LARGE_ERROR),
  connectionId: z.string().min(1).nullable().optional()
})

export const ClipboardAppendImageUploadChunkInputSchema = z.object({
  uploadId: z.string().min(1),
  offset: z.number().int().nonnegative(),
  contentBase64: clipboardImageBase64Payload(
    CLIPBOARD_IMAGE_UPLOAD_CHUNK_BASE64_CHARS,
    'Clipboard image chunk is too large'
  )
})

export const ClipboardCommitImageUploadInputSchema = z.object({
  uploadId: z.string().min(1)
})

export const ClipboardAbortImageUploadInputSchema = z.object({
  uploadId: z.string().min(1)
})

export type ClipboardSaveImageAsTempFileInput = z.infer<
  typeof ClipboardSaveImageAsTempFileInputSchema
>
export type ClipboardStartImageUploadInput = z.infer<typeof ClipboardStartImageUploadInputSchema>
export type ClipboardAppendImageUploadChunkInput = z.infer<
  typeof ClipboardAppendImageUploadChunkInputSchema
>
export type ClipboardCommitImageUploadInput = z.infer<typeof ClipboardCommitImageUploadInputSchema>
export type ClipboardAbortImageUploadInput = z.infer<typeof ClipboardAbortImageUploadInputSchema>
