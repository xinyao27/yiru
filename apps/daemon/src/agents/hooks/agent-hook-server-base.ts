import { randomBytes } from 'node:crypto'
import type { createServer } from 'node:http'

import { createHookListenerState, type HookListenerState } from '~main/agents/core/hook-listener'

import type {
  EnrichedAgentHookEventPayload,
  StatusChangeListener,
  PaneStatusClearListener,
  PaneKeyAliasPersistenceListener,
  PaneKeyAliasEntry,
  AgentPromptSentDedupeEntry
} from './agent-hook-server-foundation'

export abstract class AgentHookServerBase {
  protected server: ReturnType<typeof createServer> | null = null
  protected port = 0
  protected token = ''
  // Why: identifies this Yiru instance so hook scripts can stamp requests and
  // the server can detect dev vs. prod cross-talk. Set at start() from the
  // caller's knowledge of whether this is a packaged build.
  protected env = 'production'
  protected onAgentStatus: ((payload: EnrichedAgentHookEventPayload) => void) | null = null
  protected onPaneStatusCleared: PaneStatusClearListener | null = null
  protected statusChangeListeners = new Set<StatusChangeListener>()
  // Why: directory that holds the on-disk endpoint file. Set via start()'s
  // `userDataPath` option so the listener stays independent of Electron.
  protected endpointDir: string | null = null
  protected endpointFilePathCache: string | null = null
  protected endpointFileWritten = false
  // Why: per-instance caches keep listener lifetimes isolated when hook
  // servers are replaced or restarted.
  protected state: HookListenerState = createHookListenerState()
  // Why: hydrated last-status rows are useful UI continuity, but they are not
  // evidence of live agent work in this main-process runtime.
  protected runtimeObservedStatusPaneKeys = new Set<string>()
  protected legacyPaneKeyAliases = new Map<string, PaneKeyAliasEntry>()
  protected paneKeyAliasPersistenceListener: PaneKeyAliasPersistenceListener | null = null
  // Why: full path to the on-disk last-status cache. Set in start() from
  // userDataPath. Null when the server runs without a userDataPath (e.g.
  // tests that skip the userDataPath option) — in that case, persistence is
  // a no-op and only in-memory replay applies.
  protected lastStatusFilePath: string | null = null
  // Why: trailing-edge debounce timer. Captured per-instance so multiple
  // server instances in the same process (tests) don't share state.
  protected statusPersistTimer: ReturnType<typeof setTimeout> | null = null
  protected assistantMessageRetryTimers = new Map<string, ReturnType<typeof setTimeout>>()
  protected promptSentDedupeByPaneKey = new Map<string, AgentPromptSentDedupeEntry>()
  protected promptSentHashSalt = randomBytes(16).toString('hex')
  protected closedAgentStatusTabIds = new Set<string>()
  protected closedAgentStatusPaneKeys = new Set<string>()
  // Why: identity check — skip writes when the JSON-stringified contents
  // exactly match the last successful disk write. Cheap protection against
  // re-firing trailing timers when nothing changed.
  protected lastWrittenJson: string | null = null
  protected forwardedPtyEnv: Record<string, string> = {}
  protected statusHydrated = false
}
