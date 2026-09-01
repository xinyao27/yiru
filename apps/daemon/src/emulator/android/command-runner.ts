import { basename } from 'node:path'

import { captureSubprocess } from '../../subprocess-capture'
import { emulatorProbe, emulatorProbeError } from '../probe'

export type AndroidCommandResult = { stdout: string; stderr: string; code: number }

// Runs an Android SDK binary (adb/emulator) and resolves with its output. Never
// rejects — callers branch on `code` so a non-zero exit is data, not an throw.
export type AndroidCommandRunner = (
  binary: string,
  args: readonly string[],
  options?: { timeoutMs?: number }
) => Promise<AndroidCommandResult>

const DEFAULT_TIMEOUT_MS = 60_000
const MAX_BUFFER_BYTES = 16 * 1024 * 1024

export const execFileAndroidCommandRunner: AndroidCommandRunner = async (binary, args, options) => {
  try {
    const result = await captureSubprocess(binary, args, {
      maxBufferBytes: MAX_BUFFER_BYTES,
      timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
    })
    emulatorProbe('cmd', { bin: basename(binary), args })
    return { code: 0, stderr: result.stderr.toString(), stdout: result.stdout.toString() }
  } catch (error) {
    const code = subprocessExitCode(error)
    const stderr = subprocessOutput(error, 'stderr')
    emulatorProbeError('cmd.fail', error instanceof Error ? error : new Error(stderr), {
      bin: basename(binary),
      args,
      code,
      stderr: stderr.slice(0, 400)
    })
    return { code, stderr, stdout: subprocessOutput(error, 'stdout') }
  }
}

function subprocessExitCode(error: unknown): number {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'number'
    ? error.code
    : 1
}

function subprocessOutput(error: unknown, key: 'stderr' | 'stdout'): string {
  if (!error || typeof error !== 'object') {
    return ''
  }
  if (key === 'stderr' && 'stderr' in error) {
    return String(error.stderr)
  }
  if (key === 'stdout' && 'stdout' in error) {
    return String(error.stdout)
  }
  return ''
}
