import type { ProjectExecutionRuntimeResolution } from '@yiru/runtime-protocol/workbench/project-execution-runtime'
import type {
  RuntimeTerminalPresentation,
  RuntimeTerminalWait,
  RuntimeTerminalWaitCondition
} from '@yiru/runtime-protocol/workbench/runtime-types'
import type { TuiAgent } from '@yiru/runtime-protocol/workbench/types'

export type WorktreeStartupDraftPaste = {
  agent: TuiAgent
  content: string
}

export type WorktreeStartupFollowup = {
  expectedProcess: string
  prompt: string
}

export function getAgentLaunchPlatform(
  projectRuntime?: ProjectExecutionRuntimeResolution
): NodeJS.Platform {
  if (projectRuntime?.status === 'repair-required') {
    return projectRuntime.repair.preferredRuntime.kind === 'wsl' ? 'linux' : process.platform
  }
  if (projectRuntime?.status === 'resolved' && projectRuntime.runtime.kind === 'wsl') {
    return 'linux'
  }
  return process.platform
}

// Why: long enough for a phone to reconnect and retry a create whose response
// was lost, short enough that an intentional later re-resume forks fresh.
export const MOBILE_TERMINAL_CREATE_RESULT_TTL_MS = 60_000
export const FOREGROUND_AGENT_WRAPPER_RETRY_INTERVAL_MS = 150
export const FOREGROUND_AGENT_WRAPPER_RETRY_TIMEOUT_MS = 6_500
export const BRACKETED_PASTE_BEGIN = '\x1b[200~'
export const BRACKETED_PASTE_END = '\x1b[201~'
export const BRACKETED_PASTE_QUIET_MS = 1500
export const DRAFT_PASTE_READY_TIMEOUT_MS = 8000
export const MOBILE_TERMINAL_SURFACE_TIMEOUT_MS = 10_000
export const MOBILE_TERMINAL_READY_FALLBACK_MS = 1000
export const RECENT_PTY_OUTPUT_LIMIT = 64 * 1024
export const RECENT_PTY_PATH_CANDIDATE_LIMIT = 1024
export const RECENT_PTY_PATH_CANDIDATE_MAX_BYTES = 4 * 1024
export const RECENT_PTY_PATH_CANDIDATE_TOTAL_BYTES = 64 * 1024

export function isClientDisconnectedError(error: unknown): boolean {
  return error instanceof Error && error.message === 'client_disconnected'
}

export function createTerminalRevealWarning(handle: string, error?: unknown): string {
  const reason =
    error instanceof Error && error.message.trim().length > 0
      ? ` Reason: ${error.message.trim()}.`
      : ''
  return [
    `Terminal ${handle} is running, but Yiru could not make it discoverable.${reason}`,
    `Run \`yiru terminal focus --terminal ${handle}\` to reveal and focus it.`
  ].join(' ')
}

export function resolveTerminalPresentation(opts: {
  presentation?: RuntimeTerminalPresentation
  focus?: boolean
  activate?: boolean
}): RuntimeTerminalPresentation | undefined {
  if (opts.presentation) {
    return opts.presentation
  }
  if (opts.focus === true || opts.activate === true) {
    return 'focused'
  }
  return undefined
}

export type TerminalHandleRecord = {
  handle: string
  runtimeId: string
  rendererGraphEpoch: number
  worktreeId: string
  tabId: string
  leafId: string
  ptyId: string | null
  ptyGeneration: number
}

export type TerminalWaiter = {
  handle: string
  condition: RuntimeTerminalWaitCondition
  resolve: (result: RuntimeTerminalWait) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout | null
  pollInterval: NodeJS.Timeout | null
  abortCleanup: (() => void) | null
}

export type MessageWaiter = {
  handle: string
  typeFilter: string[] | undefined
  resolve: (result: MessageWaitResult) => void
  timeout: NodeJS.Timeout | null
  abortCleanup: (() => void) | null
}

export type MessageWaitResult = 'notified' | 'timed_out' | 'cancelled' | 'waiter_exists'
