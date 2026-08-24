import { execFileCapture } from './runner-capture'
import { isHostCommandMissing, resolveCommand, resolveDefaultWslCli } from './runner-command'
import {
  argsLookIdempotent,
  extractExecError,
  GH_RETRY_AFTER_MAX_MS,
  GH_RETRY_DELAYS_MS,
  isTransientGhError,
  parseRetryAfterMs,
  sleep
} from './runner-gh'
import type { GitExecOptions } from './runner-model'

type GlabExecOptions = Omit<GitExecOptions, 'cwd'> & {
  cwd?: string
  wslDistro?: string
  idempotent?: boolean
  allowDefaultWslFallback?: boolean
}

/**
 * Async glab CLI execution. Drop-in replacement for
 * `execFileAsync('glab', args, { cwd, encoding, ... })`.
 *
 * Retry policy mirrors ghExecFileAsync.
 */
/**
 * glab's `--hostname` flag rejects a host that carries a port
 * ("error parsing --hostname: invalid hostname"). A self-hosted GitLab on a
 * non-default port (e.g. `gitlab.example.com:8443`) must instead be selected
 * via the `GITLAB_HOST` env var, which accepts `host:port`. Translate any
 * `--hostname host:port` pair into `GITLAB_HOST` so every call site (`api`,
 * `auth status`, …) works against ported self-hosted instances. Port-less
 * `--hostname` values are left untouched.
 */
function redirectPortedHostnameToEnv(
  args: string[],
  options: GlabExecOptions
): { args: string[]; options: GlabExecOptions } {
  const i = args.indexOf('--hostname')
  if (i === -1 || i + 1 >= args.length) {
    return { args, options }
  }
  const host = args[i + 1]
  if (!/^[^/\s]+:\d+$/.test(host)) {
    return { args, options }
  }
  return {
    args: [...args.slice(0, i), ...args.slice(i + 2)],
    options: { ...options, env: { ...(options.env ?? process.env), GITLAB_HOST: host } }
  }
}

export async function glabExecFileAsync(
  args: string[],
  options: GlabExecOptions = {}
): Promise<{ stdout: string; stderr: string }> {
  ;({ args, options } = redirectPortedHostnameToEnv(args, options))
  let resolved = resolveCommand('glab', args, options.cwd, options.wslDistro)
  let lastError: unknown
  let attemptedDefaultWslFallback = false
  for (let attempt = 0; attempt <= GH_RETRY_DELAYS_MS.length; attempt++) {
    options.signal?.throwIfAborted()
    try {
      const { stdout, stderr } = await execFileCapture(resolved.binary, resolved.args, {
        cwd: resolved.cwd,
        encoding: (options.encoding ?? 'utf-8') as BufferEncoding,
        maxBuffer: options.maxBuffer,
        timeout: options.timeout,
        env: options.env,
        signal: options.signal
      })
      return { stdout: stdout as string, stderr: stderr as string }
    } catch (err) {
      lastError = err
      const { stderr } = extractExecError(err)
      if (
        process.platform === 'win32' &&
        !attemptedDefaultWslFallback &&
        resolved.wsl === null &&
        !options.cwd &&
        !options.wslDistro &&
        options.allowDefaultWslFallback !== false &&
        isHostCommandMissing(err, 'glab')
      ) {
        const wslResolved = resolveDefaultWslCli('glab', args)
        if (wslResolved) {
          // Why: mirror gh's WSL-only fallback for global GitLab project/auth calls.
          resolved = wslResolved
          attemptedDefaultWslFallback = true
          attempt = -1
          continue
        }
      }
      const isLastAttempt = attempt >= GH_RETRY_DELAYS_MS.length
      // Why: mirror gh's write-safety gate. A transient error after GitLab
      // applies a POST/PATCH/PUT/DELETE must not create duplicate comments,
      // pull-request edits or merge actions through an automatic retry.
      const idempotent = options.idempotent ?? argsLookIdempotent(args)
      if (idempotent && !isLastAttempt && isTransientGhError(stderr)) {
        const retryAfterMs = parseRetryAfterMs(stderr)
        const delayMs =
          retryAfterMs !== null
            ? Math.min(retryAfterMs, GH_RETRY_AFTER_MAX_MS)
            : GH_RETRY_DELAYS_MS[attempt]
        await sleep(delayMs)
        continue
      }
      throw err
    }
  }
  throw lastError
}

// ─── Generic command runner (for rg, etc.) ──────────────────────────

/**
 * Spawn any command with WSL awareness.
 * Used for non-git binaries like `rg` that also need WSL routing.
 */
