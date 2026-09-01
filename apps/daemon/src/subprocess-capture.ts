import { recordSubprocessSpawn } from './diagnostics/main-thread-churn-probe'

const DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES = 10 * 1024 * 1024

export type SubprocessCaptureOptions = {
  cwd?: string
  encoding?: BufferEncoding | 'buffer'
  env?: NodeJS.ProcessEnv
  maxBufferBytes?: number
  signal?: AbortSignal
  stdin?: string
  timeoutMs?: number
}

export type SubprocessCapture = {
  stderr: string | Buffer
  stdout: string | Buffer
}

export async function captureSubprocess(
  command: string,
  args: readonly string[],
  options: SubprocessCaptureOptions = {}
): Promise<SubprocessCapture> {
  options.signal?.throwIfAborted()
  const spawnStartedAt = performance.now()
  const child = Bun.spawn([command, ...args], {
    ...(options.cwd ? { cwd: options.cwd } : {}),
    env: options.env,
    signal: options.signal,
    stderr: 'pipe',
    stdin: options.stdin === undefined ? 'ignore' : 'pipe',
    stdout: 'pipe',
    windowsHide: true
  })
  recordSubprocessSpawn(command, [...args], performance.now() - spawnStartedAt)
  if (options.stdin !== undefined) {
    const stdin = child.stdin
    if (!stdin) {
      throw new Error(`${command} was started without a writable stdin.`)
    }
    stdin.write(options.stdin)
    stdin.end()
  }

  let didTimeout = false
  const timeout =
    options.timeoutMs && options.timeoutMs > 0
      ? setTimeout(() => {
          didTimeout = true
          killSubprocessTree(child)
        }, options.timeoutMs)
      : null
  const maxBufferBytes = options.maxBufferBytes ?? DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES
  try {
    const [exitCode, stdoutBuffer, stderrBuffer] = await Promise.all([
      child.exited,
      readBoundedOutput(child.stdout, maxBufferBytes, () => killSubprocessTree(child)),
      readBoundedOutput(child.stderr, maxBufferBytes, () => killSubprocessTree(child))
    ])
    const stdout = decodeOutput(stdoutBuffer, options.encoding)
    const stderr = decodeOutput(stderrBuffer, options.encoding)
    if (options.signal?.aborted) {
      const error = new Error('The operation was aborted.')
      error.name = 'AbortError'
      throw enrichCaptureError(error, stdout, stderr)
    }
    if (didTimeout) {
      throw enrichCaptureError(
        new Error(`${command} timed out after ${options.timeoutMs}ms.`),
        stdout,
        stderr
      )
    }
    if (exitCode !== 0) {
      throw enrichCaptureError(
        Object.assign(new Error(`${command} exited with code ${exitCode}.`), { code: exitCode }),
        stdout,
        stderr
      )
    }
    return { stderr, stdout }
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}

async function readBoundedOutput(
  stream: ReadableStream<Uint8Array>,
  maxBufferBytes: number,
  onOverflow: () => void
): Promise<Buffer> {
  const reader = stream.getReader()
  const chunks: Buffer[] = []
  let size = 0
  while (true) {
    const next = await reader.read()
    if (next.done) {
      return Buffer.concat(chunks, size)
    }
    size += next.value.byteLength
    if (size > maxBufferBytes) {
      onOverflow()
      throw Object.assign(new Error('Subprocess output exceeded maxBuffer.'), {
        code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
      })
    }
    chunks.push(Buffer.from(next.value))
  }
}

function decodeOutput(
  buffer: Buffer,
  encoding: BufferEncoding | 'buffer' | undefined
): string | Buffer {
  return encoding === 'buffer' ? buffer : buffer.toString(encoding ?? 'utf-8')
}

function enrichCaptureError(
  error: Error,
  stdout: string | Buffer = '',
  stderr: string | Buffer = ''
): Error {
  return Object.assign(error, { stderr, stdout })
}

function killSubprocessTree(child: ReturnType<typeof Bun.spawn>): void {
  if (process.platform !== 'win32') {
    child.kill()
    return
  }
  const killer = Bun.spawn(['taskkill', '/pid', String(child.pid), '/t', '/f'], {
    stderr: 'ignore',
    stdin: 'ignore',
    stdout: 'ignore',
    windowsHide: true
  })
  killer.unref()
}
