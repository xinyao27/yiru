import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { parseWslUncPath } from '@yiru/workbench-model/platform'
/* eslint-disable max-lines -- Why: keeping the Codex backend and app-server RPC
paths together in one file makes it easier to audit the contract differences and
ensure account-scoped env handling stays identical. */
import type {
  CodexRateLimitResetOutcome,
  ProviderRateLimits,
  RateLimitWindow
} from '~shared/rate-limit-types'
import {
  buildWslLoginShellCommand,
  escapeWslShCommandForWindows
} from '~shared/wsl-login-shell-command'

import { withMacTailscaleDnsHint } from '../network/macos-tailscale-dns-diagnostic'
import { resolveCodexCommand } from '../runtime/cli-command'
import {
  getHiddenRateLimitWslCwdSetupCommands,
  resolveHiddenRateLimitPtyCwd
} from '../runtime/hidden-rate-limit-pty-cwd'
import { getSpawnArgsForWindows } from '../win32-utils'
import {
  createAuthFilesystemOperation,
  type SharedAuthFilesystemOperation
} from './auth-filesystem-operation'
import { probeCodexAuthPresence } from './codex-auth-presence'
import {
  classifyCodexRateLimitWindows,
  CODEX_SESSION_WINDOW_MINUTES,
  CODEX_WEEKLY_WINDOW_MINUTES,
  type CodexRpcRateLimits,
  type CodexRpcRateLimitsByLimitId,
  type CodexRpcRateWindow
} from './codex-rate-limit-window-classification'

const RPC_TIMEOUT_MS = 10_000
const WSL_RPC_TIMEOUT_MS = 25_000
const BACKEND_TIMEOUT_MS = 10_000
// Why: redeeming a reset credit is an explicit user action, not a background
// poll — give it more room before failing so a slow backend can still finish.
const REDEEM_BACKEND_TIMEOUT_MS = 30_000
const MAX_DIAGNOSTIC_OUTPUT_LENGTH = 100_000

export type FetchCodexRateLimitsOptions = {
  codexHomePath?: string | null
  signal?: AbortSignal
}

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------

type RpcResponse = {
  id: number
  result?: unknown
  error?: { code: number; message: string }
}

type RateLimitResetCredits = {
  availableCount: number
  totalEarnedCount?: number
  nextExpiresAt?: number | null
  credits?: {
    status: string
    expiresAt: number | null
    grantedAt: number | null
  }[]
}

// Why: the Codex app-server wraps rate limit data inside a `rateLimits` key.
// The actual response shape is `{ rateLimits: { primary, secondary, ... } }`.
type RpcRateLimitsResponse = {
  rateLimits?: CodexRpcRateLimits | null
  rateLimitsByLimitId?: CodexRpcRateLimitsByLimitId | null
  rateLimitResetCredits?: {
    availableCount?: number
    totalEarnedCount?: number
    nextExpiresAt?: number | null
    credits?: {
      status?: string
      expiresAt?: number | string | null
      grantedAt?: number | string | null
    }[]
  } | null
}

type CodexAuthFile = {
  tokens?: {
    access_token?: string
    account_id?: string
  }
}

type BackendRateLimitResetCreditsResponse = {
  available_count?: number
  total_earned_count?: number
  credits?: {
    status?: string
    expires_at?: string | null
    granted_at?: string | null
  }[]
}

type BackendRateLimitWindow = {
  used_percent?: number
  limit_window_seconds?: number
  reset_at?: number
}

type BackendUsageResponse = {
  plan_type?: string
  rate_limit?: {
    primary_window?: BackendRateLimitWindow | null
    secondary_window?: BackendRateLimitWindow | null
  } | null
  rate_limit_reset_credits?: BackendRateLimitResetCreditsResponse | null
}

type BackendConsumeRateLimitResetCreditResponse = {
  code?: string
}

type CodexBackendAuthHeaders = {
  headers: Record<string, string>
}

type BackendAuthReadResult =
  | { content: string; error?: never }
  | { content?: never; error: unknown }

const backendAuthReadByPath = new Map<
  string,
  SharedAuthFilesystemOperation<BackendAuthReadResult>
>()

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function buildWslCodexCommand(
  codexHomePath: string,
  args: string[],
  options?: { isolateRpcStdio?: boolean }
): {
  command: string
  args: string[]
} | null {
  const wslInfo = parseWslUncPath(codexHomePath)
  if (process.platform !== 'win32' || !wslInfo) {
    return null
  }
  const setupCommands = [
    ...getHiddenRateLimitWslCwdSetupCommands(),
    `export CODEX_HOME=${shellQuote(wslInfo.linuxPath)}`
  ].join(' && ')
  const execSuffix = `${args.map(shellQuote).join(' ')}${
    options?.isolateRpcStdio ? ' <&3 >&4 3<&- 4>&-' : ''
  }`
  // Why: npm/nvm Codex launchers use `#!/usr/bin/env node`. Resolving an
  // absolute launcher in a login shell and later execing it from plain `sh`
  // loses the PATH that supplies Node and also pins obsolete installations.
  const loginShellCommand = buildWslLoginShellCommand(
    [setupCommands, `exec codex ${execSuffix}`].join(' && ')
  )
  // Why: keep the outer sh non-login and hide RPC pipes before the configured
  // shell startup can read input or print banners.
  const command = options?.isolateRpcStdio
    ? ['exec 3<&0', 'exec 4>&1', 'exec </dev/null', 'exec >/dev/null', loginShellCommand].join('\n')
    : loginShellCommand
  return {
    command: 'wsl.exe',
    args: ['-d', wslInfo.distro, '--', 'sh', '-c', escapeWslShCommandForWindows(command)]
  }
}

function cloneProcessEnvWithoutCodexHome(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env.CODEX_HOME
  return env
}

function buildRpcMessage(id: number, method: string, params?: unknown): string {
  return `${JSON.stringify({ jsonrpc: '2.0', id, method, params: params ?? {} })}\n`
}

function getCodexHomePath(codexHomePath?: string | null): string {
  return codexHomePath ?? process.env.CODEX_HOME ?? join(homedir(), '.codex')
}

function parseCreditTimestamp(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Why: reset-credit payloads may use Unix seconds or Unix milliseconds.
    return value < 10_000_000_000 ? value * 1000 : value
  }
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }
  const trimmed = value.trim()
  const numeric = Number(trimmed)
  if (Number.isFinite(numeric)) {
    return numeric < 10_000_000_000 ? numeric * 1000 : numeric
  }
  const timestamp = Date.parse(trimmed)
  return Number.isFinite(timestamp) ? timestamp : null
}

function normalizeCreditStatus(status: string | undefined): string {
  return status?.toLowerCase() ?? 'unknown'
}

function abortedCodexRateLimitResult(): ProviderRateLimits {
  return {
    provider: 'codex',
    session: null,
    weekly: null,
    updatedAt: Date.now(),
    error: 'Rate-limit fetch aborted',
    status: 'error'
  }
}

function getNextAvailableCreditExpiry(
  credits: RateLimitResetCredits['credits'] | undefined
): number | null {
  const expiries =
    credits
      ?.filter((credit) => credit.status === 'available')
      .map((credit) => credit.expiresAt)
      .filter((expiresAt): expiresAt is number => typeof expiresAt === 'number')
      .sort((a, b) => a - b) ?? []
  return expiries[0] ?? null
}

function mapRpcRateLimitResetCredits(
  raw: RpcRateLimitsResponse['rateLimitResetCredits']
): RateLimitResetCredits | null | undefined {
  if (!raw) {
    return raw
  }
  if (typeof raw.availableCount !== 'number' || !Number.isFinite(raw.availableCount)) {
    return null
  }
  const credits = raw.credits?.map((credit) => ({
    status: normalizeCreditStatus(credit.status),
    expiresAt: parseCreditTimestamp(credit.expiresAt),
    grantedAt: parseCreditTimestamp(credit.grantedAt)
  }))
  return {
    availableCount: Math.max(0, Math.floor(raw.availableCount)),
    ...(typeof raw.totalEarnedCount === 'number' && Number.isFinite(raw.totalEarnedCount)
      ? { totalEarnedCount: Math.max(0, Math.floor(raw.totalEarnedCount)) }
      : {}),
    nextExpiresAt: parseCreditTimestamp(raw.nextExpiresAt) ?? getNextAvailableCreditExpiry(credits),
    ...(credits ? { credits } : {})
  }
}

function mapBackendRateLimitResetCredits(
  raw: BackendRateLimitResetCreditsResponse | null | undefined
): RateLimitResetCredits | null | undefined {
  if (!raw) {
    return raw
  }
  const credits = raw.credits?.map((credit) => ({
    status: normalizeCreditStatus(credit.status),
    expiresAt: parseCreditTimestamp(credit.expires_at),
    grantedAt: parseCreditTimestamp(credit.granted_at)
  }))
  const availableCount =
    typeof raw.available_count === 'number' && Number.isFinite(raw.available_count)
      ? raw.available_count
      : (credits?.filter((credit) => credit.status === 'available').length ?? null)
  if (availableCount === null) {
    return null
  }
  return {
    availableCount: Math.max(0, Math.floor(availableCount)),
    ...(typeof raw.total_earned_count === 'number' && Number.isFinite(raw.total_earned_count)
      ? { totalEarnedCount: Math.max(0, Math.floor(raw.total_earned_count)) }
      : {}),
    nextExpiresAt: getNextAvailableCreditExpiry(credits),
    ...(credits ? { credits } : {})
  }
}

function createBackendRequestSignal(
  callerSignal?: AbortSignal,
  timeoutMs = BACKEND_TIMEOUT_MS
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  return callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal
}

function getBackendAuthRead(
  authPath: string
): SharedAuthFilesystemOperation<BackendAuthReadResult> {
  const existing = backendAuthReadByPath.get(authPath)
  if (existing) {
    return existing
  }
  // Why: the caller deadline must settle promptly, but Node cannot guarantee
  // cancellation of an already-issued UNC read. Keep one raw read per auth
  // path until the OS finishes so repeated quota refreshes cannot stack them.
  const read = createAuthFilesystemOperation(authPath, () =>
    readFile(authPath, 'utf8').then(
      (content) => ({ content }),
      (error: unknown) => ({ error })
    )
  )
  backendAuthReadByPath.set(authPath, read)
  const clearRead = (): void => {
    if (backendAuthReadByPath.get(authPath) === read) {
      backendAuthReadByPath.delete(authPath)
    }
  }
  void read.result.then(clearRead, clearRead)
  return read
}

async function readBackendAuth(authPath: string, signal: AbortSignal): Promise<string> {
  const result = await getBackendAuthRead(authPath).wait(signal)
  if ('error' in result) {
    throw result.error
  }
  return result.content
}

async function getCodexBackendAuthHeaders(
  options: FetchCodexRateLimitsOptions | undefined,
  signal: AbortSignal
): Promise<CodexBackendAuthHeaders | null> {
  if (signal.aborted) {
    return null
  }
  const authPath = join(getCodexHomePath(options?.codexHomePath), 'auth.json')
  const auth = JSON.parse(await readBackendAuth(authPath, signal)) as CodexAuthFile
  const accessToken = auth.tokens?.access_token
  if (!accessToken) {
    return null
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': 'codex-cli',
    'OpenAI-Beta': 'codex-1',
    originator: 'Codex Desktop'
  }
  if (auth.tokens?.account_id) {
    headers['ChatGPT-Account-Id'] = auth.tokens.account_id
  }
  return { headers }
}

async function fetchBackendRateLimitResetCredits(
  options?: FetchCodexRateLimitsOptions
): Promise<RateLimitResetCredits | null> {
  if (options?.signal?.aborted) {
    return null
  }
  const signal = createBackendRequestSignal(options?.signal)
  const auth = await getCodexBackendAuthHeaders(options, signal)
  if (!auth) {
    return null
  }
  if (signal.aborted) {
    return null
  }
  // Why: published Codex 0.140 can read windows through app-server but strips
  // reset-credit metadata that the backend already returns.
  const response = await fetch('https://chatgpt.com/backend-api/wham/rate-limit-reset-credits', {
    ...auth,
    signal
  })
  if (!response.ok) {
    return null
  }
  const payload = (await response.json()) as BackendRateLimitResetCreditsResponse
  return mapBackendRateLimitResetCredits(payload) ?? null
}

async function withBackendRateLimitResetCredits(
  limits: ProviderRateLimits,
  options?: FetchCodexRateLimitsOptions
): Promise<ProviderRateLimits> {
  if (
    options?.signal?.aborted ||
    limits.provider !== 'codex' ||
    (limits.rateLimitResetCredits?.nextExpiresAt !== undefined &&
      limits.rateLimitResetCredits.nextExpiresAt !== null)
  ) {
    return limits
  }
  try {
    const rateLimitResetCredits = await fetchBackendRateLimitResetCredits(options)
    return rateLimitResetCredits === null ? limits : { ...limits, rateLimitResetCredits }
  } catch {
    return limits
  }
}

function mapBackendConsumeOutcome(code: string | undefined): CodexRateLimitResetOutcome {
  if (code === 'reset') {
    return 'reset'
  }
  if (code === 'nothing_to_reset') {
    return 'nothingToReset'
  }
  if (code === 'no_credit') {
    return 'noCredit'
  }
  if (code === 'already_redeemed') {
    return 'alreadyRedeemed'
  }
  throw new Error(`Unknown Codex reset outcome: ${code ?? 'missing'}`)
}

export async function consumeCodexRateLimitResetCredit(options: {
  codexHomePath?: string | null
  idempotencyKey: string
}): Promise<CodexRateLimitResetOutcome> {
  if (!options.idempotencyKey.trim()) {
    throw new Error('Codex reset idempotency key is required')
  }
  const signal = createBackendRequestSignal(undefined, REDEEM_BACKEND_TIMEOUT_MS)
  const auth = await getCodexBackendAuthHeaders(options, signal)
  if (!auth) {
    throw new Error('Codex not signed in')
  }
  const response = await fetch(
    'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume',
    {
      method: 'POST',
      headers: {
        ...auth.headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ redeem_request_id: options.idempotencyKey }),
      signal
    }
  )
  if (!response.ok) {
    throw new Error(`Codex reset failed: HTTP ${response.status}`)
  }
  const payload = (await response.json()) as BackendConsumeRateLimitResetCreditResponse
  return mapBackendConsumeOutcome(payload.code)
}

function mapRpcWindow(
  raw: CodexRpcRateWindow | null | undefined,
  expectedWindowMinutes: number
): RateLimitWindow | null {
  if (!raw || typeof raw.usedPercent !== 'number' || !Number.isFinite(raw.usedPercent)) {
    return null
  }
  let resetDescription: string | null = null
  let resetsAt: number | null = null

  if (typeof raw.resetsAt === 'number' && Number.isFinite(raw.resetsAt) && raw.resetsAt > 0) {
    // Why: Codex returns resetsAt as Unix seconds, not milliseconds.
    const date = new Date(raw.resetsAt * 1000)
    if (!Number.isNaN(date.getTime())) {
      resetsAt = date.getTime()
      const now = new Date()
      const isToday = date.toDateString() === now.toDateString()
      resetDescription = isToday
        ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
        : date.toLocaleDateString(undefined, {
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit'
          })
    }
  }

  return {
    usedPercent: Math.min(100, Math.max(0, raw.usedPercent)),
    // Why: older app-server builds can report canonical bucket lengths off by one minute.
    windowMinutes: expectedWindowMinutes,
    resetsAt,
    resetDescription
  }
}

function toBackendRpcRateWindow(
  raw: BackendRateLimitWindow | null | undefined,
  fallbackWindowMinutes: number
): CodexRpcRateWindow | null {
  if (!raw) {
    return null
  }
  const limitWindowSeconds = raw.limit_window_seconds
  // Match Codex backend-client's `window_minutes_from_seconds`: the backend
  // field is the actual bucket duration and rounds partial minutes upward.
  const windowDurationMins =
    typeof limitWindowSeconds === 'number' &&
    Number.isFinite(limitWindowSeconds) &&
    limitWindowSeconds > 0
      ? Math.ceil(limitWindowSeconds / 60)
      : fallbackWindowMinutes
  return { usedPercent: raw.used_percent, windowDurationMins, resetsAt: raw.reset_at }
}

function mapBackendUsageWindow(
  window: CodexRpcRateWindow | null,
  fallbackWindowMinutes: number
): RateLimitWindow | null {
  // Why: unlike the RPC path, the backend reports the real bucket length and
  // `formatWindowLabel` renders non-canonical durations (7h, 30d) on their own.
  // Keep the reported duration and canonicalize only when it is missing.
  const duration = window?.windowDurationMins
  return mapRpcWindow(
    window,
    typeof duration === 'number' && Number.isFinite(duration) && duration > 0
      ? duration
      : fallbackWindowMinutes
  )
}

async function fetchViaBackend(
  options?: FetchCodexRateLimitsOptions
): Promise<ProviderRateLimits | null> {
  const signal = createBackendRequestSignal(options?.signal)
  const auth = await getCodexBackendAuthHeaders(options, signal)
  if (!auth || signal.aborted) {
    return null
  }
  // Why: Codex itself reads this endpoint in backend-client's
  // `get_rate_limit_status`; using the same contract avoids launching a hidden
  // app-server (and a WSL login shell) for every routine quota refresh.
  const response = await fetch('https://chatgpt.com/backend-api/wham/usage', {
    ...auth,
    signal
  })
  if (!response.ok) {
    return null
  }
  const payload = (await response.json()) as BackendUsageResponse
  // `plan_type` is required by Codex's RateLimitStatusPayload. Reject a
  // superficially successful but unrelated/malformed JSON response so the
  // established app-server fallback still gets a chance.
  if (typeof payload.plan_type !== 'string') {
    return null
  }
  // Why: never trust the primary/secondary position to mean 5h/weekly. The RPC
  // contract already moved a Pro account's weekly bucket into `primary`, and the
  // backend carries the same duration metadata needed to classify it properly.
  const classifiedWindows = classifyCodexRateLimitWindows({
    primary: toBackendRpcRateWindow(
      payload.rate_limit?.primary_window,
      CODEX_SESSION_WINDOW_MINUTES
    ),
    secondary: toBackendRpcRateWindow(
      payload.rate_limit?.secondary_window,
      CODEX_WEEKLY_WINDOW_MINUTES
    )
  })
  return {
    provider: 'codex',
    session: mapBackendUsageWindow(classifiedWindows.session, CODEX_SESSION_WINDOW_MINUTES),
    weekly: mapBackendUsageWindow(classifiedWindows.weekly, CODEX_WEEKLY_WINDOW_MINUTES),
    // Why: the consolidated roster uses the backend tier to distinguish active Codex accounts.
    planType: payload.plan_type,
    ...(payload.rate_limit_reset_credits !== undefined
      ? {
          rateLimitResetCredits:
            mapBackendRateLimitResetCredits(payload.rate_limit_reset_credits) ?? null
        }
      : {}),
    updatedAt: Date.now(),
    error: null,
    status: 'ok'
  }
}

// ---------------------------------------------------------------------------
// RPC fetch — spawn `codex -s read-only app-server`
// ---------------------------------------------------------------------------

async function fetchViaRpc(options?: FetchCodexRateLimitsOptions): Promise<ProviderRateLimits> {
  if (options?.signal?.aborted) {
    return abortedCodexRateLimitResult()
  }
  return new Promise<ProviderRateLimits>((resolve) => {
    let buffer = ''
    let stderr = ''
    let resolved = false
    let rpcId = 0

    // Why: no approval policy is passed. This fetch only reads rate limits and
    // never starts a turn, so the policy is inert — and Codex 0.149 dropped the
    // `untrusted` value, which made the whole app-server spawn exit with code 2.
    const codexArgs = ['-s', 'read-only', 'app-server']
    const wslCodex = options?.codexHomePath
      ? buildWslCodexCommand(options.codexHomePath, codexArgs, { isolateRpcStdio: true })
      : null
    // Why: cold WSL process startup plus Codex app-server initialization can
    // exceed the host RPC budget, causing a false "unavailable" on app launch.
    const rpcTimeoutMs = wslCodex ? WSL_RPC_TIMEOUT_MS : RPC_TIMEOUT_MS
    const codexCommand = wslCodex ? 'codex' : resolveCodexCommand()
    // Why: on Windows, resolveCodexCommand() may return a .cmd/.bat file.
    // spawn() cannot execute batch scripts directly without shell:true, but
    // shell:true with an args array triggers DEP0190 (args are concatenated,
    // not escaped). Fix: detect batch scripts and route through cmd.exe /c.
    const { spawnCmd, spawnArgs } = wslCodex
      ? { spawnCmd: wslCodex.command, spawnArgs: wslCodex.args }
      : getSpawnArgsForWindows(codexCommand, codexArgs)
    const child = spawn(spawnCmd, spawnArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: resolveHiddenRateLimitPtyCwd(),
      // Why: the selected Codex rate-limit account must only affect this fetch
      // subprocess. Never mutate process.env globally or other Codex features
      // would inherit the managed account unintentionally.
      // Why windowsHide: this fetch runs periodically in the background;
      // without the flag, cmd.exe /c would flash a console window for each
      // poll on Windows.
      windowsHide: true,
      env: {
        ...(wslCodex ? cloneProcessEnvWithoutCodexHome() : process.env),
        ...(options?.codexHomePath && !wslCodex ? { CODEX_HOME: options.codexHomePath } : {})
      }
    })

    let timeout: ReturnType<typeof setTimeout> | null = null

    function cleanupListeners(): void {
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
      options?.signal?.removeEventListener('abort', onAbort)
      child.stdout.off('data', onStdoutData)
      child.stderr.off('data', onStderrData)
      child.off('error', onError)
      child.off('close', onClose)
    }

    function settle(result: ProviderRateLimits, options?: { kill?: boolean }): void {
      if (resolved) {
        return
      }
      resolved = true
      cleanupListeners()
      if (options?.kill) {
        child.kill()
      }
      resolve(result)
    }

    function onAbort(): void {
      settle(abortedCodexRateLimitResult(), { kill: true })
    }

    if (options?.signal) {
      if (options.signal.aborted) {
        onAbort()
        return
      }
      options.signal.addEventListener('abort', onAbort, { once: true })
    }

    timeout = setTimeout(() => {
      settle(
        {
          provider: 'codex',
          session: null,
          weekly: null,
          updatedAt: Date.now(),
          error: 'RPC timeout',
          status: 'error'
        },
        { kill: true }
      )
    }, rpcTimeoutMs)

    function sendRpc(method: string, params?: unknown): number {
      const id = ++rpcId
      child.stdin.write(buildRpcMessage(id, method, params))
      return id
    }

    // Why: the Codex RPC server follows the JSON-RPC/LSP initialization
    // handshake: client sends `initialize` request, waits for the response,
    // then sends an `initialized` notification. Only after that will the
    // server accept other methods. Skipping the notification causes "Not
    // initialized" errors on subsequent requests.
    let rateLimitsId: number | null = null

    const initId = sendRpc('initialize', {
      clientInfo: { name: 'yiru', version: '1.0.0' }
    })

    function sendNotification(method: string): void {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params: {} })}\n`)
    }

    function onStdoutData(chunk: Buffer): void {
      buffer += chunk.toString()

      // JSON-RPC messages are newline-delimited
      let newlineIdx: number
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim()
        buffer = buffer.slice(newlineIdx + 1)
        if (!line) {
          continue
        }

        try {
          const msg = JSON.parse(line) as RpcResponse

          // Skip server-initiated notifications (no id field)
          if (msg.id == null) {
            continue
          }

          if (msg.id === initId) {
            // Initialize succeeded — send `initialized` notification, then
            // request rate limits.
            sendNotification('initialized')
            rateLimitsId = sendRpc('account/rateLimits/read')
            continue
          }

          if (rateLimitsId !== null && msg.id === rateLimitsId) {
            if (resolved) {
              return
            }

            if (msg.error) {
              settle(
                {
                  provider: 'codex',
                  session: null,
                  weekly: null,
                  updatedAt: Date.now(),
                  error: withMacTailscaleDnsHint(msg.error.message, stderr),
                  status: 'error'
                },
                { kill: true }
              )
              return
            }

            const wrapper = msg.result as RpcRateLimitsResponse | undefined
            const result = wrapper?.rateLimits
            const classifiedWindows = classifyCodexRateLimitWindows(
              result,
              wrapper?.rateLimitsByLimitId
            )
            const session = mapRpcWindow(classifiedWindows.session, CODEX_SESSION_WINDOW_MINUTES)
            const weekly = mapRpcWindow(classifiedWindows.weekly, CODEX_WEEKLY_WINDOW_MINUTES)
            const rateLimitResetCredits = mapRpcRateLimitResetCredits(
              wrapper?.rateLimitResetCredits
            )

            settle(
              {
                provider: 'codex',
                session,
                weekly,
                ...(rateLimitResetCredits !== undefined ? { rateLimitResetCredits } : {}),
                updatedAt: Date.now(),
                error: null,
                status: 'ok'
              },
              { kill: true }
            )
          }
        } catch {
          // Non-JSON line from the RPC server — ignore
        }
      }
    }

    function onStderrData(chunk: Buffer): void {
      stderr += chunk.toString()
      // Why: this background poll only needs recent failure context for hints.
      if (stderr.length > MAX_DIAGNOSTIC_OUTPUT_LENGTH) {
        stderr = stderr.slice(-MAX_DIAGNOSTIC_OUTPUT_LENGTH)
      }
    }

    function onError(err: Error): void {
      const isEnoent = (err as NodeJS.ErrnoException).code === 'ENOENT'
      const isBareCommand = codexCommand === 'codex'
      settle({
        provider: 'codex',
        session: null,
        weekly: null,
        updatedAt: Date.now(),
        error: isEnoent
          ? isBareCommand
            ? 'Codex CLI not found'
            : 'Codex CLI found but could not run — Node.js may not be in your PATH'
          : withMacTailscaleDnsHint(err.message, stderr),
        status: isEnoent && isBareCommand ? 'unavailable' : 'error'
      })
    }

    function onClose(): void {
      settle({
        provider: 'codex',
        session: null,
        weekly: null,
        updatedAt: Date.now(),
        error: withMacTailscaleDnsHint('RPC process exited unexpectedly', stderr),
        status: 'error'
      })
    }

    child.stdout.on('data', onStdoutData)
    child.stderr.on('data', onStderrData)
    child.on('error', onError)
    child.on('close', onClose)
  })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchCodexRateLimits(
  options?: FetchCodexRateLimitsOptions
): Promise<ProviderRateLimits> {
  if (options?.signal?.aborted) {
    return abortedCodexRateLimitResult()
  }
  // Why: never spawn the `codex` binary unless the user has signed in. Without
  // auth the RPC/PTY paths can only error, and spawning them shows up as an
  // unexpected background Codex process for users who don't use Codex.
  const authPresence = await probeCodexAuthPresence(options?.codexHomePath, {
    signal: options?.signal
  })
  if (options?.signal?.aborted) {
    return abortedCodexRateLimitResult()
  }
  if (authPresence === 'absent') {
    return {
      provider: 'codex',
      session: null,
      weekly: null,
      updatedAt: Date.now(),
      error: 'Codex not signed in',
      status: 'unavailable'
    }
  }
  if (authPresence !== 'present') {
    return {
      provider: 'codex',
      session: null,
      weekly: null,
      updatedAt: Date.now(),
      error:
        authPresence === 'timeout'
          ? 'Timed out while checking Codex sign-in status'
          : 'Codex sign-in status is unavailable',
      status: 'error'
    }
  }

  // Path A (WSL): use Codex's own backend usage contract. Host accounts retain
  // app-server's token-refresh/custom-CA behavior; WSL avoids starting a login
  // shell just to reconstruct the CLI environment for a routine poll.
  if (options?.codexHomePath && parseWslUncPath(options.codexHomePath)) {
    try {
      const backendResult = await fetchViaBackend(options)
      if (options?.signal?.aborted) {
        return abortedCodexRateLimitResult()
      }
      if (backendResult) {
        const withResetCredits = await withBackendRateLimitResetCredits(backendResult, options)
        return options?.signal?.aborted ? abortedCodexRateLimitResult() : withResetCredits
      }
    } catch {
      if (options?.signal?.aborted) {
        return abortedCodexRateLimitResult()
      }
      // Token refresh, network routing, and custom-CA behavior can differ from
      // the host fetch stack. Preserve the CLI paths as compatibility fallbacks.
    }
  }

  // Path B: app-server RPC. This is the only remaining source for host
  // accounts, so its error is what the user sees.
  try {
    const rpcResult = await fetchViaRpc(options)
    if (options?.signal?.aborted) {
      return abortedCodexRateLimitResult()
    }
    if (rpcResult.status === 'ok' || rpcResult.status === 'unavailable') {
      const withResetCredits = await withBackendRateLimitResetCredits(rpcResult, options)
      return options?.signal?.aborted ? abortedCodexRateLimitResult() : withResetCredits
    }
    return rpcResult
  } catch (err) {
    if (options?.signal?.aborted) {
      return abortedCodexRateLimitResult()
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    const isNotInstalled = message.includes('ENOENT')
    return {
      provider: 'codex',
      session: null,
      weekly: null,
      updatedAt: Date.now(),
      error: isNotInstalled ? 'Codex CLI not found' : withMacTailscaleDnsHint(message),
      status: isNotInstalled ? 'unavailable' : 'error'
    }
  }
}
