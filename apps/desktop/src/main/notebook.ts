import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'

import { resolveAuthorizedPath } from './filesystem/auth'
import type { Store } from './persistence'

export type NotebookRunResult = {
  stdout: string
  stderr: string
  exitCode: number | null
  error?: string
}

const PYTHON_RUN_TIMEOUT_MS = 60_000
const MAX_CAPTURE_BYTES = 2 * 1024 * 1024

type BoundedCapture = {
  text: string
  bytes: number
  truncated: boolean
}

function pythonCandidates(): { command: string; argsPrefix: string[] }[] {
  const configured = process.env.YIRU_NOTEBOOK_PYTHON?.trim()
  const candidates: { command: string; argsPrefix: string[] }[] = []
  if (configured) {
    candidates.push({ command: configured, argsPrefix: [] })
  }
  if (process.platform === 'win32') {
    candidates.push({ command: 'py', argsPrefix: ['-3'] })
  }
  candidates.push({ command: 'python3', argsPrefix: [] }, { command: 'python', argsPrefix: [] })
  return candidates
}

function appendBounded(capture: BoundedCapture, chunk: Buffer): void {
  if (capture.truncated) {
    return
  }
  const remainingBytes = MAX_CAPTURE_BYTES - capture.bytes
  if (remainingBytes <= 0) {
    capture.truncated = true
    return
  }
  if (chunk.byteLength <= remainingBytes) {
    capture.text += chunk.toString('utf8')
    capture.bytes += chunk.byteLength
    return
  }
  capture.text += `${chunk.subarray(0, remainingBytes).toString('utf8')}\n[output truncated]\n`
  capture.bytes = MAX_CAPTURE_BYTES
  capture.truncated = true
}

function terminateNotebookProcessTree(
  child: ChildProcessWithoutNullStreams
): ReturnType<typeof setTimeout> | null {
  if (!child.pid) {
    child.kill()
    return null
  }

  if (process.platform === 'win32') {
    try {
      // Why: a timed-out cell can spawn descendants. taskkill /T is the
      // Windows equivalent of terminating the whole process group.
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true
      })
      killer.on('error', () => child.kill())
      killer.unref()
    } catch {
      child.kill()
    }
    return null
  }

  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill()
  }

  const forceKillTimer = setTimeout(() => {
    try {
      process.kill(-child.pid!, 'SIGKILL')
    } catch {
      /* process group already exited */
    }
  }, 2000)
  forceKillTimer.unref?.()
  return forceKillTimer
}

function buildPythonExecutionCode(code: string, preamble: string): string {
  const payload = Buffer.from(JSON.stringify({ code, preamble }), 'utf8').toString('base64')
  return [
    'import base64, contextlib, io, json, sys, traceback',
    `payload = json.loads(base64.b64decode(${JSON.stringify(payload)}).decode("utf-8"))`,
    'namespace = {"__name__": "__main__"}',
    'try:',
    '    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):',
    '        exec(payload["preamble"], namespace)',
    '    exec(payload["code"], namespace)',
    'except Exception:',
    '    traceback.print_exc()',
    '    sys.exit(1)'
  ].join('\n')
}

async function runPythonCandidate(
  candidate: { command: string; argsPrefix: string[] },
  code: string,
  preamble: string,
  cwd: string
): Promise<NotebookRunResult> {
  return new Promise((resolve) => {
    const stdout: BoundedCapture = { text: '', bytes: 0, truncated: false }
    const stderr: BoundedCapture = { text: '', bytes: 0, truncated: false }
    let settled = false
    let forceKillTimer: ReturnType<typeof setTimeout> | null = null
    let timeout: ReturnType<typeof setTimeout> | null = null
    const child = spawn(
      candidate.command,
      [...candidate.argsPrefix, '-c', buildPythonExecutionCode(code, preamble)],
      {
        cwd,
        detached: process.platform !== 'win32',
        windowsHide: true,
        env: process.env
      }
    )
    const cleanup = (options: { clearForceKillTimer: boolean }): void => {
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
      if (forceKillTimer && options.clearForceKillTimer) {
        clearTimeout(forceKillTimer)
        forceKillTimer = null
      }
      child.stdout.off('data', onStdoutData)
      child.stderr.off('data', onStderrData)
      child.off('error', onError)
      child.off('close', onClose)
    }
    const finish = (
      result: NotebookRunResult,
      options: { clearForceKillTimer: boolean } = { clearForceKillTimer: true }
    ): void => {
      if (settled) {
        return
      }
      settled = true
      cleanup(options)
      resolve(result)
    }

    timeout = setTimeout(() => {
      forceKillTimer = terminateNotebookProcessTree(child)
      finish(
        {
          stdout: stdout.text,
          stderr: stderr.text,
          exitCode: null,
          error: 'Python cell timed out.'
        },
        { clearForceKillTimer: false }
      )
    }, PYTHON_RUN_TIMEOUT_MS)

    const onStdoutData = (chunk: Buffer): void => {
      appendBounded(stdout, chunk)
    }
    const onStderrData = (chunk: Buffer): void => {
      appendBounded(stderr, chunk)
    }
    const onError = (error: Error): void => {
      finish({ stdout: stdout.text, stderr: stderr.text, exitCode: null, error: error.message })
    }
    const onClose = (exitCode: number | null): void => {
      finish({
        stdout: stdout.text,
        stderr: stderr.text,
        exitCode
      })
    }

    child.stdout.on('data', onStdoutData)
    child.stderr.on('data', onStderrData)
    child.on('error', onError)
    child.on('close', onClose)
  })
}

// Why: exported so the oRPC runtime method (rpc/methods/notebook.ts) can spawn
// the same interpreter logic without duplicating it.
export async function runPythonCell(
  code: string,
  preamble: string,
  cwd: string
): Promise<NotebookRunResult> {
  if (!code.trim() && !preamble.trim()) {
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  let lastError = 'Python was not found.'
  for (const candidate of pythonCandidates()) {
    const result = await runPythonCandidate(candidate, code, preamble, cwd)
    if (!result.error?.includes('ENOENT')) {
      return result
    }
    lastError = result.error
  }
  return { stdout: '', stderr: '', exitCode: null, error: lastError }
}

let authorizedStore: Store | null = null

// Why: mirrors `resolveAuthorizedLogTailPath` (filesystem/local-log-tail.ts) —
// the oRPC runtime method has no per-call `Store` in its context, so it reuses
// the same store reference set at startup.
export async function resolveAuthorizedNotebookFilePath(filePath: string): Promise<string> {
  if (!authorizedStore) {
    throw new Error('Notebook execution is unavailable before store initialization')
  }
  return resolveAuthorizedPath(filePath, authorizedStore)
}

// Why: the only preload channel this module backed (`notebook:runPythonCell`)
// is gone — both the local and paired-environment call sites now go straight
// through the `notebook.runPythonCell` oRPC contract (rpc/methods/notebook.ts),
// which still needs this store reference to resolve/authorize a host path.
export function initializeNotebookAuthorizedStore(store: Store): void {
  authorizedStore = store
}
