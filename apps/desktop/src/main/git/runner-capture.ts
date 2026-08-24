import { execFile, spawn, type ChildProcess, type ExecFileOptions } from 'node:child_process'

import { endSubprocessStdin } from '~shared/subprocess-stdin-write'

import { recordSubprocessSpawn } from '../diagnostics/main-thread-churn-probe'

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

type ExecFileCaptureOptions = Omit<ExecFileOptions, 'timeout'> & {
  timeout?: number
  stdin?: string
}

function emptyExecFileOutput(options: ExecFileCaptureOptions): string | Buffer {
  return options.encoding === 'buffer' ? Buffer.alloc(0) : ''
}

function isExecFileResultObject(
  value: unknown
): value is { stdout: string | Buffer; stderr: string | Buffer } {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Buffer.isBuffer(value) &&
    'stdout' in value &&
    'stderr' in value
  )
}

export function execFileCapture(
  command: string,
  args: string[],
  options: ExecFileCaptureOptions
): Promise<{ stdout: string | Buffer; stderr: string | Buffer }> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(createAbortError())
      return
    }

    let settled = false
    let child: ChildProcess | null = null
    let timer: NodeJS.Timeout | null = null
    const cleanup = (): void => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      options.signal?.removeEventListener('abort', onAbort)
    }
    const finish = (
      error: Error | null,
      stdout: string | Buffer = emptyExecFileOutput(options),
      stderr: string | Buffer = emptyExecFileOutput(options)
    ): void => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      if (error) {
        const enriched = error as Error & { stdout?: string | Buffer; stderr?: string | Buffer }
        enriched.stdout ??= stdout
        enriched.stderr ??= stderr
        reject(enriched)
        return
      }
      resolve({ stdout, stderr })
    }
    const onAbort = (): void => {
      if (child) {
        killSpawnedCommandTree(child)
      }
      finish(createAbortError())
    }

    try {
      const spawnStartedAt = performance.now()
      child = execFile(
        command,
        args,
        {
          cwd: options.cwd,
          encoding: options.encoding,
          maxBuffer: options.maxBuffer ?? DEFAULT_GIT_MAX_BUFFER,
          env: options.env,
          signal: options.signal
        },
        (error, stdout, stderr) => {
          if (!error && stderr === undefined && isExecFileResultObject(stdout)) {
            finish(null, stdout.stdout, stdout.stderr)
            return
          }
          finish(error, stdout, stderr)
        }
      )
      recordSubprocessSpawn(command, args, performance.now() - spawnStartedAt)
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)))
      return
    }

    child.once('error', (error) => finish(error))

    if (options.stdin !== undefined) {
      endSubprocessStdin(child.stdin, options.stdin)
    }

    // Why: Node's native execFile timeout waits for the child to exit after
    // signaling it. Some CLIs ignore that signal, so reject the UI operation
    // on our own timer and kill the child only as best effort.
    if (options.timeout && options.timeout > 0) {
      timer = setTimeout(() => {
        if (child) {
          killSpawnedCommandTree(child)
        }
        finish(new Error(`${command} timed out.`))
      }, options.timeout)
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })
  })
}
