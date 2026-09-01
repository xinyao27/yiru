import type { NetworkProxySettings } from '@yiru/runtime-protocol/workbench/network-proxy'
import type { ProviderRateLimits } from '@yiru/runtime-protocol/workbench/rate-limit-types'

import type { ClaudeRuntimeAuthPreparation } from '../agents/claude/accounts/runtime-auth-service'
import { withMacTailscaleDnsHint } from '../network/macos-tailscale-dns-diagnostic'
import { spawnHiddenCommandPty } from '../runtime/hidden-command-pty'
import {
  cleanupHiddenRateLimitPty,
  registerHiddenRateLimitPty
} from '../runtime/hidden-pty-cleanup'
import { resolveClaudePtyLaunch } from './claude-pty-launch'
import {
  abortedClaudeUsageResult,
  describeClaudeUsageFailure,
  hasClaudeUsageStop,
  isClaude21Usage,
  isClaudeCommandPalette,
  isClaudeTrustPrompt,
  parseClaudePtyUsage,
  stripClaudeTerminalControlSequences
} from './claude-pty-parser'

const PTY_TIMEOUT_MS = 25_000
const MAX_OUTPUT_LENGTH = 100_000
const STARTUP_DELAY_MS = 2_000
const SETTLE_AFTER_STOP_MS = 2_000
const SETTLE_AFTER_CLAUDE_21_USAGE_MS = 8_000

function buildUsageResult(cleanOutput: string, failureMessage: string): ProviderRateLimits {
  const { session, weekly, fableWeekly } = parseClaudePtyUsage(cleanOutput)
  const hasUsage = Boolean(session || weekly || fableWeekly)
  return {
    provider: 'claude',
    session,
    weekly,
    fableWeekly,
    updatedAt: Date.now(),
    error: hasUsage ? null : withMacTailscaleDnsHint(failureMessage, cleanOutput),
    status: hasUsage ? 'ok' : 'error'
  }
}

export async function fetchViaPty(options?: {
  authPreparation?: ClaudeRuntimeAuthPreparation
  networkProxySettings?: NetworkProxySettings
  signal?: AbortSignal
}): Promise<ProviderRateLimits> {
  if (options?.signal?.aborted) {
    return abortedClaudeUsageResult()
  }
  const launch = resolveClaudePtyLaunch(options)
  const terminal = await spawnHiddenCommandPty({
    ...launch,
    name: 'xterm-256color',
    cols: 120,
    rows: 40
  })

  return new Promise<ProviderRateLimits>((resolve) => {
    let output = ''
    let resolved = false
    let sentUsage = false
    let stopDetected = false
    let claude21UsageDetected = false
    let startupTimer: ReturnType<typeof setTimeout> | null = null
    let stopSettleTimer: ReturnType<typeof setTimeout> | null = null
    let claude21SettleTimer: ReturnType<typeof setTimeout> | null = null
    let enterInterval: ReturnType<typeof setInterval> | null = null
    let timeout: ReturnType<typeof setTimeout> | null = null

    const disposables: { dispose: () => void }[] = [registerHiddenRateLimitPty(terminal)]

    const clearTimers = (): void => {
      if (startupTimer) {
        clearTimeout(startupTimer)
        startupTimer = null
      }
      if (stopSettleTimer) {
        clearTimeout(stopSettleTimer)
        stopSettleTimer = null
      }
      if (claude21SettleTimer) {
        clearTimeout(claude21SettleTimer)
        claude21SettleTimer = null
      }
      if (enterInterval) {
        clearInterval(enterInterval)
        enterInterval = null
      }
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
    }

    const settle = (result: ProviderRateLimits, kill: boolean): void => {
      if (resolved) {
        return
      }
      resolved = true
      clearTimers()
      cleanupHiddenRateLimitPty(terminal, disposables, { kill })
      resolve(result)
    }

    const cleanOutput = (): string => stripClaudeTerminalControlSequences(output)

    const finalize = (): void => {
      const clean = cleanOutput()
      settle(buildUsageResult(clean, describeClaudeUsageFailure(clean)), true)
    }

    const settleAborted = (): void => {
      settle(abortedClaudeUsageResult(), true)
    }

    if (options?.signal) {
      if (options.signal.aborted) {
        settleAborted()
        return
      }
      options.signal.addEventListener('abort', settleAborted, { once: true })
      disposables.push({
        dispose: () => options.signal?.removeEventListener('abort', settleAborted)
      })
    }

    timeout = setTimeout(() => {
      const clean = cleanOutput()
      const failure = isClaude21Usage(clean)
        ? describeClaudeUsageFailure(clean)
        : 'PTY timeout — /usage panel did not render'
      settle(buildUsageResult(clean, failure), true)
    }, PTY_TIMEOUT_MS)

    const startEnterPresses = (): void => {
      if (enterInterval) {
        return
      }
      enterInterval = setInterval(() => {
        if (!resolved && !stopDetected) {
          terminal.write('\r')
        }
      }, 800)
    }

    startupTimer = setTimeout(() => {
      startupTimer = null
      if (resolved) {
        return
      }
      sentUsage = true
      terminal.write('/usage\r')
      startEnterPresses()
    }, STARTUP_DELAY_MS)

    const onDataDisposable = terminal.onData((data) => {
      output += data
      if (output.length > MAX_OUTPUT_LENGTH) {
        output = output.slice(-MAX_OUTPUT_LENGTH)
      }
      const cleanChunk = stripClaudeTerminalControlSequences(data)
      if (isClaudeTrustPrompt(cleanChunk)) {
        terminal.write('y\r')
        return
      }
      if (sentUsage && isClaudeCommandPalette(cleanChunk)) {
        terminal.write('\r')
      }
      if (!sentUsage || stopDetected) {
        return
      }

      const clean = cleanOutput()
      if (!claude21UsageDetected && isClaude21Usage(clean)) {
        claude21UsageDetected = true
        if (enterInterval) {
          clearInterval(enterInterval)
          enterInterval = null
        }
        claude21SettleTimer = setTimeout(finalize, SETTLE_AFTER_CLAUDE_21_USAGE_MS)
      }
      if (hasClaudeUsageStop(clean)) {
        stopDetected = true
        stopSettleTimer = setTimeout(finalize, SETTLE_AFTER_STOP_MS)
      }
    })
    if (onDataDisposable) {
      disposables.push(onDataDisposable)
    }

    const onExitDisposable = terminal.onExit(() => {
      const clean = cleanOutput()
      settle(buildUsageResult(clean, 'CLI exited before /usage rendered'), false)
    })
    if (onExitDisposable) {
      disposables.push(onExitDisposable)
    }
  })
}
