import {
  getAgentResumeArgv,
  normalizeAgentProviderSession,
  type AgentProviderSessionMetadata
} from '@yiru/runtime-protocol/model/agent'
import {
  type AgentType,
  type AgentStatusState,
  type ParsedAgentStatusPayload,
  normalizeAgentStatusPayload
} from '@yiru/runtime-protocol/model/agent'
import { parsePaneKey } from '@yiru/runtime-protocol/workbench/stable-pane-id'
import {
  AGENT_KIND_VALUES,
  type AgentKind
} from '@yiru/runtime-protocol/workbench/telemetry-events'
import type { LegacyPaneKeyAliasEntry } from '@yiru/runtime-protocol/workbench/types'
import { MAX_PANE_KEY_LEN, type AgentHookEventPayload } from '~main/agents/core/hook-listener'

export type EnrichedAgentHookEventPayload = AgentHookEventPayload & {
  receivedAt: number
  stateStartedAt: number
}

export type AgentHookStatusChangeEntry = {
  state: AgentStatusState
  receivedAt: number
  observedInCurrentRuntime: boolean
}

export type StatusChangeListener = (statuses: AgentHookStatusChangeEntry[]) => void
export type PaneStatusClearListener = (paneKey: string) => void
export type PaneKeyAliasPersistenceListener = (entries: LegacyPaneKeyAliasEntry[]) => void
export type PaneKeyAliasEntry = {
  stablePaneKey: string
  ptyId: string | null
  updatedAt: number
  authorityVerified: boolean
}

// Why: name of the on-disk cache that survives Yiru restart. Lives next to
// the endpoint file in userData/agent-hooks/ so all hook-server-owned cross-
// restart artifacts stay co-located.
export const LAST_STATUS_FILE_NAME = 'last-status.json'
export const ASSISTANT_MESSAGE_RETRY_ATTEMPTS = 5
export const ASSISTANT_MESSAGE_RETRY_MS = 50
export const INTERRUPTED_DONE_LATE_WORKING_SUPPRESSION_MS = 15_000

// Why: starts at 2 (not 1) because pre-merge dev iterations of this branch
// wrote a v1 shape with no receivedAt / stateStartedAt. Bumping to 2 means a
// developer who upgrades from an in-flight branch sees an empty hydration
// once instead of partially-typed legacy entries. New file format; never
// shipped to users at v1. A mismatched version is treated as a corrupt file
// (silent empty hydration).
export const LAST_STATUS_FILE_VERSION = 2

// Why: trailing-edge debounce so a burst of hook events from a multi-agent
// run produces one disk write instead of N. The latency budget matches other
// hook-server batching; quit-time uses flushStatusPersistSync() for the
// guaranteed final flush.
export const STATUS_PERSIST_DEBOUNCE_MS = 250
export const TOOL_PROGRESS_HOOK_EVENTS = new Set([
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure'
])
export const AGENT_PROMPT_SENT_AGENT_KINDS = new Set<AgentKind>(AGENT_KIND_VALUES)

// Why: bound the on-disk file's growth across many sessions. PTY-teardown
// eviction handles closed panes, but daemon-restored PTYs that never re-attach
// and crash-recovery paths where teardown never fires can leave entries
// pinned forever. 7 days matches the user-visible "still relevant?" horizon —
// older entries have almost certainly been resolved or abandoned and should
// not resurrect on hydrate.
export const HYDRATE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

// Why: closed-tab suppression only needs to cover recently closed tabs — a
// status event for a long-closed tab cannot arrive once its process/hooks are
// gone. Bound the set so it can't grow one entry per tab close for the whole
// session (it is otherwise only cleared at app quit).
export const CLOSED_AGENT_STATUS_TAB_IDS_MAX = 1024
export const CLOSED_AGENT_STATUS_PANE_KEYS_MAX = 1024
export const PANE_KEY_ALIASES_MAX = 1024

export type LastStatusFile = {
  version: number
  entries: Record<string, EnrichedAgentHookEventPayload>
}

export type AgentPromptSentDedupeEntry = {
  agentKind: AgentKind
  promptHash: string
  promptInteractionKey?: string
}

export function agentTypeToPromptSentAgentKind(agentType: AgentType | undefined): AgentKind {
  const normalized = agentType?.trim().toLowerCase()
  if (!normalized || normalized === 'unknown') {
    return 'other'
  }
  if (normalized === 'claude') {
    return 'claude-code'
  }
  return AGENT_PROMPT_SENT_AGENT_KINDS.has(normalized as AgentKind)
    ? (normalized as AgentKind)
    : 'other'
}

export function equivalentInterruptAgentType(
  actual: AgentType | undefined,
  baseline: AgentType | undefined
): boolean {
  const normalizedActual = actual === 'unknown' ? undefined : actual
  const normalizedBaseline = baseline === 'unknown' ? undefined : baseline
  return normalizedActual === normalizedBaseline
}

// Why: paneKey is `${tabId}:${leafUuid}` — validate the durable leaf suffix
// at write/hydrate time so legacy numeric rows fail closed.
export function isValidPaneKey(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length <= MAX_PANE_KEY_LEN && parsePaneKey(value) !== null
  )
}

export function dropHydratedIdleClaudeSubagents(
  payload: ParsedAgentStatusPayload
): ParsedAgentStatusPayload {
  if (
    payload.agentType !== 'claude' ||
    !payload.subagents?.some((subagent) => subagent.state === 'idle')
  ) {
    return payload
  }
  const activeSubagents = payload.subagents.filter((subagent) => subagent.state !== 'idle')
  // Why: older builds persisted finished Claude children as idle rows. Prune
  // them from the replay payload itself so restart cannot resurrect the pile.
  return {
    ...payload,
    subagents: activeSubagents.length > 0 ? activeSubagents : undefined
  }
}

// Why: one shared gate keeps local hydration and SSH relay ingest from
// disagreeing about which metadata-only Pi sessions are durable.
export function isValidPiProviderSessionOnly(
  providerSession: AgentProviderSessionMetadata | undefined,
  agentType: AgentType | undefined
): boolean {
  return Boolean(providerSession && agentType === 'pi' && getAgentResumeArgv('pi', providerSession))
}

export function sanitizeHydratedEntry(
  paneKey: string,
  rawEntry: unknown
): EnrichedAgentHookEventPayload | null {
  const parsedPaneKey = parsePaneKey(paneKey)
  if (!parsedPaneKey) {
    return null
  }
  if (typeof rawEntry !== 'object' || rawEntry === null) {
    return null
  }
  const record = rawEntry as Record<string, unknown>
  if (record.paneKey !== paneKey) {
    return null
  }
  const tabId = record.tabId
  if (tabId !== undefined && (typeof tabId !== 'string' || tabId.length === 0)) {
    return null
  }
  // Why: paneKey is `${tabId}:${leafUuid}`; a stored entry whose tabId field
  // diverges from the key's tab segment is corruption (renamer bug, manual
  // edit, future shape drift). Drop instead of hydrating an inconsistent row.
  if (typeof tabId === 'string' && tabId !== parsedPaneKey.tabId) {
    return null
  }
  const worktreeId = record.worktreeId
  if (worktreeId !== undefined && (typeof worktreeId !== 'string' || worktreeId.length === 0)) {
    return null
  }
  const receivedAt = record.receivedAt
  if (typeof receivedAt !== 'number' || !Number.isFinite(receivedAt) || receivedAt <= 0) {
    return null
  }
  const stateStartedAt = record.stateStartedAt
  if (
    typeof stateStartedAt !== 'number' ||
    !Number.isFinite(stateStartedAt) ||
    stateStartedAt <= 0
  ) {
    return null
  }
  // Why: connectionId is allowed to be null (local) or string (relay). Any
  // other shape is rejected so the post-merge typed surface stays honest.
  const connectionIdRaw = record.connectionId
  let connectionId: string | null
  if (connectionIdRaw === null || connectionIdRaw === undefined) {
    connectionId = null
  } else if (typeof connectionIdRaw === 'string') {
    connectionId = connectionIdRaw
  } else {
    return null
  }
  const payload = normalizeAgentStatusPayload(record.payload)
  if (!payload) {
    return null
  }
  const providerSession = normalizeAgentProviderSession(record.providerSession) ?? undefined
  const providerSessionOnly = record.providerSessionOnly === true
  if (providerSessionOnly && !isValidPiProviderSessionOnly(providerSession, payload.agentType)) {
    return null
  }
  return {
    paneKey,
    launchToken: typeof record.launchToken === 'string' ? record.launchToken : undefined,
    tabId: typeof tabId === 'string' ? tabId : undefined,
    worktreeId: typeof worktreeId === 'string' ? worktreeId : undefined,
    connectionId,
    hasExplicitPrompt: record.hasExplicitPrompt === true ? true : undefined,
    hookEventName: typeof record.hookEventName === 'string' ? record.hookEventName : undefined,
    toolUseId: typeof record.toolUseId === 'string' ? record.toolUseId : undefined,
    toolAgentId: typeof record.toolAgentId === 'string' ? record.toolAgentId : undefined,
    toolAgentType: typeof record.toolAgentType === 'string' ? record.toolAgentType : undefined,
    providerSession,
    providerSessionOnly: providerSessionOnly ? true : undefined,
    payload,
    receivedAt,
    stateStartedAt
  }
}
