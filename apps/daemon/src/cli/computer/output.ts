import { chmodSync, lstatSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { RuntimeComputerScreenshotData } from '@yiru/runtime-protocol/contract'

const SCREENSHOT_TTL_MS = 24 * 60 * 60 * 1000
const SCREENSHOT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000
const SCREENSHOT_CLEANUP_MARKER = '.last-cleanup'

export async function writeComputerOutput(
  result: unknown,
  json: boolean,
  summary: string
): Promise<void> {
  if (!json) {
    console.log(summary)
    return
  }
  const prepared = await prepareComputerResult(result)
  console.log(JSON.stringify({ ok: true, result: prepared }))
}

async function prepareComputerResult(result: unknown): Promise<unknown> {
  if (!result || typeof result !== 'object') {
    return result
  }
  const screenshot = Reflect.get(result, 'screenshot')
  if (!isInlineScreenshot(screenshot)) {
    return result
  }
  try {
    const outputDirectory = computerScreenshotDirectory()
    cleanupComputerScreenshots(outputDirectory)
    const outputPath = join(outputDirectory, `${crypto.randomUUID()}-screenshot.png`)
    await Bun.write(outputPath, Uint8Array.fromBase64(screenshot.data))
    chmodSync(outputPath, 0o600)
    return {
      ...result,
      screenshot: {
        ...screenshot,
        data: undefined,
        dataOmitted: true,
        expiresAt: new Date(Date.now() + SCREENSHOT_TTL_MS).toISOString(),
        path: outputPath
      }
    }
  } catch {
    // Why: exporting pixels is a CLI ergonomics optimization; inline data is
    // still a valid protocol result when a temp directory is unavailable.
    return result
  }
}

function isInlineScreenshot(value: unknown): value is RuntimeComputerScreenshotData & {
  data: string
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'data') === 'string' &&
    Reflect.get(value, 'data').length > 0
  )
}

function computerScreenshotDirectory(): string {
  const outputDirectory =
    process.env.YIRU_COMPUTER_SCREENSHOT_TMPDIR?.trim() || join(tmpdir(), 'yiru-computer-use')
  mkdirSync(outputDirectory, { mode: 0o700, recursive: true })
  const status = lstatSync(outputDirectory)
  if (!status.isDirectory() || status.isSymbolicLink()) {
    throw new Error('computer_screenshot_directory_unsafe')
  }
  if (typeof process.getuid === 'function' && status.uid !== process.getuid()) {
    throw new Error('computer_screenshot_directory_not_owned')
  }
  chmodSync(outputDirectory, 0o700)
  return outputDirectory
}

function cleanupComputerScreenshots(outputDirectory: string): void {
  const now = Date.now()
  const markerPath = join(outputDirectory, SCREENSHOT_CLEANUP_MARKER)
  try {
    if (statSync(markerPath).mtimeMs > now - SCREENSHOT_CLEANUP_INTERVAL_MS) {
      return
    }
  } catch {}
  const cutoff = now - SCREENSHOT_TTL_MS
  for (const entry of readdirSync(outputDirectory)) {
    if (!entry.endsWith('-screenshot.png')) {
      continue
    }
    const path = join(outputDirectory, entry)
    try {
      if (statSync(path).mtimeMs < cutoff) {
        rmSync(path, { force: true })
      }
    } catch {}
  }
  try {
    void Bun.write(markerPath, String(now)).catch(() => {})
  } catch {}
}
