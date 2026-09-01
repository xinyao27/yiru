import { spawn, type ChildProcess } from 'node:child_process'

import { captureSubprocess } from '../../subprocess-capture'

export const DEFAULT_GIT_MAX_BUFFER = 10 * 1024 * 1024

export function createAbortError(): Error {
  const error = new Error('The operation was aborted.')
  error.name = 'AbortError'
  return error
}

export function killSpawnedCommandTree(child: ChildProcess): void {
  const pid = child.pid
  if (!pid || process.platform !== 'win32') {
    child.kill()
    return
  }
  try {
    // Why: Windows package-manager CLIs are often .cmd shims. Killing only
    // cmd.exe leaves the underlying node/npm/pnpm child running.
    const killer = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true
    })
    killer.on('error', () => child.kill())
    killer.unref()
  } catch {
    child.kill()
  }
}

type ExecFileCaptureOptions = {
  cwd?: string
  encoding?: BufferEncoding | 'buffer'
  env?: NodeJS.ProcessEnv
  maxBuffer?: number
  signal?: AbortSignal
  timeout?: number
  stdin?: string
}

export async function execFileCapture(
  command: string,
  args: string[],
  options: ExecFileCaptureOptions
): Promise<{ stdout: string | Buffer; stderr: string | Buffer }> {
  return captureSubprocess(command, args, {
    cwd: options.cwd,
    encoding: options.encoding,
    env: options.env,
    maxBufferBytes: options.maxBuffer ?? DEFAULT_GIT_MAX_BUFFER,
    signal: options.signal,
    stdin: options.stdin,
    timeoutMs: options.timeout
  })
}
