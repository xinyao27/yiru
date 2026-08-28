import { posix, win32 } from 'node:path'
import { platform } from 'node:process'

import { captureSubprocess } from '../subprocess-capture'

const DU_TIMEOUT_MS = 120_000
const DU_MAX_BUFFER_BYTES = 16 * 1024 * 1024

function looksLikeWindowsPath(pathValue: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(pathValue) || pathValue.startsWith('\\\\')
}

export function basenameWorkspacePath(pathValue: string): string {
  return looksLikeWindowsPath(pathValue) ? win32.basename(pathValue) : posix.basename(pathValue)
}

export function joinWorkspacePath(parent: string, child: string): string {
  return looksLikeWindowsPath(parent) ? win32.join(parent, child) : posix.join(parent, child)
}

export function normalizeLocalDuPath(pathValue: string): string {
  const separator = platform === 'win32' ? '\\' : '/'
  const escapedSeparator = separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const trimmed = pathValue.replace(new RegExp(`${escapedSeparator}+$`), '')
  return trimmed.length > 0 ? trimmed : pathValue
}

export function parseDuDepthOneOutput(stdout: string): Map<string, number> {
  const sizes = new Map<string, number>()
  for (const line of stdout.split('\n')) {
    const normalizedLine = line.endsWith('\r') ? line.slice(0, -1) : line
    const match = /^(\d+)\s+(.+)$/.exec(normalizedLine)
    if (match) {
      sizes.set(normalizeLocalDuPath(match[2]), Number(match[1]) * 1024)
    }
  }
  return sizes
}

export async function readLocalDuDepthOne(
  rootPath: string,
  signal?: AbortSignal
): Promise<Map<string, number>> {
  const { stdout } = await captureSubprocess('du', ['-k', '-d', '1', rootPath], {
    maxBufferBytes: DU_MAX_BUFFER_BYTES,
    signal,
    timeoutMs: DU_TIMEOUT_MS
  })
  return parseDuDepthOneOutput(stdout.toString())
}
