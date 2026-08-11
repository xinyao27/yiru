import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'

import {
  assertClipboardTextWriteWithinLimitWithYield,
  assertClipboardTextWithinLimitWithYield,
  type ReadClipboardTextOptions
} from '@yiru/workbench-model/ui'
import { app, clipboard, nativeImage } from 'electron'
import {
  assertClipboardImageBase64LengthWithinLimit,
  assertClipboardImageByteLengthWithinLimit,
  assertClipboardImageDimensionsWithinLimit
} from '~shared/clipboard-image'

import { isENOENT, PATH_ACCESS_DENIED_MESSAGE, resolveAuthorizedPath } from '../filesystem/auth'
import type { Store } from '../persistence'
import {
  writeFileToClipboard,
  type ClipboardFileDeps,
  type ClipboardFileResult
} from './clipboard-file-copy'
import {
  saveClipboardImageBufferAsTempFile,
  type SaveClipboardImageAsTempFileArgs
} from './clipboard-image-temp-file'
import { saveClipboardImageBufferInRuntime } from './clipboard-runtime-image-upload'

async function saveClipboardImageBufferForTarget(
  buffer: Buffer,
  args?: SaveClipboardImageAsTempFileArgs
): Promise<string> {
  assertClipboardImageByteLengthWithinLimit(buffer.byteLength)
  const runtimeEnvironmentId = args?.runtimeEnvironmentId?.trim()
  if (runtimeEnvironmentId) {
    return saveClipboardImageBufferInRuntime(app.getPath('userData'), runtimeEnvironmentId, buffer)
  }
  return saveClipboardImageBufferAsTempFile(buffer)
}

function runCommand(command: string, args: string[], stdin?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'ignore'] })
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))
    )
    child.stdin?.end(stdin ?? '')
  })
}

export function createClipboardService(store: Store) {
  const resolveFilePath: ClipboardFileDeps['resolveFilePath'] = async (path) => {
    try {
      const authorizedPath = await resolveAuthorizedPath(path, store)
      await stat(authorizedPath)
      return { ok: true, path: authorizedPath }
    } catch (error) {
      if (error instanceof Error && error.message === PATH_ACCESS_DENIED_MESSAGE) {
        return { ok: false, reason: 'access-denied' }
      }
      return { ok: false, reason: isENOENT(error) ? 'not-found' : 'invalid-path' }
    }
  }
  const fileDeps = makeClipboardFileDeps(resolveFilePath)

  return {
    readText: (options?: ReadClipboardTextOptions): Promise<string> =>
      assertClipboardTextWithinLimitWithYield(clipboard.readText(), options),
    readSelectionText: (options?: ReadClipboardTextOptions): Promise<string> =>
      assertClipboardTextWithinLimitWithYield(clipboard.readText('selection'), options),
    readImageBase64: (): string | null => {
      const image = clipboard.readImage()
      if (image.isEmpty()) {
        return null
      }
      assertClipboardImageDimensionsWithinLimit(image.getSize())
      const buffer = image.toPNG()
      assertClipboardImageByteLengthWithinLimit(buffer.byteLength)
      return buffer.toString('base64')
    },
    saveImageAsTempFile: async (
      args?: SaveClipboardImageAsTempFileArgs
    ): Promise<string | null> => {
      const image = clipboard.readImage()
      if (image.isEmpty()) {
        return null
      }
      assertClipboardImageDimensionsWithinLimit(image.getSize())
      return saveClipboardImageBufferForTarget(image.toPNG(), args)
    },
    writeFile: (filePath: string): ClipboardFileResult | Promise<ClipboardFileResult> =>
      writeFileToClipboard(filePath, fileDeps),
    writeText: async (text: string): Promise<void> => {
      clipboard.writeText(await assertClipboardTextWriteWithinLimitWithYield(text))
    },
    writeSelectionText: async (text: string): Promise<void> => {
      clipboard.writeText(await assertClipboardTextWriteWithinLimitWithYield(text), 'selection')
    },
    writeImage: (dataUrl: string): void => {
      const prefix = 'data:image/png;base64,'
      if (!dataUrl.startsWith(prefix)) {
        return
      }
      const contentBase64 = dataUrl.slice(prefix.length)
      try {
        assertClipboardImageBase64LengthWithinLimit(contentBase64.length)
      } catch {
        return
      }
      const buffer = Buffer.from(contentBase64, 'base64')
      try {
        assertClipboardImageByteLengthWithinLimit(buffer.byteLength)
      } catch {
        return
      }
      const image = nativeImage.createFromBuffer(buffer)
      if (image.isEmpty()) {
        return
      }
      try {
        assertClipboardImageDimensionsWithinLimit(image.getSize())
      } catch {
        return
      }
      clipboard.writeImage(image)
    }
  }
}

export type ClipboardService = ReturnType<typeof createClipboardService>

function makeClipboardFileDeps(
  resolveFilePath: ClipboardFileDeps['resolveFilePath']
): ClipboardFileDeps {
  return {
    platform: process.platform,
    desktop: process.env.XDG_CURRENT_DESKTOP,
    resolveFilePath,
    writeBuffer: (format, buffer) => clipboard.writeBuffer(format, buffer),
    runCommand
  }
}
