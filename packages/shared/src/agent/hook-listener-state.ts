import type { AgentProviderSessionMetadata } from '@yiru/workbench-model/agent'
import type { AgentStatusState, ParsedAgentStatusPayload } from '@yiru/workbench-model/agent'

import type { ClaudeSubagentRoster } from '../claude-subagent-roster'
import type { CodexSubagentRoster } from '../codex-subagent-roster'
import { REMOTE_AGENT_HOOK_ENV } from './hook-relay'
import type { ToolSnapshot } from './hook-tool-state'
import { YIRU_HOOK_PROTOCOL_VERSION } from './hook-types'

export const HOOK_REQUEST_MAX_BYTES = 1_000_000

/** Bound the warn-once Sets so a buggy/malicious local client that varies its
 *  `version` / `env` fields per request cannot grow them without bound for the
 *  process lifetime. */
export const MAX_WARNED_KEYS = 32

/** Slowloris cap: drop requests that have not finished sending after 5 s. */
export const HOOK_REQUEST_SLOWLORIS_MS = 5_000

/** Why: OpenCode plugin builds installed before the throttle/cap fix re-post
 *  the full accumulated reply text on every streamed part update (O(n²) bytes
 *  per turn). Capping at ingest bounds the per-event cost of the status
 *  compare, IPC fanout, renderer store update, and disk persist regardless of
 *  which plugin version is running inside the OpenCode process. */
export const OPENCODE_HOOK_TEXT_MAX_CHARS = 8_000

export function capOpenCodeHookText(text: string): string {
  return text.length > OPENCODE_HOOK_TEXT_MAX_CHARS
    ? text.slice(0, OPENCODE_HOOK_TEXT_MAX_CHARS)
    : text
}

/** Bound paneKey size — `${tabId}:${leafUuid}` is well under 200 chars in
 *  practice; cap defends per-pane caches against pathological input.
 *  Exported so non-HTTP ingest paths (e.g. Yiru's `ingestRemote`) can apply
 *  the same cap as defense-in-depth. */
export const MAX_PANE_KEY_LEN = 200

/** Per-listener-instance state that holds caches needing per-PTY teardown
 *  (last prompt, last tool snapshot, last status replay). Both Yiru's main
 *  process and the relay get their own instance — they never share. */
export type HookListenerState = {
  warnedVersions: Set<string>
  warnedEnvs: Set<string>
  lastPromptByPaneKey: Map<string, string>
  lastToolByPaneKey: Map<string, ToolSnapshot>
  lastStatusByPaneKey: Map<string, AgentHookEventPayload>
  antigravityCompletedTranscriptByPaneKey: Map<string, string>
  ampCompletedCacheKeys: Set<string>
  /** Live subagents/teammates per Claude pane. Survives turn boundaries —
   *  background children outlive the lead turn that spawned them. */
  claudeSubagentRosterByPaneKey: Map<string, ClaudeSubagentRoster>
  /** Last state derived from the LEAD session's own events (subagent-origin
   *  events carry `agent_id` and are excluded). Needed so a SubagentStop can
   *  re-emit the pane status without inventing a lead state. `interrupted`
   *  persists here because a gated 'working' emit clamps the flag away, and
   *  the eventual done (when the last child drains) must still carry it. */
  claudeLeadStateByPaneKey: Map<string, ClaudeLeadTurnState>
  /** Live thread-spawn children per Codex pane. */
  codexSubagentRosterByPaneKey: Map<string, CodexSubagentRoster>
  /** Root Codex state/model, kept separate from child hook traffic. */
  codexLeadStateByPaneKey: Map<string, CodexLeadTurnState>
}

export type ClaudeLeadTurnState = {
  state: AgentStatusState
  interrupted?: true
  /** Set when the waiting state was induced by a subagent's PermissionRequest
   *  or AskUserQuestion (those payloads carry `agent_id`). Only that agent's
   *  next tool activity may clear the wait — other children's churn must not
   *  dismiss a pending human-input card. */
  waitingAgentId?: string
  /** The lead state a child-induced wait displaced. Restored when the wait
   *  clears — the lead may have already finished its turn, and inventing
   *  'working' would leave the pane spinning after the roster drains (the
   *  done-gate only ever downgrades done → working, never back). */
  stateBeforeWait?: Pick<ClaudeLeadTurnState, 'state' | 'interrupted'>
}

export type CodexLeadTurnState = {
  state: 'working' | 'waiting' | 'done'
  model?: string
}

export function createHookListenerState(): HookListenerState {
  return {
    warnedVersions: new Set(),
    warnedEnvs: new Set(),
    lastPromptByPaneKey: new Map(),
    lastToolByPaneKey: new Map(),
    lastStatusByPaneKey: new Map(),
    antigravityCompletedTranscriptByPaneKey: new Map(),
    ampCompletedCacheKeys: new Set(),
    claudeSubagentRosterByPaneKey: new Map(),
    claudeLeadStateByPaneKey: new Map(),
    codexSubagentRosterByPaneKey: new Map(),
    codexLeadStateByPaneKey: new Map()
  }
}

export function clearPaneCacheState(state: HookListenerState, paneKey: string): void {
  deletePaneScopedCacheEntry(state.lastPromptByPaneKey, paneKey)
  deletePaneScopedCacheEntry(state.lastToolByPaneKey, paneKey)
  deletePaneScopedCacheEntry(state.lastStatusByPaneKey, paneKey)
  deletePaneScopedCacheEntry(state.antigravityCompletedTranscriptByPaneKey, paneKey)
  deletePaneScopedSetEntry(state.ampCompletedCacheKeys, paneKey)
  state.claudeSubagentRosterByPaneKey.delete(paneKey)
  state.claudeLeadStateByPaneKey.delete(paneKey)
  state.codexSubagentRosterByPaneKey.delete(paneKey)
  state.codexLeadStateByPaneKey.delete(paneKey)
}

export function movePaneScopedMapEntries<T>(
  map: Map<string, T>,
  fromPaneKey: string,
  toPaneKey: string
): void {
  for (const [key, value] of Array.from(map.entries())) {
    if (key !== fromPaneKey && !key.startsWith(`${fromPaneKey}\0`)) {
      continue
    }
    map.delete(key)
    map.set(`${toPaneKey}${key.slice(fromPaneKey.length)}`, value)
  }
}

export function movePaneScopedSetEntries(
  set: Set<string>,
  fromPaneKey: string,
  toPaneKey: string
): void {
  for (const key of Array.from(set)) {
    if (key !== fromPaneKey && !key.startsWith(`${fromPaneKey}\0`)) {
      continue
    }
    set.delete(key)
    set.add(`${toPaneKey}${key.slice(fromPaneKey.length)}`)
  }
}

export function movePaneCacheState(
  state: HookListenerState,
  fromPaneKey: string,
  toPaneKey: string
): void {
  if (fromPaneKey === toPaneKey) {
    return
  }
  movePaneScopedMapEntries(state.lastPromptByPaneKey, fromPaneKey, toPaneKey)
  movePaneScopedMapEntries(state.lastToolByPaneKey, fromPaneKey, toPaneKey)
  movePaneScopedMapEntries(state.lastStatusByPaneKey, fromPaneKey, toPaneKey)
  movePaneScopedMapEntries(state.antigravityCompletedTranscriptByPaneKey, fromPaneKey, toPaneKey)
  movePaneScopedSetEntries(state.ampCompletedCacheKeys, fromPaneKey, toPaneKey)
  movePaneScopedMapEntries(state.claudeSubagentRosterByPaneKey, fromPaneKey, toPaneKey)
  movePaneScopedMapEntries(state.claudeLeadStateByPaneKey, fromPaneKey, toPaneKey)
  movePaneScopedMapEntries(state.codexSubagentRosterByPaneKey, fromPaneKey, toPaneKey)
  movePaneScopedMapEntries(state.codexLeadStateByPaneKey, fromPaneKey, toPaneKey)
}

export function clearPaneTurnCacheState(state: HookListenerState, paneKey: string): void {
  state.lastPromptByPaneKey.delete(paneKey)
  state.lastToolByPaneKey.delete(paneKey)
  state.antigravityCompletedTranscriptByPaneKey.delete(paneKey)
  state.ampCompletedCacheKeys.delete(paneKey)
}

export function deletePaneScopedCacheEntry(map: Map<string, unknown>, paneKey: string): void {
  map.delete(paneKey)
  const scopedPrefix = `${paneKey}\0`
  for (const key of map.keys()) {
    if (key.startsWith(scopedPrefix)) {
      map.delete(key)
    }
  }
}

export function deletePaneScopedSetEntry(set: Set<string>, paneKey: string): void {
  set.delete(paneKey)
  const scopedPrefix = `${paneKey}\0`
  for (const key of set) {
    if (key.startsWith(scopedPrefix)) {
      set.delete(key)
    }
  }
}

export function clearAllListenerCaches(state: HookListenerState): void {
  state.lastPromptByPaneKey.clear()
  state.lastToolByPaneKey.clear()
  state.lastStatusByPaneKey.clear()
  state.antigravityCompletedTranscriptByPaneKey.clear()
  state.ampCompletedCacheKeys.clear()
  state.warnedVersions.clear()
  state.warnedEnvs.clear()
  state.claudeSubagentRosterByPaneKey.clear()
  state.claudeLeadStateByPaneKey.clear()
  state.codexSubagentRosterByPaneKey.clear()
  state.codexLeadStateByPaneKey.clear()
}

/** Emit warn-once diagnostics for cross-build (`version`) and dev-vs-prod
 *  (`env`) mismatches. Shared between the local HTTP path
 *  (`normalizeHookPayload`) and the relay-forwarded path
 *  (`AgentHookServer.ingestRemote`) so a remote-sourced event triggers the
 *  same diagnostic noise as a local one. The relay's "remote" marker is a
 *  location tag, not a build env, so it must not look like stale local hooks. */
export function warnOnHookEnvOrVersionMismatch(
  state: HookListenerState,
  fields: { version?: string; env?: string; expectedEnv: string }
): void {
  const { version, env, expectedEnv } = fields
  if (
    version &&
    version !== YIRU_HOOK_PROTOCOL_VERSION &&
    !state.warnedVersions.has(version) &&
    state.warnedVersions.size < MAX_WARNED_KEYS
  ) {
    state.warnedVersions.add(version)
    console.warn(
      `[agent-hooks] received hook v${version}; server expects v${YIRU_HOOK_PROTOCOL_VERSION}. ` +
        'Reinstall agent hooks from Settings to upgrade the managed script.'
    )
  }
  if (env && env !== REMOTE_AGENT_HOOK_ENV && env !== expectedEnv) {
    const key = `${env}->${expectedEnv}`
    if (!state.warnedEnvs.has(key) && state.warnedEnvs.size < MAX_WARNED_KEYS) {
      state.warnedEnvs.add(key)
      console.warn(
        `[agent-hooks] received ${env} hook on ${expectedEnv} server. ` +
          'Likely a stale terminal from another Yiru install.'
      )
    }
  }
}

export type AgentHookEventPayload = {
  paneKey: string
  /** Ephemeral Yiru launch identity stamped into the PTY env for this process. */
  launchToken?: string
  tabId?: string
  worktreeId?: string
  /** Identifies the SSH connection the event arrived on, or null for local.
   *  Stamped only on the remote-ingest path (Yiru's `ingestRemote`); the
   *  HTTP path always sets null because it cannot know which mux a request
   *  came from. See docs/design/agent-status-over-ssh.md §5. */
  connectionId: string | null
  /** True when this hook event carried prompt text directly, instead of using
   *  the listener's cached prompt from an earlier event in the same pane. */
  hasExplicitPrompt?: boolean
  /** Stable per-turn key when a source exposes enough local hook context to
   *  distinguish duplicate hook delivery from a same-text prompt rerun. */
  promptInteractionKey?: string
  /** Raw agent hook event name, used by main-process transition guards. */
  hookEventName?: string
  /** Claude tool-use identifier when the hook source exposes one. */
  toolUseId?: string
  /** Provider agent/subagent identifier when the hook source exposes one. */
  toolAgentId?: string
  /** Agent/subagent type from the source hook payload, when present. */
  toolAgentType?: string
  /** Provider-owned conversation/session id needed to resume a sleeping agent. */
  providerSession?: AgentProviderSessionMetadata
  /** Session identity update with no turn-state transition. */
  providerSessionOnly?: boolean
  /** True when this event is a relay cache replay rather than a live hook. */
  isReplay?: boolean
  payload: ParsedAgentStatusPayload
}

// ─── Body parsing ───────────────────────────────────────────────────
