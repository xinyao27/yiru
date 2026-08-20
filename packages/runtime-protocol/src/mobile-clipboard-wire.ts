import { z } from 'zod'

import {
  CLIPBOARD_IMAGE_MAX_BASE64_CHARS,
  CLIPBOARD_IMAGE_UPLOAD_CHUNK_BASE64_CHARS
} from './clipboard.js'

export const MOBILE_CLIPBOARD_SAVE_IMAGE_ORPC_PATH = '/clipboard/saveImageAsTempFile'
export const MOBILE_CLIPBOARD_START_IMAGE_UPLOAD_ORPC_PATH = '/clipboard/startImageUpload'
export const MOBILE_CLIPBOARD_APPEND_IMAGE_UPLOAD_ORPC_PATH = '/clipboard/appendImageUploadChunk'
export const MOBILE_CLIPBOARD_COMMIT_IMAGE_UPLOAD_ORPC_PATH = '/clipboard/commitImageUpload'
export const MOBILE_CLIPBOARD_ABORT_IMAGE_UPLOAD_ORPC_PATH = '/clipboard/abortImageUpload'

export const MobileClipboardSaveImageRequestSchema = z.object({
  contentBase64: z.string().max(CLIPBOARD_IMAGE_MAX_BASE64_CHARS),
  connectionId: z.string().min(1).nullable().optional()
})

export const MobileClipboardStartUploadRequestSchema = z.object({
  expectedBase64Length: z.number().int().nonnegative().max(CLIPBOARD_IMAGE_MAX_BASE64_CHARS),
  connectionId: z.string().min(1).nullable().optional()
})

export const MobileClipboardStartUploadResultSchema = z.object({ uploadId: z.string().min(1) })

export const MobileClipboardAppendUploadRequestSchema = z.object({
  uploadId: z.string().min(1),
  offset: z.number().int().nonnegative(),
  contentBase64: z.string().max(CLIPBOARD_IMAGE_UPLOAD_CHUNK_BASE64_CHARS)
})

export const MobileClipboardAppendUploadResultSchema = z.object({
  receivedBase64Length: z.number().int().nonnegative()
})

export const MobileClipboardUploadIDRequestSchema = z.object({ uploadId: z.string().min(1) })
export const MobileClipboardAbortResultSchema = z.object({ aborted: z.boolean() })

export const MOBILE_CLIPBOARD_IMAGE_MAX_BASE64_CHARS = CLIPBOARD_IMAGE_MAX_BASE64_CHARS
export const MOBILE_CLIPBOARD_IMAGE_CHUNK_BASE64_CHARS = CLIPBOARD_IMAGE_UPLOAD_CHUNK_BASE64_CHARS
