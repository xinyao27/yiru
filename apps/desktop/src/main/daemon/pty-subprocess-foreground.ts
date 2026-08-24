import { win32 as pathWin32 } from 'node:path'

import type * as pty from 'node-pty'
import {
  isAgentForegroundWrapperProcess,
  recognizeAgentProcess,
  type RecognizedAgentProcess
} from '~shared/agent/process-recognition'
import { isShellProcess } from '~shared/shell-process-detection'

import { getAgentForegroundContextPaths } from '../providers/agent-foreground-context-paths'
import { resolveAgentForegroundProcessWithAvailability } from '../providers/agent-foreground-process'
import { readWindowsConptyProcessIds } from '../providers/windows-conpty-process-membership'
import { parsePtySessionId } from './pty-session-id'
import type { PtySubprocessOptions } from './pty-subprocess-types'

const FOREGROUND_AGENT_CACHE_TTL_MS = 1000
const SHELL_FOREGROUND_REFRESH_RETRY_MS = 5_000
const WINDOWS_IDLE_SHELL_FOREGROUND_REFRESH_RETRY_MS = 15_000
const SHELL_FOREGROUND_OUTPUT_HOT_WINDOW_MS = 10_000
const STARTUP_AGENT_FOREGROUND_BOOTSTRAP_MS = 5_000

function normalizeForegroundProcessName(processName: string | null | undefined): string | null {
  const trimmed = processName?.trim().replace(/^["']|["']$/g, '') ?? ''
  if (!trimmed || trimmed === 'xterm-256color') {
    return null
  }
  return trimmed.split(/[\\/]/).pop() || null
}

function resolveFallbackForegroundProcess(
  processName: string | null | undefined,
  shellPath: string
): string | null {
  const normalized = normalizeForegroundProcessName(processName)
  if (normalized || process.platform !== 'win32') {
    return normalized
  }
  return normalizeForegroundProcessName(pathWin32.basename(shellPath))
}

export function createDaemonPtyForeground(args: {
  process: pty.IPty
  shellPath: string
  options: PtySubprocessOptions
  startupAgentRecognition: RecognizedAgentProcess | null
}): {
  recordOutput(): void
  markDead(): void
  getForegroundProcess(): string | null
  confirmForegroundProcess(): Promise<string | null>
} {
  const proc = args.process
  let dead = false
  let lastOutputAt = 0
  let cachedAgentForeground: { processName: string; refreshedAt: number } | null = null
  const contextPaths = getAgentForegroundContextPaths({
    cwd: args.options.cwd,
    worktreeId: parsePtySessionId(args.options.sessionId).worktreeId
  })
  let startupAgentForeground = args.startupAgentRecognition
    ? {
        processName: args.startupAgentRecognition.processName,
        expiresAt: Date.now() + STARTUP_AGENT_FOREGROUND_BOOTSTRAP_MS
      }
    : null
  let refreshInFlight = false
  let lastRefreshStartedAt = 0

  const getFallback = (): string | null =>
    resolveFallbackForegroundProcess(proc.process, args.shellPath)
  const getActiveStartup = (now = Date.now()): typeof startupAgentForeground => {
    if (startupAgentForeground && now > startupAgentForeground.expiresAt) {
      startupAgentForeground = null
    }
    return startupAgentForeground
  }
  const shouldInspect = (fallback: string | null): boolean =>
    fallback !== null &&
    (isShellProcess(fallback) ||
      isAgentForegroundWrapperProcess(fallback) ||
      process.platform !== 'win32')

  const scheduleRefresh = (fallback: string | null): void => {
    if (
      dead ||
      !proc.pid ||
      !fallback ||
      recognizeAgentProcess(fallback) ||
      !shouldInspect(fallback)
    ) {
      return
    }
    const now = Date.now()
    const fallbackIsShell = isShellProcess(fallback)
    const idleNoEvidenceShell = fallbackIsShell && !getActiveStartup(now) && !cachedAgentForeground
    const retryMs = !idleNoEvidenceShell
      ? FOREGROUND_AGENT_CACHE_TTL_MS
      : process.platform === 'win32' && now - lastOutputAt > SHELL_FOREGROUND_OUTPUT_HOT_WINDOW_MS
        ? WINDOWS_IDLE_SHELL_FOREGROUND_REFRESH_RETRY_MS
        : SHELL_FOREGROUND_REFRESH_RETRY_MS
    if (refreshInFlight || now - lastRefreshStartedAt < retryMs) {
      return
    }
    refreshInFlight = true
    lastRefreshStartedAt = now
    void resolveAgentForegroundProcessWithAvailability(proc.pid, fallback, { contextPaths })
      .then(({ processName }) => {
        if (dead) {
          return
        }
        if (!processName || !recognizeAgentProcess(processName)) {
          const currentFallback = getFallback()
          if (
            fallbackIsShell &&
            !getActiveStartup() &&
            currentFallback !== null &&
            isShellProcess(currentFallback)
          ) {
            cachedAgentForeground = null
            startupAgentForeground = null
          } else if (
            cachedAgentForeground !== null &&
            Date.now() - cachedAgentForeground.refreshedAt > FOREGROUND_AGENT_CACHE_TTL_MS &&
            currentFallback !== null &&
            isAgentForegroundWrapperProcess(currentFallback)
          ) {
            cachedAgentForeground = null
          }
          return
        }
        cachedAgentForeground = { processName, refreshedAt: Date.now() }
        startupAgentForeground = null
      })
      .catch(() => {})
      .finally(() => {
        refreshInFlight = false
      })
  }

  const getForegroundProcess = (): string | null => {
    if (dead) {
      return null
    }
    try {
      const fallback = getFallback()
      if (fallback && recognizeAgentProcess(fallback)) {
        cachedAgentForeground = { processName: fallback, refreshedAt: Date.now() }
        startupAgentForeground = null
        return fallback
      }
      scheduleRefresh(fallback)
      const now = Date.now()
      if (
        cachedAgentForeground &&
        now - cachedAgentForeground.refreshedAt <= FOREGROUND_AGENT_CACHE_TTL_MS
      ) {
        return cachedAgentForeground.processName
      }
      if (cachedAgentForeground && fallback && isAgentForegroundWrapperProcess(fallback)) {
        return cachedAgentForeground.processName
      }
      const startup = getActiveStartup(now)
      return fallback && isShellProcess(fallback) && startup ? startup.processName : fallback
    } catch {
      return null
    }
  }

  const confirmForegroundProcess = async (): Promise<string | null> => {
    if (dead || !proc.pid) {
      return null
    }
    try {
      const fallback = getFallback()
      if (
        !fallback ||
        (recognizeAgentProcess(fallback) && process.platform !== 'win32') ||
        (process.platform !== 'win32' && !shouldInspect(fallback))
      ) {
        return fallback
      }
      const resolution = await resolveAgentForegroundProcessWithAvailability(proc.pid, fallback, {
        contextPaths,
        fresh: true,
        ...(process.platform === 'win32'
          ? {
              forceProcessScan: true,
              readWindowsConptyProcessIds: () => readWindowsConptyProcessIds(proc.pid)
            }
          : {})
      })
      if (dead || !resolution.available) {
        return null
      }
      const recognized = recognizeAgentProcess(resolution.processName)
      if (recognized) {
        cachedAgentForeground = { processName: recognized.processName, refreshedAt: Date.now() }
        startupAgentForeground = null
        return recognized.processName
      }
      cachedAgentForeground = null
      startupAgentForeground = null
      return resolution.processName
    } catch {
      return null
    }
  }

  return {
    recordOutput: () => {
      lastOutputAt = Date.now()
    },
    markDead: () => {
      dead = true
      cachedAgentForeground = null
      startupAgentForeground = null
    },
    getForegroundProcess,
    confirmForegroundProcess
  }
}
