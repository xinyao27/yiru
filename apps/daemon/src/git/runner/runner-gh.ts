import {
  classifyGhRateLimitBucket,
  createGhRateLimitBlockedError,
  getGhRateLimitBlockedUntilMs,
  isGhPrimaryRateLimitStderr,
  isGhRateLimitProbe,
  notifyGhPrimaryRateLimit
} from './gh-rate-limit-breaker'
import { execFileCapture } from './runner-capture'
import {
  canFallBackToHostGitHubCli,
  isHostCommandMissing,
  resolveCommand,
  resolveDefaultWslCli,
  resolveHostGitHubCli
} from './runner-command'
import type { GitExecOptions } from './runner-model'

type GhExecOptions = Omit<GitExecOptions, 'cwd'> & {
  cwd?: string
  wslDistro?: string
  idempotent?: boolean
}

const NON_IDEMPOTENT_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])
// `gh <noun> <verb>` write subcommands. Reads (view/list/status/checks)
// are absent on purpose so the default of "retry" stays for them.
const NON_IDEMPOTENT_GH_VERBS = new Set([
  'create',
  'edit',
  'update',
  'delete',
  'close',
  'reopen',
  'merge',
  'comment',
  'review',
  'ready',
  'lock',
  'unlock',
  'pin',
  'unpin',
  'transfer',
  'develop'
])

export function argsLookIdempotent(args: string[]): boolean {
  let explicitMethodSeen = false
  let hasApiBodyField = false
  let hasGraphQlQuery = false
  const isGraphQlApi = args[0] === 'api' && args[1] === 'graphql'
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '-X' || a === '--method') {
      explicitMethodSeen = true
      const next = args[i + 1]
      if (typeof next === 'string' && NON_IDEMPOTENT_METHODS.has(next.toUpperCase())) {
        return false
      }
    }
    // Single-token form `--method=POST` (gh accepts this).
    if (a.startsWith('--method=')) {
      explicitMethodSeen = true
      const value = a.slice('--method='.length)
      if (NON_IDEMPOTENT_METHODS.has(value.toUpperCase())) {
        return false
      }
    }
    // `gh api` auto-switches GET→POST when -f/-F/--field/--raw-field body
    // fields are supplied without an explicit -X. Track those to classify
    // such calls as non-idempotent.
    if (a === '-f' || a === '-F' || a === '--field' || a === '--raw-field') {
      hasApiBodyField = true
    } else if (
      a.startsWith('-f=') ||
      a.startsWith('-F=') ||
      a.startsWith('--field=') ||
      a.startsWith('--raw-field=')
    ) {
      hasApiBodyField = true
    }
    // `gh api graphql -f query=mutation(...){ ... }` — detect mutation queries
    // so writes via the GraphQL endpoint also fail fast on transient errors.
    if (a.startsWith('query=')) {
      hasGraphQlQuery = true
      const trimmed = a.slice('query='.length).trimStart().toLowerCase()
      if (trimmed.startsWith('mutation')) {
        return false
      }
    }
  }
  // `gh api ... -f foo=bar` with no explicit method: gh switches to POST.
  // Treat as non-idempotent so a transient 5xx after the server applied
  // the write doesn't retry and duplicate it. GraphQL reads are the exception:
  // gh sends them as POST body fields, but a query operation is idempotent.
  if (
    args[0] === 'api' &&
    hasApiBodyField &&
    !explicitMethodSeen &&
    !(isGraphQlApi && hasGraphQlQuery)
  ) {
    return false
  }
  // `gh pr close`, `gh pr edit`, `gh pr merge`, etc. The first arg is the
  // noun (pr/repo/label/...) and the second is the verb. Defaulting
  // `gh api` calls without an explicit -X to GET-equivalent (idempotent) is
  // intentional: callers that POST through `gh api` set `-X POST`.
  if (args.length >= 2 && args[0] !== 'api') {
    if (NON_IDEMPOTENT_GH_VERBS.has(args[1])) {
      return false
    }
  }
  return true
}

/**
 * Extract stderr from an execFile rejection.
 *
 * Why: Node's execFile rejects with an Error that has `.stdout` and `.stderr`
 * fields populated separately from `.message`. Reading `err.message` alone is
 * unreliable — it can truncate stderr or omit it entirely depending on Node
 * version and maxBuffer behavior. We prefer the explicit fields and fall
 * back to `.message` only when neither is present.
 */
export function extractExecError(err: unknown): { stderr: string; stdout: string } {
  if (err && typeof err === 'object') {
    const e = err as { stderr?: unknown; stdout?: unknown; message?: unknown }
    const stderr =
      typeof e.stderr === 'string'
        ? e.stderr
        : Buffer.isBuffer(e.stderr)
          ? e.stderr.toString('utf-8')
          : ''
    const stdout =
      typeof e.stdout === 'string'
        ? e.stdout
        : Buffer.isBuffer(e.stdout)
          ? e.stdout.toString('utf-8')
          : ''
    if (stderr || stdout) {
      return { stderr, stdout }
    }
    if (typeof e.message === 'string') {
      return { stderr: e.message, stdout: '' }
    }
  }
  return { stderr: String(err), stdout: '' }
}

/**
 * Detect a Retry-After hint in gh stderr and return the suggested delay in ms,
 * or null when the response includes no Retry-After.
 *
 * Why: gh forwards response headers when verbose, and prints "Retry-After:
 * <seconds>" in error output for primary rate-limit 429s. When present, the
 * caller is better served by propagating the error so the UI can surface the
 * real wait time — retrying on our own 250ms cadence just earns another 429
 * and burns the retry budget. Also supports HTTP-date Retry-After values.
 */
export function parseRetryAfterMs(stderr: string): number | null {
  const raw = findRetryAfterHeaderValue(stderr)
  if (raw === null) {
    return null
  }
  if (/^\d+$/.test(raw)) {
    const seconds = Number(raw)
    return Number.isFinite(seconds) ? seconds * 1000 : null
  }
  const ts = Date.parse(raw)
  if (Number.isNaN(ts)) {
    return null
  }
  return Math.max(0, ts - Date.now())
}

function findRetryAfterHeaderValue(stderr: string): string | null {
  const headerIndex = indexOfAsciiIgnoreCase(stderr, 'retry-after:', 0)
  if (headerIndex === -1) {
    return null
  }
  let valueStart = headerIndex + 'retry-after:'.length
  while (valueStart < stderr.length) {
    const code = stderr.charCodeAt(valueStart)
    if (code !== 9 && code !== 32) {
      break
    }
    valueStart++
  }
  let valueEnd = valueStart
  while (valueEnd < stderr.length) {
    const code = stderr.charCodeAt(valueEnd)
    if (code === 10 || code === 13) {
      break
    }
    valueEnd++
  }
  const value = stderr.slice(valueStart, valueEnd).trim()
  return value.length > 0 ? value : null
}

function indexOfAsciiIgnoreCase(value: string, search: string, fromIndex: number): number {
  const lastStart = value.length - search.length
  for (let index = Math.max(0, fromIndex); index <= lastStart; index++) {
    let matches = true
    for (let offset = 0; offset < search.length; offset++) {
      const code = value.charCodeAt(index + offset)
      const normalizedCode = code >= 65 && code <= 90 ? code + 32 : code
      if (normalizedCode !== search.charCodeAt(offset)) {
        matches = false
        break
      }
    }
    if (matches) {
      return index
    }
  }
  return -1
}

/**
 * Classify whether a gh execFile rejection is worth retrying.
 *
 * Why: gh surfaces HTTP status in stderr as "HTTP 504", "HTTP 502", etc.
 * Network resets and DNS hiccups also show up as stderr substrings. We retry
 * those and 429 (rate-limited) — but only 429s without an explicit
 * Retry-After (the caller is better off propagating so the UI can show the
 * actual wait time). The primary-rate-limit 403 branch is NOT retried: those
 * require the user to back off for minutes, which is not transient.
 */
export function isTransientGhError(stderr: string): boolean {
  const s = stderr.toLowerCase()
  if (
    s.includes('http 500') ||
    s.includes('http 502') ||
    s.includes('http 503') ||
    s.includes('http 504') ||
    s.includes('econnreset') ||
    s.includes('etimedout') ||
    s.includes('socket hang up')
  ) {
    return true
  }
  // 429 without Retry-After: retry. With Retry-After: propagate.
  if (s.includes('http 429')) {
    return parseRetryAfterMs(stderr) === null
  }
  return false
}

// Why: total of 3 attempts (original + 2 retries) with 250ms → 1s backoff.
// These are standard "transient 5xx" values. Longer waits push past user
// patience for an interactive action; shorter waits would hammer the same
// unhealthy upstream that just failed. The array length defines retry count;
// total attempts = length + 1.
export const GH_RETRY_DELAYS_MS = [250, 1000] as const

// Why: the upstream Retry-After header is server-suggested but unbounded —
// GitHub has been observed to send tens-of-seconds values on rare incidents,
// and a malicious or misconfigured proxy could send anything. Cap the wait
// at 30s so a single transient gh call can never block the IPC main thread
// for longer than the user's patience budget for an interactive action.
export const GH_RETRY_AFTER_MAX_MS = 30_000
const DEFAULT_GH_EXEC_TIMEOUT_MS = 30_000

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function defaultGhExecTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.YIRU_GH_EXEC_TIMEOUT_MS
  if (!raw) {
    return DEFAULT_GH_EXEC_TIMEOUT_MS
  }
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GH_EXEC_TIMEOUT_MS
}

function nonInteractiveGhEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...env,
    GH_PROMPT_DISABLED: env.GH_PROMPT_DISABLED ?? '1'
  }
}

/**
 * Async gh CLI execution. Drop-in replacement for
 * `execFileAsync('gh', args, { cwd, encoding, ... })`.
 *
 * Retries transient 5xx / 429 (without Retry-After) / network-reset failures
 * with exponential backoff. Non-transient errors (auth, 404, rate-limit 403,
 * validation, 429-with-Retry-After) fail fast on the first attempt.
 */
export async function ghExecFileAsync(
  args: string[],
  options: GhExecOptions = {}
): Promise<{ stdout: string; stderr: string }> {
  // Why: while a bucket's primary rate limit is exhausted, every spawn would
  // return the same 403 — fail fast without paying the subprocess cost. The
  // rate_limit probe itself is exempt so the breaker can learn the reset time.
  const rateLimitBucket = classifyGhRateLimitBucket(args)
  if (!isGhRateLimitProbe(args)) {
    const blockedUntilMs = getGhRateLimitBlockedUntilMs(rateLimitBucket)
    if (blockedUntilMs !== null) {
      throw createGhRateLimitBlockedError(rateLimitBucket, blockedUntilMs)
    }
  }
  let resolved = resolveCommand('gh', args, options.cwd, options.wslDistro)
  let lastError: unknown
  let attemptedHostFallback = false
  let attemptedDefaultWslFallback = false
  for (let attempt = 0; attempt <= GH_RETRY_DELAYS_MS.length; attempt++) {
    options.signal?.throwIfAborted()
    try {
      const { stdout, stderr } = await execFileCapture(resolved.binary, resolved.args, {
        cwd: resolved.cwd,
        encoding: (options.encoding ?? 'utf-8') as BufferEncoding,
        maxBuffer: options.maxBuffer,
        // Why: GitHub detail IPC powers PR cards and URL worktree
        // creation; one stuck gh child must fail visibly, not wedge every lane.
        timeout: options.timeout ?? defaultGhExecTimeoutMs(options.env),
        env: nonInteractiveGhEnv(options.env),
        signal: options.signal
      })
      return { stdout: stdout as string, stderr: stderr as string }
    } catch (err) {
      lastError = err
      const { stderr } = extractExecError(err)
      if (isGhPrimaryRateLimitStderr(stderr)) {
        notifyGhPrimaryRateLimit(rateLimitBucket)
      }
      if (
        process.platform === 'win32' &&
        !attemptedDefaultWslFallback &&
        resolved.wsl === null &&
        !options.cwd &&
        !options.wslDistro &&
        isHostCommandMissing(err, 'gh')
      ) {
        const wslResolved = resolveDefaultWslCli('gh', args)
        if (wslResolved) {
          // Why: WSL-only Windows installs have no gh.exe on the host PATH, but
          // global calls like rate_limit/auth do not carry a repo cwd to route by.
          resolved = wslResolved
          attemptedDefaultWslFallback = true
          attempt = -1
          continue
        }
      }
      if (!attemptedHostFallback && canFallBackToHostGitHubCli('gh', args, resolved, stderr)) {
        resolved = resolveHostGitHubCli('gh', args)
        attemptedHostFallback = true
        attempt = -1
        continue
      }
      const isLastAttempt = attempt >= GH_RETRY_DELAYS_MS.length
      // Why: only retry idempotent calls. A 5xx/socket reset can arrive
      // after the server already applied a POST/PATCH/PUT/DELETE; retrying
      // would duplicate the write (e.g. double-post a comment, double-add
      // a label). When the caller doesn't say, we auto-detect from argv —
      // explicit `-X <method>` and GraphQL `query=mutation …` are treated
      // as non-idempotent. See bug-scan finding 1.
      const idempotent = options.idempotent ?? argsLookIdempotent(args)
      if (idempotent && !isLastAttempt && isTransientGhError(stderr)) {
        // Why: when the upstream surfaced a Retry-After (e.g. on a transient
        // 5xx that GitHub explicitly recommends backing off for), honor it
        // instead of using our default backoff — sleeping less than the
        // server suggests just earns another failure and burns our retry
        // budget. Cap at GH_RETRY_AFTER_MAX_MS so a pathologically large
        // hint can't block IPC for minutes; if the real wait is longer, the
        // attempt will fail again and the error will propagate to the UI
        // where the user can see it.
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
  // Unreachable: the loop either returns or throws. Here for TS exhaustiveness.
  throw lastError
}

// ─── glab CLI runner ────────────────────────────────────────────────
// Why: parallel to gh CLI runner above. GitLab support is added by
// cloning gh's surface rather than abstracting both behind a generic
// runner — keeping them as parallel implementations matches the
// project's clone-and-adapt approach for new providers and avoids
// touching the working gh path. Reuses the shared retry/transient
// helpers since HTTP-status- and TCP-error-based classification is
// provider-agnostic.
