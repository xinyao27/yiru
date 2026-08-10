import { type, type ContractRouter } from '@orpc/contract'

import {
  ClipboardAbortImageUploadInputSchema,
  ClipboardAppendImageUploadChunkInputSchema,
  ClipboardCommitImageUploadInputSchema,
  ClipboardSaveImageAsTempFileInputSchema,
  ClipboardStartImageUploadInputSchema
} from '../clipboard.js'
import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

const CLIPBOARD_ACCESS = { scope: 'host', tier: 'host' } as const
const CLIPBOARD_CLIENTS = { mobile: true } as const

export const clipboardContract = {
  saveImageAsTempFile: withAccess(CLIPBOARD_ACCESS, CLIPBOARD_CLIENTS)
    .input(ClipboardSaveImageAsTempFileInputSchema)
    .output(type<string>()),
  startImageUpload: withAccess(CLIPBOARD_ACCESS, CLIPBOARD_CLIENTS)
    .input(ClipboardStartImageUploadInputSchema)
    .output(type<{ uploadId: string }>()),
  appendImageUploadChunk: withAccess(CLIPBOARD_ACCESS, CLIPBOARD_CLIENTS)
    .input(ClipboardAppendImageUploadChunkInputSchema)
    .output(type<{ receivedBase64Length: number }>()),
  commitImageUpload: withAccess(CLIPBOARD_ACCESS, CLIPBOARD_CLIENTS)
    .input(ClipboardCommitImageUploadInputSchema)
    .output(type<string>()),
  abortImageUpload: withAccess(CLIPBOARD_ACCESS, CLIPBOARD_CLIENTS)
    .input(ClipboardAbortImageUploadInputSchema)
    .output(type<{ aborted: boolean }>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export {
  CLIPBOARD_IMAGE_MAX_BASE64_CHARS,
  CLIPBOARD_IMAGE_TOO_LARGE_ERROR,
  CLIPBOARD_IMAGE_UPLOAD_CHUNK_BASE64_CHARS,
  ClipboardAbortImageUploadInputSchema,
  ClipboardAppendImageUploadChunkInputSchema,
  ClipboardCommitImageUploadInputSchema,
  ClipboardSaveImageAsTempFileInputSchema,
  ClipboardStartImageUploadInputSchema
} from '../clipboard.js'
export type {
  ClipboardAbortImageUploadInput,
  ClipboardAppendImageUploadChunkInput,
  ClipboardCommitImageUploadInput,
  ClipboardSaveImageAsTempFileInput,
  ClipboardStartImageUploadInput
} from '../clipboard.js'
