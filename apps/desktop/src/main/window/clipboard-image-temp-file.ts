import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { app } from 'electron'
import { assertClipboardImageByteLengthWithinLimit } from '~shared/clipboard-image'

export type SaveClipboardImageAsTempFileArgs = {
  runtimeEnvironmentId?: string | null
}

export async function saveClipboardImageBufferAsTempFile(buffer: Buffer): Promise<string> {
  assertClipboardImageByteLengthWithinLimit(buffer.byteLength)

  const fileName = `yiru-paste-${Date.now()}-${randomUUID()}.png`

  const tempPath = path.join(app.getPath('temp'), fileName)
  await fs.writeFile(tempPath, buffer)
  return tempPath
}
