import { execFile } from 'node:child_process'

import type { ProviderRateLimits } from '@yiru/runtime-protocol/workbench/rate-limit-types'

import { spawnHiddenCommandPty } from '../hidden-command-pty'
import { cleanupHiddenRateLimitPty, registerHiddenRateLimitPty } from '../hidden-pty-cleanup'
import { resolveHiddenRateLimitPtyCwd } from '../hidden-rate-limit-pty-cwd'
import { describeCursorUsageFailure, parseCursorUsage, stripCursorTerminalOutput } from './parser'
import { buildCursorRuntimeCommand, type CursorRuntimeCommand } from './runtime-command'
import type { CursorHostRuntimeTarget } from './target'

const AUTH_TIMEOUT_MS = 10_000
const PTY_TIMEOUT_MS = 25_000
const STARTUP_FALLBACK_MS = 4_000
const PANEL_SETTLE_MS = 750
const MAX_OUTPUT_LENGTH = 100_000
const MCP_APPROVAL_RE = /MCP Server Approval Required|Continue without approval/i
const READY_PROMPT_RE = /Plan, search, build anything|Ask anything/i
const USAGE_COMMAND_RE = /\/usage\s+Show plan and on-demand usage/i
const PANEL_READY_RE = /Esc to close|View in dashboard:/i
const LOAD_FAILED_RE = /Failed to load usage data/i

type CursorAuthResult =
  | { kind: 'authenticated' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'aborted' }

function abortedCursorUsageResult(): ProviderRateLimits {
  return {
    provider: 'cursor',
    session: null,
    weekly: null,
    updatedAt: Date.now(),
    error: 'Rate-limit fetch aborted',
    status: 'error',
    usageMetadata: { failureKind: 'unknown', source: 'cli' }
  }
}

function unavailableCursorUsageResult(message: string): ProviderRateLimits {
  return {
    provider: 'cursor',
    session: null,
    weekly: null,
    updatedAt: Date.now(),
    error: message,
    status: 'unavailable',
    usageMetadata: { failureKind: 'usage-unavailable', source: 'cli' }
  }
}

function readCursorAuth(
  runtimeCommand: CursorRuntimeCommand,
  signal?: AbortSignal
): Promise<CursorAuthResult> {
  if (signal?.aborted) {
    return Promise.resolve({ kind: 'aborted' })
  }

  return new Promise((resolve) => {
    execFile(
      runtimeCommand.file,
      runtimeCommand.args,
      { encoding: 'utf-8', signal, timeout: AUTH_TIMEOUT_MS, windowsHide: true },
      (error, stdout) => {
        if (signal?.aborted) {
          resolve({ kind: 'aborted' })
          return
        }
        if (error) {
          resolve({
            kind: 'unavailable',
            message:
              'Cursor Agent CLI is unavailable. Install or update cursor-agent to show usage.'
          })
          return
        }
        try {
          const payload: unknown = JSON.parse(stdout)
          resolve(
            isAuthenticatedCursorStatus(payload)
              ? { kind: 'authenticated' }
              : {
                  kind: 'unavailable',
                  message: 'Sign in with cursor-agent to show Cursor usage.'
                }
          )
        } catch {
          resolve({
            kind: 'unavailable',
            message: 'Cursor Agent authentication status is unavailable.'
          })
        }
      }
    )
  })
}

function isAuthenticatedCursorStatus(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'isAuthenticated' in value &&
    value.isAuthenticated === true
  )
}

function createCursorPtyEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value
    }
  }
  env.TERM = 'xterm-256color'
  return env
}

async function fetchCursorUsageViaPty(
  runtimeCommand: CursorRuntimeCommand,
  signal?: AbortSignal
): Promise<ProviderRateLimits> {
  if (signal?.aborted) {
    return abortedCursorUsageResult()
  }
  const term = await spawnHiddenCommandPty({
    args: runtimeCommand.args,
    cols: 120,
    // Why: --trust is limited to a bounded empty directory owned by Yiru;
    // the hidden read-only usage command never inherits an active workspace.
    cwd: resolveHiddenRateLimitPtyCwd(),
    env: createCursorPtyEnv(),
    file: runtimeCommand.file,
    name: 'xterm-256color',
    rows: 40
  })
  if (signal?.aborted) {
    term.kill()
    term.destroy?.()
    return abortedCursorUsageResult()
  }

  return new Promise((resolve) => {
    let output = ''
    let resolved = false
    let hasTypedUsageCommand = false
    let hasSubmittedUsageCommand = false
    let skippedMcpApproval = false
    let startupTimer: ReturnType<typeof setTimeout> | null = null
    let settleTimer: ReturnType<typeof setTimeout> | null = null
    let timeout: ReturnType<typeof setTimeout> | null = null
    const termDisposables: { dispose: () => void }[] = [registerHiddenRateLimitPty(term)]

    function clearTimers(): void {
      if (startupTimer) {
        clearTimeout(startupTimer)
        startupTimer = null
      }
      if (settleTimer) {
        clearTimeout(settleTimer)
        settleTimer = null
      }
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
    }

    function finish(result?: ProviderRateLimits): void {
      if (resolved) {
        return
      }
      resolved = true
      clearTimers()
      cleanupHiddenRateLimitPty(term, termDisposables, { kill: true })
      if (result) {
        resolve(result)
        return
      }
      const clean = stripCursorTerminalOutput(output)
      resolve(
        parseCursorUsage(clean) ?? {
          provider: 'cursor',
          session: null,
          weekly: null,
          updatedAt: Date.now(),
          error: describeCursorUsageFailure(clean),
          status: 'error',
          usageMetadata: { failureKind: 'parse', source: 'cli' }
        }
      )
    }

    function typeUsageCommand(): void {
      if (resolved || hasTypedUsageCommand) {
        return
      }
      hasTypedUsageCommand = true
      // Why: do not press Enter until the exact built-in command appears. On
      // older CLIs, submitting an unknown /usage string could start a model turn.
      term.write('/usage')
    }

    function submitUsageCommand(): void {
      if (!resolved && hasTypedUsageCommand && !hasSubmittedUsageCommand) {
        hasSubmittedUsageCommand = true
        term.write('\r')
      }
    }

    function scheduleUsage(delay: number): void {
      if (hasTypedUsageCommand || resolved) {
        return
      }
      if (startupTimer) {
        clearTimeout(startupTimer)
      }
      startupTimer = setTimeout(typeUsageCommand, delay)
    }

    const settleAborted = (): void => finish(abortedCursorUsageResult())
    if (signal) {
      signal.addEventListener('abort', settleAborted, { once: true })
      termDisposables.push({
        dispose: () => signal.removeEventListener('abort', settleAborted)
      })
    }

    timeout = setTimeout(finish, PTY_TIMEOUT_MS)
    scheduleUsage(STARTUP_FALLBACK_MS)

    const onDataDisposable = term.onData((data) => {
      output += data
      if (output.length > MAX_OUTPUT_LENGTH) {
        output = output.slice(-MAX_OUTPUT_LENGTH)
      }
      const clean = stripCursorTerminalOutput(output)
      if (!skippedMcpApproval && MCP_APPROVAL_RE.test(clean)) {
        skippedMcpApproval = true
        term.write('c')
        scheduleUsage(STARTUP_FALLBACK_MS)
        return
      }
      if (!hasTypedUsageCommand && READY_PROMPT_RE.test(clean)) {
        scheduleUsage(250)
      }
      if (hasTypedUsageCommand && !hasSubmittedUsageCommand && USAGE_COMMAND_RE.test(clean)) {
        submitUsageCommand()
      }
      if (hasSubmittedUsageCommand && (PANEL_READY_RE.test(clean) || LOAD_FAILED_RE.test(clean))) {
        if (!settleTimer) {
          settleTimer = setTimeout(finish, PANEL_SETTLE_MS)
        }
      }
    })
    termDisposables.push(onDataDisposable)

    const onExitDisposable = term.onExit(() => {
      cleanupHiddenRateLimitPty(term, termDisposables, { kill: false })
      finish()
    })
    termDisposables.push(onExitDisposable)
  })
}

export async function fetchCursorRateLimits(options?: {
  signal?: AbortSignal
  target?: CursorHostRuntimeTarget
}): Promise<ProviderRateLimits> {
  const target = options?.target ?? { runtime: 'host' }
  if (target.runtime === 'wsl' && process.platform !== 'win32') {
    return unavailableCursorUsageResult(
      'Cursor Agent WSL usage is only available from a Windows host.'
    )
  }
  const authCommand = buildCursorRuntimeCommand(target, ['status', '--format', 'json'], false)
  const auth = await readCursorAuth(authCommand, options?.signal)
  if (auth.kind === 'aborted') {
    return abortedCursorUsageResult()
  }
  if (auth.kind === 'unavailable') {
    return unavailableCursorUsageResult(auth.message)
  }
  const usageCommand = buildCursorRuntimeCommand(target, ['--trust'], true)
  return fetchCursorUsageViaPty(usageCommand, options?.signal)
}
