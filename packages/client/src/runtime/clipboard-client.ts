import { CLIPBOARD_IMAGE_UPLOAD_CHUNK_BASE64_CHARS } from '@yiru/runtime-protocol/clipboard'

import { createLocalRuntimeOrpcClient } from './orpc-client'

const CLIPBOARD_IMAGE_SAVE_TIMEOUT_MS = 30_000

export async function saveLocalClipboardImageAsTempFile(
  connectionId?: string | null
): Promise<string | null> {
  const contentBase64 = await window.api.ui.readClipboardImageBase64()
  if (!contentBase64) {
    return null
  }

  const connection = createLocalRuntimeOrpcClient()
  const signal = AbortSignal.timeout(CLIPBOARD_IMAGE_SAVE_TIMEOUT_MS)
  let uploadId: string | null = null
  try {
    const started = await connection.client.clipboard.startImageUpload(
      {
        expectedBase64Length: contentBase64.length,
        connectionId
      },
      { signal }
    )
    uploadId = started.uploadId
    for (
      let offset = 0;
      offset < contentBase64.length;
      offset += CLIPBOARD_IMAGE_UPLOAD_CHUNK_BASE64_CHARS
    ) {
      await connection.client.clipboard.appendImageUploadChunk(
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
    return await connection.client.clipboard.commitImageUpload({ uploadId }, { signal })
  } catch (error) {
    if (uploadId) {
      await connection.client.clipboard
        .abortImageUpload({ uploadId }, { signal: AbortSignal.timeout(1_000) })
        .catch(() => {})
    }
    throw error
  } finally {
    connection.close()
  }
}
