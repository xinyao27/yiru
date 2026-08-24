import { execFileSync, spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'

import { recordSubprocessSpawn } from '../diagnostics/main-thread-churn-probe'
import { withGitSpan } from '../observability/instrumentation'
import {
  createAbortError,
  DEFAULT_GIT_MAX_BUFFER,
  execFileCapture,
  killSpawnedCommandTree
} from './runner-capture'
import { resolveCommand } from './runner-command'
import {
  buildNetworkSshPolicyEnv,
  nonInteractiveGitEnv,
  untranslatedGitOutputEnv
} from './runner-env'
import type { GitExecOptions } from './runner-model'

/**
 * Async git command execution. Drop-in replacement for
 * `execFileAsync('git', args, { cwd, encoding, ... })`.
 */
export async function gitExecFileAsync(
  args: string[],
  options: GitExecOptions
): Promise<{ stdout: string; stderr: string }> {
  // Why wrap here: the resolved binary path / WSL detection is internal
  // detail; the span attributes track the user-visible `git <subcommand>
  // <args…>` form so dashboards group cleanly by intent rather than by
  // platform-conditional binary path.
  return withGitSpan(
    { args, ...(options.cwd !== undefined ? { cwd: options.cwd } : {}) },
    async () => {
      const resolved = resolveCommand('git', args, options.cwd, options.wslDistro, {
        useWslLoginShell: Boolean(options.wslDistro)
      })
      const policy = options.useConfiguredSshCommandForNetwork
        ? await buildNetworkSshPolicyEnv(options)
        : { env: nonInteractiveGitEnv(options.env), mode: 'default' as const }
      let result: { stdout: string | Buffer; stderr: string | Buffer }
      try {
        result = await execFileCapture(resolved.binary, resolved.args, {
          cwd: resolved.cwd,
          encoding: (options.encoding ?? 'utf-8') as BufferEncoding,
          maxBuffer: options.maxBuffer,
          timeout: options.timeout,
          stdin: options.stdin,
          // Why: never let a git read-path call block on an interactive prompt
          // (issue #5308) — fail fast instead of hanging the runtime.
          env: policy.env,
          signal: options.signal
        })
      } catch (error) {
        if (options.useConfiguredSshCommandForNetwork && error && typeof error === 'object') {
          Object.assign(error, { gitSshPolicyMode: policy.mode })
        }
        throw error
      }
      const { stdout, stderr } = result
      return { stdout: stdout as string, stderr: stderr as string }
    }
  )
}

/**
 * Async git command execution that returns a Buffer.
 * Used for reading binary blobs (git show).
 */
export async function gitExecFileAsyncBuffer(
  args: string[],
  options: { cwd: string; maxBuffer?: number; wslDistro?: string }
): Promise<{ stdout: Buffer }> {
  const resolved = resolveCommand('git', args, options.cwd, options.wslDistro, {
    useWslLoginShell: Boolean(options.wslDistro)
  })
  const { stdout } = (await execFileCapture(resolved.binary, resolved.args, {
    cwd: resolved.cwd,
    encoding: 'buffer',
    maxBuffer: options.maxBuffer,
    env: untranslatedGitOutputEnv()
  })) as { stdout: Buffer }
  return { stdout }
}

/** Result of a streamed git command. `stoppedEarly` is true when the caller's
 * onStdout hook asked to stop and the child was killed before exiting. */
export type GitStreamResult = { stoppedEarly: boolean }

type GitStreamOptions = {
  cwd: string
  env?: NodeJS.ProcessEnv
  wslDistro?: string
  signal?: AbortSignal
  /** Byte backstop; defaults to DEFAULT_GIT_MAX_BUFFER. */
  maxBuffer?: number
  /**
   * Called for each decoded stdout chunk as it arrives. Return true to stop:
   * the child is killed and the promise resolves with stoppedEarly=true. This
   * lets a streaming parser bail out (e.g. once an entry limit is reached)
   * without ever buffering the full output.
   */
  onStdout: (chunk: string) => boolean | void
}

/**
 * Stream a git command's stdout incrementally instead of buffering it whole.
 *
 * Why: status on a repo with an enormous un-ignored folder can emit more output
 * than fits in a single string, crashing the process when buffered. Streaming
 * lets the parser count entries as they arrive and stop git the moment a limit
 * is crossed, so memory stays bounded. Built on gitSpawn so WSL routing is
 * preserved. stderr is bounded; a non-zero exit rejects (unless we stopped it).
 */
export async function gitStreamStdout(
  args: string[],
  options: GitStreamOptions
): Promise<GitStreamResult> {
  const maxBuffer = options.maxBuffer ?? DEFAULT_GIT_MAX_BUFFER
  return withGitSpan({ args, cwd: options.cwd }, async () => {
    return new Promise<GitStreamResult>((resolve, reject) => {
      if (options.signal?.aborted) {
        reject(createAbortError())
        return
      }
      const child = gitSpawn(args, {
        cwd: options.cwd,
        env: nonInteractiveGitEnv(options.env),
        stdio: ['ignore', 'pipe', 'pipe'],
        wslDistro: options.wslDistro,
        windowsHide: true
      })

      let settled = false
      let stoppedEarly = false
      let stdoutBytes = 0
      let stderr = ''
      let stderrBytes = 0
      // Why: decode statefully so a multibyte UTF-8 character split across two
      // chunks (common with non-ASCII filenames) isn't corrupted into
      // replacement characters and mis-parsed.
      const stdoutDecoder = new StringDecoder('utf8')
      const stderrDecoder = new StringDecoder('utf8')

      const cleanup = (): void => {
        child.stdout?.off('data', onStdoutData)
        child.stderr?.off('data', onStderrData)
        child.off('error', onError)
        child.off('close', onClose)
        options.signal?.removeEventListener('abort', onAbort)
        // Flush any bytes the decoders were holding for an incomplete sequence.
        stdoutDecoder.end()
        stderrDecoder.end()
      }
      const finish = (error: Error | null): void => {
        if (settled) {
          return
        }
        settled = true
        cleanup()
        if (error) {
          reject(Object.assign(error, { stderr }))
          return
        }
        resolve({ stoppedEarly })
      }

      function onStdoutData(chunk: Buffer): void {
        stdoutBytes += chunk.byteLength
        if (stdoutBytes > maxBuffer) {
          killSpawnedCommandTree(child)
          finish(new Error('git stdout exceeded maxBuffer.'))
          return
        }
        const decoded = stdoutDecoder.write(chunk)
        if (decoded.length === 0) {
          return
        }
        // Why: the parser callback is caller-supplied; a throw here would escape
        // the stream event handler and crash the main process (the exact failure
        // mode this streaming path exists to prevent). Convert it to a rejection.
        let shouldStop: boolean | void
        try {
          shouldStop = options.onStdout(decoded)
        } catch (error) {
          killSpawnedCommandTree(child)
          finish(error instanceof Error ? error : new Error(String(error)))
          return
        }
        if (shouldStop === true) {
          // Why: parser hit its limit. Kill git and resolve cleanly — the
          // partial output we already parsed is the intended result.
          stoppedEarly = true
          killSpawnedCommandTree(child)
          finish(null)
        }
      }
      function onStderrData(chunk: Buffer): void {
        stderrBytes += chunk.byteLength
        if (stderrBytes > maxBuffer) {
          killSpawnedCommandTree(child)
          finish(new Error('git stderr exceeded maxBuffer.'))
          return
        }
        stderr += stderrDecoder.write(chunk)
      }
      function onError(error: Error): void {
        finish(error)
      }
      function onClose(code: number | null): void {
        if (stoppedEarly || code === 0) {
          finish(null)
          return
        }
        finish(new Error(`git exited with ${code}: ${stderr}`))
      }
      function onAbort(): void {
        killSpawnedCommandTree(child)
        finish(createAbortError())
      }

      child.stdout?.on('data', onStdoutData)
      child.stderr?.on('data', onStderrData)
      child.on('error', onError)
      child.on('close', onClose)
      options.signal?.addEventListener('abort', onAbort, { once: true })
      if (options.signal?.aborted) {
        onAbort()
      }
    })
  })
}

// Why: sync git calls run on the Electron main thread. Local git is normally
// fast, but a repo on a dead network drive / cloud-placeholder path can hang
// git on filesystem timeouts for minutes with no timeout set — the leading
// explanation for issue #7225's 127s "Not Responding" freeze. Callers needing
// longer operations should use the async runners instead.
const GIT_EXEC_SYNC_TIMEOUT_MS = 15_000

/**
 * Sync git command execution. Drop-in replacement for
 * `execFileSync('git', args, { cwd, encoding, ... })`.
 *
 * Returns trimmed stdout as a string.
 */
export function gitExecFileSync(
  args: string[],
  options: {
    cwd: string
    encoding?: BufferEncoding
    stdio?: SpawnOptions['stdio']
    timeout?: number
  }
): string {
  const resolved = resolveCommand('git', args, options.cwd)
  const spawnStartedAt = performance.now()
  try {
    return execFileSync(resolved.binary, resolved.args, {
      cwd: resolved.cwd,
      encoding: options.encoding ?? 'utf-8',
      env: untranslatedGitOutputEnv(),
      stdio: options.stdio ?? ['pipe', 'pipe', 'pipe'],
      timeout: options.timeout ?? GIT_EXEC_SYNC_TIMEOUT_MS
    }) as string
  } finally {
    // Sync exec holds the main thread for its whole duration, so the entire
    // call is main-thread block time — the cost issue #7576 flags.
    recordSubprocessSpawn(resolved.binary, resolved.args, performance.now() - spawnStartedAt)
  }
}

/**
 * Spawn a git child process. Drop-in replacement for
 * `spawn('git', args, { cwd, stdio, ... })`.
 */
export function gitSpawn(
  args: string[],
  options: SpawnOptions & { cwd: string; wslDistro?: string }
): ChildProcess {
  const { wslDistro, ...spawnOptions } = options
  const resolved = resolveCommand('git', args, options.cwd, wslDistro, {
    useWslLoginShell: Boolean(wslDistro)
  })
  const spawnStartedAt = performance.now()
  const child = spawn(resolved.binary, resolved.args, {
    ...spawnOptions,
    env: untranslatedGitOutputEnv(spawnOptions.env ?? process.env),
    cwd: resolved.cwd
  })
  recordSubprocessSpawn(resolved.binary, resolved.args, performance.now() - spawnStartedAt)
  return child
}

// ─── gh CLI runners ─────────────────────────────────────────────────

// Why: non-repo-scoped gh calls (listAccessibleProjects, rate_limit, etc.)
// have no meaningful cwd. Allow it to be omitted so the one WSL-aware wrapper
// serves both repo-scoped and global callers and we stop having two spawn
// sites (the other one — a plain execFileAsync in project-view.ts — bypasses
// retry/backoff and any future quota tracker).
// Why: `wslDistro` is an explicit hint for global (cwd-less) gh callers on
// WSL-only Windows installs where gh.exe isn't on the host PATH. When set,
// resolveCommand routes the spawn through `wsl.exe -d <distro> -- gh ...`
// even without a UNC cwd to parse a distro from. Repo-scoped callers should
// keep using cwd — the distro derives from the path automatically there.
// Why: `idempotent` gates the transient-error retry. When undefined we
// auto-detect from argv (writes are detected by `-X POST/PATCH/PUT/DELETE`
// or a `query=mutation …` arg); callers can also pass an explicit override.
// A 5xx/socket reset after the request reaches GitHub but before the
// response returns is the canonical case where the server-side write
// succeeded; retrying would create a duplicate comment or label addition.
// See bug-scan finding 1.
