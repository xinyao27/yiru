import { detectAgentStatusFromTitle } from '~shared/agent/detection'
import type { AgentStatus } from '~shared/agent/detection'
import type { RuntimeTerminalWaitBlockedReason } from '~shared/runtime-types'

import { findTerminalWaitBlockedSignal } from './terminal-wait-result'

export const TUI_IDLE_DEFAULT_TIMEOUT_MS = 5 * 60 * 1000
export const TUI_IDLE_POLL_INTERVAL_MS = 2000
export const TUI_IDLE_QUIESCENCE_MS = 3000
export const MESSAGE_WAIT_DEFAULT_TIMEOUT_MS = 2 * 60 * 1000
export const EXPLICIT_IDLE_TITLE_RE = /(^|\s)(ready|idle|done)(\s|$|[.!?])/i
export const CLAUDE_IDLE_PREFIX = '\u2733'
export const GEMINI_IDLE_PREFIX = '\u25c7'
export const PI_IDLE_PREFIX = '\u03c0 - '

// Clamp range for the user-facing mobileAutoRestoreFitMs preference.
// MIN floor: a couple of seconds is the smallest useful auto-restore
// (anything tighter is the legacy 300ms debounce).
// MAX ceiling: one hour — a held PTY beyond that is almost certainly
// "I forgot" rather than intentional.
export const MOBILE_AUTO_RESTORE_FIT_MIN_MS = 5_000
export const MOBILE_AUTO_RESTORE_FIT_MAX_MS = 60 * 60 * 1000

export function detectExplicitIdleStatusFromTitle(title: string): AgentStatus | null {
  const status = detectAgentStatusFromTitle(title)
  if (status !== 'idle') {
    return null
  }
  // Why: user-supplied launch titles like "Codex YOLO" contain an agent name
  // but are not readiness signals. terminal.wait needs explicit idle evidence.
  if (
    EXPLICIT_IDLE_TITLE_RE.test(title) ||
    title.startsWith(CLAUDE_IDLE_PREFIX) ||
    title.startsWith('* ') ||
    title.includes(GEMINI_IDLE_PREFIX) ||
    title.startsWith(PI_IDLE_PREFIX)
  ) {
    return 'idle'
  }
  return null
}

export function isKnownReadyPromptPreview(preview: string): boolean {
  const normalized = preview.toLowerCase()
  const readyIndex = findKnownReadyPromptIndex(normalized)
  if (readyIndex === null) {
    return false
  }
  const blockedSignal = findTerminalWaitBlockedSignal(normalized)
  if (blockedSignal !== null && blockedSignal.index > readyIndex) {
    return false
  }
  return true
}

export function detectTerminalWaitBlockedReason(
  preview: string
): RuntimeTerminalWaitBlockedReason | null {
  const normalized = preview.toLowerCase()
  return findActionableTerminalWaitBlockedSignal(normalized)?.reason ?? null
}

export function findActionableTerminalWaitBlockedSignal(
  normalized: string
): { reason: RuntimeTerminalWaitBlockedReason; index: number } | null {
  const blockedSignal = findTerminalWaitBlockedSignal(normalized)
  if (blockedSignal === null) {
    return null
  }
  const dismissedModalIndex = findDismissedStartupModalIndex(normalized)
  // Why: retained terminal tails can include stale startup modals. If a known
  // agent's live prompt appears after that modal, the modal was dismissed and
  // the signal is no longer actionable — even if the agent is still mid-run
  // (Cursor never reports idle via OSC title, so its busy prompt clears too).
  return dismissedModalIndex !== null && dismissedModalIndex > blockedSignal.index
    ? null
    : blockedSignal
}

// Why: a recognized agent's live prompt (idle OR busy) proves its startup modal
// was dismissed. Broader than the idle-only ready set so a mid-run Cursor lane
// stops reporting a stale trust hit for the rest of the session.
export function findDismissedStartupModalIndex(normalized: string): number | null {
  const indexes = [
    findCodexReadyPromptIndex(normalized),
    findAntigravityReadyPromptIndex(normalized),
    findCursorActivePromptIndex(normalized)
  ].filter((index): index is number => index !== null)
  return indexes.length > 0 ? Math.max(...indexes) : null
}

export function findKnownReadyPromptIndex(normalized: string): number | null {
  const indexes = [
    findCodexReadyPromptIndex(normalized),
    findAntigravityReadyPromptIndex(normalized),
    findCursorReadyPromptIndex(normalized)
  ].filter((index): index is number => index !== null)
  return indexes.length > 0 ? Math.max(...indexes) : null
}

// Why: cursor-agent keeps a persistent TUI — a printed "Cursor Agent" banner and
// a "→" input-prompt line appear once its trust dialog is dismissed, in both
// busy and idle states. The banner is matched by its last occurrence so the
// trust dialog's own "Cursor Agent" body text (which precedes the banner) does
// not win. The "→" glyph is cursor-agent's input prompt marker ("→ Plan,
// search, build anything" fresh, "→ Add a follow-up" after the first turn).
export function findCursorActivePromptIndex(normalized: string): number | null {
  const headerIndex = normalized.lastIndexOf('cursor agent')
  if (headerIndex === -1) {
    return null
  }
  return normalized.includes('→', headerIndex) ? headerIndex : null
}

// Why: cursor-agent never emits an idle OSC title (its bare title is dropped),
// so tui-idle can only resolve from the tail. Busy frames draw a braille
// spinner in the on-screen status line; its absence past the banner is idle.
export const CURSOR_BUSY_SPINNER_RE = /[⠁-⣿]/

export function findCursorReadyPromptIndex(normalized: string): number | null {
  const activeIndex = findCursorActivePromptIndex(normalized)
  if (activeIndex === null) {
    return null
  }
  return CURSOR_BUSY_SPINNER_RE.test(normalized.slice(activeIndex)) ? null : activeIndex
}

export function findCodexReadyPromptIndex(normalized: string): number | null {
  const headerIndex = normalized.lastIndexOf('openai codex')
  if (headerIndex === -1) {
    return null
  }
  const readySegment = normalized.slice(headerIndex)
  // Why: current Codex prints permissions only in YOLO mode. The stable ready
  // header is OpenAI Codex + model + directory.
  return readySegment.includes('model:') && readySegment.includes('directory:') ? headerIndex : null
}

export function findAntigravityReadyPromptIndex(normalized: string): number | null {
  const headerIndex = normalized.lastIndexOf('antigravity cli')
  if (headerIndex === -1) {
    return null
  }
  let lineStart = headerIndex
  let modelIndex: number | null = null
  let promptIndex: number | null = null

  // Why: ready previews can include echoed pasted output after the header;
  // scan line bounds directly instead of splitting the whole terminal tail.
  for (let cursor = headerIndex; cursor <= normalized.length; cursor += 1) {
    if (cursor < normalized.length && normalized.charCodeAt(cursor) !== 10) {
      continue
    }
    let trimmedStart = lineStart
    let trimmedEnd = cursor
    while (trimmedStart < trimmedEnd && isTerminalWaitWhitespace(normalized, trimmedStart)) {
      trimmedStart += 1
    }
    while (trimmedEnd > trimmedStart && isTerminalWaitWhitespace(normalized, trimmedEnd - 1)) {
      trimmedEnd -= 1
    }
    if (lineStart > headerIndex && trimmedStart < trimmedEnd) {
      if (modelIndex === null && normalized.startsWith('gemini', trimmedStart)) {
        modelIndex = trimmedStart
      }
      if (
        promptIndex === null &&
        trimmedEnd - trimmedStart === 1 &&
        normalized.charCodeAt(trimmedStart) === 62
      ) {
        promptIndex = trimmedStart
      }
    }
    lineStart = cursor + 1
  }

  return modelIndex !== null && promptIndex !== null ? Math.max(modelIndex, promptIndex) : null
}

export function isTerminalWaitWhitespace(value: string, index: number): boolean {
  const code = value.charCodeAt(index)
  return code === 32 || (code >= 9 && code <= 13)
}

export const TERMINAL_WAIT_BLOCKED_SENTINEL_RE =
  /update available|choose working directory to|codex just got an upgrade|hooks need review|do you trust|trust this|trusted workspace|press enter to (?:confirm|continue|view|insert)|press t to trust/i
