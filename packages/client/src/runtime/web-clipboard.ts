import { CLIPBOARD_IMAGE_UPLOAD_CHUNK_BASE64_CHARS } from '@yiru/runtime-protocol/clipboard'
import {
  CLIPBOARD_IMAGE_MAX_BASE64_CHARS,
  CLIPBOARD_IMAGE_MAX_SOURCE_BYTES,
  CLIPBOARD_IMAGE_TOO_LARGE_ERROR,
  assertClipboardImageByteLengthWithinLimit,
  assertClipboardImageDimensionsWithinLimit
} from '@yiru/runtime-protocol/workbench/clipboard-image'

import { callRuntimeOrpc, isRuntimeOrpcErrorCode } from './orpc-client'

const CLIPBOARD_IMAGE_SAVE_TIMEOUT_MS = 30_000
const SINGLE_FRAME_FALLBACK_BASE64_CHARS = 256 * 1024

function assertImageBlobWithinLimit(blob: Blob): void {
  assertClipboardImageByteLengthWithinLimit(blob.size)
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error(CLIPBOARD_IMAGE_TOO_LARGE_ERROR))
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error(CLIPBOARD_IMAGE_TOO_LARGE_ERROR))
        return
      }
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(blob)
  })
}

async function convertImageBlobToPng(blob: Blob): Promise<Blob> {
  assertImageBlobWithinLimit(blob)
  const bitmap = await createImageBitmap(blob)
  try {
    assertClipboardImageDimensionsWithinLimit({ width: bitmap.width, height: bitmap.height })
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error(CLIPBOARD_IMAGE_TOO_LARGE_ERROR)
    }
    context.drawImage(bitmap, 0, 0)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((png) => {
        if (!png) {
          reject(new Error(CLIPBOARD_IMAGE_TOO_LARGE_ERROR))
          return
        }
        try {
          assertImageBlobWithinLimit(png)
          resolve(png)
        } catch (error) {
          reject(error)
        }
      }, 'image/png')
    })
  } finally {
    bitmap.close()
  }
}

export async function readWebClipboardImageBase64(): Promise<string | null> {
  const clipboard = navigator.clipboard as
    | (Clipboard & { read?: () => Promise<ClipboardItem[]> })
    | undefined
  if (!clipboard?.read) {
    return null
  }
  const items = await clipboard.read()
  for (const item of items) {
    const imageType = item.types.find((type) => type.startsWith('image/'))
    if (!imageType) {
      continue
    }
    const source = await item.getType(imageType)
    if (source.size > CLIPBOARD_IMAGE_MAX_SOURCE_BYTES) {
      throw new Error(CLIPBOARD_IMAGE_TOO_LARGE_ERROR)
    }
    const png = imageType === 'image/png' ? source : await convertImageBlobToPng(source)
    return blobToBase64(png)
  }
  return null
}

export async function writeWebClipboardImage(dataUrl: string): Promise<void> {
  const blob = await (await fetch(dataUrl)).blob()
  assertImageBlobWithinLimit(blob)
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    return
  }
  await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })])
}

export async function saveWebClipboardImageAsTempFile(args?: {
  connectionId?: string | null
  runtimeEnvironmentId?: string | null
}): Promise<string | null> {
  const contentBase64 = await readWebClipboardImageBase64()
  if (!contentBase64) {
    return null
  }
  if (contentBase64.length > CLIPBOARD_IMAGE_MAX_BASE64_CHARS) {
    throw new Error(CLIPBOARD_IMAGE_TOO_LARGE_ERROR)
  }
  const target = args?.runtimeEnvironmentId?.trim()
    ? { kind: 'environment' as const, environmentId: args.runtimeEnvironmentId.trim() }
    : { kind: 'local' as const }
  const connectionId = args?.connectionId ?? null
  const signal = AbortSignal.timeout(CLIPBOARD_IMAGE_SAVE_TIMEOUT_MS)
  let uploadId: string
  try {
    const started = await callRuntimeOrpc(
      target,
      (client) => client.clipboard.startImageUpload,
      { expectedBase64Length: contentBase64.length, connectionId },
      { signal }
    )
    uploadId = started.uploadId
  } catch (error) {
    if (
      isRuntimeOrpcErrorCode(error, 'method_not_found') &&
      contentBase64.length <= SINGLE_FRAME_FALLBACK_BASE64_CHARS
    ) {
      return callRuntimeOrpc(
        target,
        (client) => client.clipboard.saveImageAsTempFile,
        { contentBase64, connectionId },
        { signal }
      )
    }
    throw error
  }

  try {
    for (
      let offset = 0;
      offset < contentBase64.length;
      offset += CLIPBOARD_IMAGE_UPLOAD_CHUNK_BASE64_CHARS
    ) {
      await callRuntimeOrpc(
        target,
        (client) => client.clipboard.appendImageUploadChunk,
        {
          uploadId,
          offset,
          contentBase64: contentBase64.slice(
            offset,
            offset + CLIPBOARD_IMAGE_UPLOAD_CHUNK_BASE64_CHARS
          )
        },
        { signal }
      )
    }
    return await callRuntimeOrpc(
      target,
      (client) => client.clipboard.commitImageUpload,
      { uploadId },
      { signal }
    )
  } catch (error) {
    await callRuntimeOrpc(
      target,
      (client) => client.clipboard.abortImageUpload,
      { uploadId },
      { timeoutMs: 1_000 }
    ).catch(() => {})
    throw error
  }
}
