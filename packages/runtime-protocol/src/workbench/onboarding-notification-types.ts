import type { AgentStatusState, AgentType } from '@yiru/runtime-protocol/model/agent'

import type { GlobalSettings } from './types'

export type GhosttyImportPreview = {
  found: boolean
  configPath?: string
  configPaths?: string[]
  diff: Partial<GlobalSettings>
  unsupportedKeys: string[]
  error?: string
}

// Subset of the renderer's onboarding-step Ghostty `DiscoveryState['status']`
// values that ever ship a telemetry event. The UI-only states (`'idle'`,
// `'detecting'`) never fire `onboarding_ghostty_discovered`. Lives in
// `shared/` because the schema in `telemetry-events.ts` (node-tsconfig) and
// `theme-step.tsx` (web-tsconfig) both need it for the compile-time
// schema-vs-renderer enum sync guard.
export type DiscoveryStatusEmitted = 'found' | 'absent' | 'imported'

export type NotificationEventSource = 'agent-task-complete' | 'terminal-bell' | 'test'

export type NotificationDispatchRequest = {
  source: NotificationEventSource
  notificationId?: string
  /** Why: useful for fast native failures, but macOS can still drop notifications after 'show'. */
  requireDisplayConfirmation?: boolean
  worktreeId?: string
  /** Stable `${tabId}:${leafId}` terminal pane key for click-to-focus routing. */
  paneKey?: string
  repoLabel?: string
  worktreeLabel?: string
  hasMultipleActiveRepos?: boolean
  terminalTitle?: string
  isActiveWorktree?: boolean
  agentType?: AgentType
  agentState?: AgentStatusState
  agentPrompt?: string
  agentToolName?: string
  agentToolInput?: string
  agentLastAssistantMessage?: string
  agentInterrupted?: boolean
}

export type NotificationSoundResult = {
  played: boolean
  reason?:
    | 'missing-path'
    | 'invalid-path'
    | 'unsupported-type'
    | 'too-large'
    | 'read-failed'
    | 'playback-failed'
    | 'deduped'
}

export type NotificationSoundDataResult =
  | {
      ok: true
      data: Uint8Array
      mimeType: string
      path: string
    }
  | {
      ok: false
      reason: Exclude<NotificationSoundResult['reason'], 'playback-failed'>
    }

export type NotificationSoundPathResult =
  | { ok: true; path: string }
  | { ok: false; reason: 'missing-path' | 'invalid-path' | 'unsupported-type' }

export type OnboardingOutcome = 'completed' | 'dismissed'

export type OnboardingChecklistState = {
  addedRepo: boolean
  choseAgent: boolean
  ranFirstAgent: boolean
  ranSecondAgentOnSameTask: boolean
  triedCmdJ: boolean
  shapedSidebar: boolean
  reviewedDiff: boolean
  openedPr: boolean
  addedFolder: boolean
  openedFile: boolean
  ranAgentOnFile: boolean
  // Why: UI state flag (panel visibility), not an activation event. The
  // telemetry checklist enum in telemetry-events.ts intentionally omits this.
  dismissed: boolean
}

export type OnboardingState = {
  // Why: numeric step meanings can change when pages are removed; persisted
  // state needs a version marker so migration does not re-run on new progress.
  flowVersion: number
  closedAt: number | null
  outcome: OnboardingOutcome | null
  // Sentinel `-1` = not started; `1..5` = highest wizard step the user
  // finished. Kept as `number` (not a literal union) because callers clamp
  // via `Math.max`/`Math.min` against arbitrary numerics.
  lastCompletedStep: number
  checklist: OnboardingChecklistState
}

export type NotificationPermissionStatusResult = {
  supported: boolean
  platform: NodeJS.Platform
  requested: boolean
}

/** Outcome of a macOS notification permission check. Preferred source is the
 *  bundled native helper reading UNUserNotificationCenter authorization
 *  (authoritative); when unavailable, a silent delivery probe supplies weaker
 *  scheduling-based evidence. 'awaiting-decision' means the macOS permission
 *  dialog has not been answered yet. */
export type NotificationDeliveryProbeResult = {
  state: 'delivered' | 'blocked' | 'awaiting-decision' | 'unsupported'
  /** True when the state comes from the native authorization readout. Silent
   *  to poll; probe-based fallbacks flash a banner when delivery works. */
  authoritative: boolean
}
