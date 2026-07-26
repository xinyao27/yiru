import { applyAppend, createNativeChatMerger, replaceList } from '@yiru/workbench-model/agent'
import {
  NATIVE_CHAT_SOURCE_PRIORITY,
  type AgentType,
  type NativeChatMessage,
  type NativeChatSession
} from '@yiru/workbench-model/agent'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { getVerifiedNativeChatCommands } from '../../../../shared/native-chat/agent-profiles'
import { surfaceSkillInvocationUserTurns } from '../../../../shared/native-chat/command-envelope'
import { useAppStore } from '../../store'
import {
  applyAppends,
  createIncrementalAssembler,
  reset as resetAssembler,
  sharesPrefix
} from './incremental-assembler'
import {
  deriveNativeChatEffectiveReadState,
  nativeChatSourceGeneration,
  notFoundRetryDelayMs,
  NOTFOUND_RETRY_WINDOW_MS,
  type NativeChatStoredReadState
} from './live-session-generation'
import { mergeNativeChatLiveSession } from './live-status'
import {
  hasMoreNativeChatHistory,
  NATIVE_CHAT_INITIAL_LIMIT,
  nextNativeChatLimit
} from './pagination'
import {
  getNativeChatSessionTransport,
  nextNativeChatSubscriptionId,
  resolveNativeChatUnsubscribe
} from './session/transport'
import { useNativeChatCompletionRefresh } from './use-native-chat-completion-refresh'

export type UseNativeChatLiveSessionArgs = {
  /** Composite `${tabId}:${leafId}` key — selects the live hook entry. */
  paneKey: string
  agent: AgentType
  /** The agent's own session id, or null before the agent has reported one.
   *  With null there is nothing to read/tail; the view shows live hook state. */
  sessionId: string | null
  /** Authoritative transcript path from the hook (providerSession), preferred
   *  over reconstructing the path from sessionId. Null when not reported. */
  transcriptPath?: string | null
  /** Runtime owner of the pane (Model B). Non-null routes read/subscribe to the
   *  remote runtime host; null/undefined keeps the local IPC path. */
  runtimeEnvironmentId?: string | null
}

/** A live session plus the older-history pagination controls the view needs. */
export type NativeChatLiveSession = NativeChatSession & {
  /** True when an older page may still exist (the last read filled the window). */
  hasMore: boolean
  /** Whether an older-history page is currently loading. */
  loadingEarlier: boolean
  /** Grow the read window to page in older history (scrolled-to-top trigger). */
  loadEarlier: () => void
}

// Stable empty-base reference so a non-ready read doesn't churn the base axis.
const EMPTY_MESSAGES: readonly NativeChatMessage[] = []

/**
 * Renderer hook that streams a NativeChatSession for a pane: initial windowed
 * read via `nativeChat.readSession`, live tail via `nativeChat.subscribe`, merged
 * with the pane's live hook turn-state. IO + store reads live here; the merge
 * itself stays pure (mergeNativeChatLiveSession → assembleNativeChatSession).
 *
 * Pagination: the read is windowed to the most recent `limit` turns (default
 * NATIVE_CHAT_INITIAL_LIMIT). `loadEarlier` raises the limit by a page and
 * re-reads to prepend older history; `hasMore` reflects whether the last read
 * filled the window. Read results replace the base list (they are an ordered
 * tail), while live appends accumulate separately so a re-read never drops them.
 *
 * Transport: IO goes through a per-owner session transport selected by
 * getNativeChatSessionTransport. A runtime-owned pane (Model B) reads/tails the
 * REMOTE runtime host via the runtime RPCs; local- and ssh-owned panes keep the
 * local IPC path. The transport preserves the NativeChatApi read/subscribe shape,
 * so everything below (merge, assembler, pagination) is unchanged.
 *
 * Teardown: the subscription is closed on unmount and whenever the owner, agent,
 * or sessionId change, so a toggle back to terminal, a session swap, or an
 * owner-flip never leaks a watcher (remote or local).
 *
 * Staleness: read/appended/hasMore are tagged with the source generation
 * (agent+session+path+owner, see live-session-generation.ts) they were
 * written for. The visible values (`effective` below) mask out a mismatched
 * generation at render time, so a pane/session swap never paints a stale
 * conversation for the one render before the effect re-subscribes.
 */
export function useNativeChatLiveSession(
  args: UseNativeChatLiveSessionArgs
): NativeChatLiveSession {
  const { paneKey, agent, sessionId, transcriptPath, runtimeEnvironmentId } = args
  // Stable per owner id, so a re-render without an owner flip keeps the same
  // transport identity and doesn't re-subscribe.
  const transport = useMemo(
    () => getNativeChatSessionTransport(runtimeEnvironmentId ?? null),
    [runtimeEnvironmentId]
  )
  const sourceGeneration = nativeChatSourceGeneration(args)
  const [read, setRead] = useState<NativeChatStoredReadState>({
    phase: 'loading',
    generation: sourceGeneration
  })
  const [hasMore, setHasMore] = useState(false)
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  // Why: a stale `true` from an abandoned loadEarlier request (its own
  // `.finally()` below only clears it while the epoch still matches) must not
  // survive into the next generation, so this forgets it on any generation
  // change — a legitimate render-time reset since `false` is the final answer,
  // not a placeholder waiting on more async work.
  const [prevSourceGeneration, setPrevSourceGeneration] = useState(sourceGeneration)
  if (prevSourceGeneration !== sourceGeneration) {
    setPrevSourceGeneration(sourceGeneration)
    setLoadingEarlier(false)
  }
  // The active read window; raised by loadEarlier to page in older history.
  const limitRef = useRef(NATIVE_CHAT_INITIAL_LIMIT)

  // Appended messages accumulate separately from the initial snapshot so pagination
  // (session change or load-earlier) doesn't lose in-flight appends mid-swap;
  // they reset with the same effect that re-subscribes. Live frames merge by id
  // (re-emitted ids replace in place, no unbounded concat) and the bucket is
  // capped to the read window so a long run can't grow it without limit (#6).
  const [appended, setAppended] = useState<NativeChatMessage[]>([])
  // Stateful id-dedup merger backing `appended`; caches the id→index map so each
  // live frame costs O(incoming), not O(existing) (#18 parity for desktop).
  const appendMergerRef = useRef(createNativeChatMerger(NATIVE_CHAT_SOURCE_PRIORITY))

  // Live hook state for this pane, selected narrowly so unrelated status churn
  // doesn't re-render the chat view.
  const hookState = useAppStore((s) => s.agentStatusByPaneKey[paneKey]?.state ?? null)
  // When that state began (epoch ms). A separate primitive selector so it doesn't
  // churn renders; lets a stale 'working' self-heal once this turn's reply lands.
  const hookStateStartedAt = useAppStore(
    (s) => s.agentStatusByPaneKey[paneKey]?.stateStartedAt ?? null
  )

  const latestSessionId = useRef<string | null>(sessionId)
  latestSessionId.current = sessionId
  // Tracks the current owner's transport so a load-earlier resolve from a prior
  // host is discarded after an owner flip (the session id can stay the same).
  const latestTransport = useRef(transport)
  latestTransport.current = transport
  // Why: `applyCompletionRefresh` below has empty deps (a stable identity keeps
  // its own subscription from resubscribing), so it tags its write by reading
  // the generation through this ref instead of closing over it directly.
  const latestSourceGeneration = useRef(sourceGeneration)
  latestSourceGeneration.current = sourceGeneration
  const transcriptEpochRef = useRef(0)

  // Incremental assembler: reset on the base axis (session/agent/read swap),
  // applyAppends on the hot append axis. `appliedTranscriptRef` is the exact
  // array last fed; a pure suffix-extension takes the fast append path, anything
  // else forces a reset so the cache never drifts from a full rebuild (#17).
  const assemblerRef = useRef(createIncrementalAssembler())
  const appliedTranscriptRef = useRef<readonly NativeChatMessage[]>([])
  const baseSigRef = useRef<string | null>(null)
  const baseMessagesRef = useRef<readonly NativeChatMessage[]>(EMPTY_MESSAGES)

  useEffect(() => {
    // Why: agent/path/owner rebinds can keep the same session and transport;
    // every source generation must invalidate pagination captured before it.
    transcriptEpochRef.current += 1
    if (!sessionId) {
      // No session id yet: nothing to read or tail. `effective` below shows
      // live hook state on an empty transcript regardless of what a previous
      // generation's read/appended/hasMore still hold; it backfills once the
      // id arrives (effect re-runs).
      replaceList(appendMergerRef.current, [])
      return
    }

    let cancelled = false
    // Set by the first authoritative snapshot/replacement frame so the
    // independent readSession seed below can never clobber a live snapshot.
    let frameArrived = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    const retryStartedAt = Date.now()
    // Re-bound as a plain const: TS doesn't retain the `!sessionId` narrowing
    // above inside a nested function declaration (it's hoisted, so the
    // narrowing can't be proven to hold at every call site).
    const activeSessionId = sessionId
    limitRef.current = NATIVE_CHAT_INITIAL_LIMIT
    replaceList(appendMergerRef.current, [])

    // Independent initial seed: the subscribe stream normally delivers the first
    // snapshot, but a persistent initial-drain error, or an older runtime whose
    // subscribe only wires onAppend, would otherwise strand the view at 'loading'
    // forever. Apply this only while no authoritative frame has landed yet, so a
    // live snapshot always wins and a late seed never repaints it.
    function loadSession(attempt: number): void {
      if (frameArrived) {
        return
      }
      void transport
        .readSession(agent, activeSessionId, limitRef.current, transcriptPath ?? undefined)
        .then((result) => {
          if (cancelled || frameArrived) {
            return
          }
          if (result && 'error' in result) {
            // A not-yet-flushed transcript: stay in 'loading' and retry with
            // backoff instead of settling into a permanent error (#8401).
            if (result.notFound && Date.now() - retryStartedAt < NOTFOUND_RETRY_WINDOW_MS) {
              retryTimer = setTimeout(() => {
                retryTimer = null
                loadSession(attempt + 1)
              }, notFoundRetryDelayMs(attempt))
              return
            }
            setRead({ phase: 'error', error: result.error, generation: sourceGeneration })
            return
          }
          const messages = result?.messages ?? []
          setRead({ phase: 'ready', messages, generation: sourceGeneration })
          setHasMore(hasMoreNativeChatHistory(messages.length, limitRef.current))
        })
        .catch((err: unknown) => {
          if (!cancelled && !frameArrived) {
            setRead({
              phase: 'error',
              error: err instanceof Error ? err.message : String(err),
              generation: sourceGeneration
            })
          }
        })
    }

    loadSession(0)

    const subscriptionId = nextNativeChatSubscriptionId()
    const unsubscribe = transport.subscribe(
      {
        subscriptionId,
        agent,
        sessionId,
        transcriptPath: transcriptPath ?? undefined,
        limit: limitRef.current
      },
      (frame) => {
        if (!cancelled) {
          if (frame.type === 'snapshot' || frame.type === 'replacement') {
            // Why: reconnect snapshots and inode replacements are both
            // authoritative generations; older pagination must not repaint them.
            frameArrived = true
            transcriptEpochRef.current += 1
            if ('error' in frame && frame.error) {
              setRead({ phase: 'error', error: frame.error, generation: sourceGeneration })
              return
            }
            replaceList(appendMergerRef.current, frame.messages)
            setAppended([])
            setRead({
              phase: 'ready',
              messages: appendMergerRef.current.list,
              generation: sourceGeneration
            })
            setHasMore(frame.hasMore)
            return
          }
          // Merge by id (re-emits replace in place) then bound to the window so
          // the bucket can't grow without limit. The base read still holds older
          // turns, and the assembler re-dedups the concat, so trimming the recent
          // append tail can't drop a turn the base window still covers (#6).
          setAppended(applyAppend(appendMergerRef.current, frame.messages, limitRef.current))
        }
      }
    )

    return () => {
      cancelled = true
      // Why: this closure is discarded right after teardown runs, so clearing
      // just the timer (not also nulling the ref) is enough — nothing reads
      // `retryTimer` again.
      if (retryTimer) {
        clearTimeout(retryTimer)
      }
      resolveNativeChatUnsubscribe(unsubscribe)
    }
    // `transport` identity changes on an owner flip, re-running this effect to
    // tear down the old host's subscription and open one against the new host.
    // sourceGeneration is fully derived from the deps already listed here (plus
    // runtimeEnvironmentId, which transport already tracks 1:1).
  }, [agent, sessionId, transcriptPath, transport, sourceGeneration])

  const applyCompletionRefresh = useCallback((messages: NativeChatMessage[]) => {
    transcriptEpochRef.current += 1
    setLoadingEarlier(false)
    replaceList(appendMergerRef.current, [])
    setAppended([])
    setRead({ phase: 'ready', messages, generation: latestSourceGeneration.current })
    setHasMore(hasMoreNativeChatHistory(messages.length, limitRef.current))
  }, [])
  useNativeChatCompletionRefresh({
    agent,
    sessionId,
    transcriptPath,
    transport,
    state: hookState,
    stateStartedAt: hookStateStartedAt,
    limit: limitRef.current,
    onMessages: applyCompletionRefresh
  })

  const effective = deriveNativeChatEffectiveReadState(sessionId, sourceGeneration, {
    read,
    appended,
    hasMore
  })

  const loadEarlier = useCallback(() => {
    if (!sessionId || loadingEarlier || !effective.hasMore || effective.read.phase !== 'ready') {
      return
    }
    const nextLimit = nextNativeChatLimit(limitRef.current)
    const requestEpoch = transcriptEpochRef.current
    setLoadingEarlier(true)
    void transport
      .readSession(agent, sessionId, nextLimit, transcriptPath ?? undefined)
      .then((result) => {
        // Ignore a stale resolve from a session that swapped OR an owner that
        // flipped underneath us — either would paint the wrong host's history.
        if (
          latestSessionId.current !== sessionId ||
          latestTransport.current !== transport ||
          transcriptEpochRef.current !== requestEpoch
        ) {
          return
        }
        if (!result || 'error' in result) {
          return
        }
        limitRef.current = nextLimit
        // Read results are an ordered tail — replace the base list so the older
        // page prepends in order; live appends stay in their separate bucket.
        setRead({ phase: 'ready', messages: result.messages, generation: sourceGeneration })
        setHasMore(hasMoreNativeChatHistory(result.messages.length, nextLimit))
      })
      .catch(() => {
        // Swallow a rejected earlier-page read (the IPC-backed call can reject):
        // it's a "load more" action, so failing should leave the already-loaded
        // transcript intact rather than surface an unhandled rejection.
      })
      .finally(() => {
        // Always clear the loading flag — even after a session swap — so a stale
        // resolve can't leave loadingEarlier stuck true on the new session. Only
        // APPLYING the result above is gated on the session-id match.
        if (transcriptEpochRef.current === requestEpoch) {
          setLoadingEarlier(false)
        }
      })
  }, [
    agent,
    sessionId,
    transcriptPath,
    transport,
    sourceGeneration,
    loadingEarlier,
    effective.hasMore,
    effective.read.phase
  ])

  // Assembled messages reuse the incremental assembler across appends. Computed
  // outside the status memo: hookState changes only the status override, not the
  // message set, so hook churn never re-runs the assembler (perf note in design).
  const baseMessages = effective.read.phase === 'ready' ? effective.read.messages : EMPTY_MESSAGES
  const assembledMessages = useMemo(() => {
    const transcript =
      effective.appended.length > 0
        ? [...baseMessages, ...effective.appended]
        : (baseMessages as NativeChatMessage[])
    // Base axis: the read's message array reference changes on session swap and
    // loadEarlier; sessionId/agent identify the conversation. Any change forces a
    // full reset so a missed trigger can't leave the cache stale.
    const baseSig = `${agent}::${sessionId ?? ''}`
    const baseChanged = baseSig !== baseSigRef.current || baseMessages !== baseMessagesRef.current
    const applied = appliedTranscriptRef.current
    const isSuffixExtension =
      !baseChanged &&
      transcript.length >= applied.length &&
      sharesPrefix(transcript, applied, applied.length)

    let out: NativeChatMessage[]
    if (isSuffixExtension && transcript.length > applied.length) {
      out = applyAppends(assemblerRef.current, transcript.slice(applied.length))
    } else if (isSuffixExtension) {
      out = assemblerRef.current.messages
    } else {
      out = resetAssembler(assemblerRef.current, transcript)
    }
    baseSigRef.current = baseSig
    baseMessagesRef.current = baseMessages
    appliedTranscriptRef.current = transcript
    return out
    // baseMessages + appended are the only message-set inputs; sessionId/agent
    // gate the base-axis reset. hookState is intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseMessages, effective.appended, sessionId, agent])

  // Why: Claude-family harnesses record slash inputs as command envelopes,
  // which the noise filter hides. A skill invocation is the user's chat turn,
  // so surface it before pending-echo pruning; catalog commands keep their marker.
  const surfacedMessages = useMemo(
    () =>
      surfaceSkillInvocationUserTurns(
        assembledMessages,
        new Set(getVerifiedNativeChatCommands(agent).map((command) => command.name))
      ),
    [assembledMessages, agent]
  )

  return useMemo<NativeChatLiveSession>(() => {
    const session = mergeNativeChatLiveSession({
      sources: { transcript: surfacedMessages },
      sessionId,
      agent,
      hookState,
      stateStartedAt: hookStateStartedAt,
      // Why: a watcher append (fix for #8401) can land content while the read is
      // still retrying ('loading') or after it settled into 'error' — in both
      // cases showing the live content beats a spinner or a stale error, so each
      // override only applies while there is nothing appended to render.
      loading: effective.read.phase === 'loading' && effective.appended.length === 0,
      ...(effective.read.phase === 'error' && effective.appended.length === 0
        ? { error: effective.read.error }
        : {})
    })
    return { ...session, hasMore: effective.hasMore, loadingEarlier, loadEarlier }
  }, [
    // Why: depend on effective's fields, not the wrapper object itself —
    // deriveNativeChatEffectiveReadState's call site above builds a fresh `raw`
    // literal every render, so depending on the wrapper would defeat memoization.
    surfacedMessages,
    effective.read,
    effective.appended,
    effective.hasMore,
    sessionId,
    agent,
    hookState,
    hookStateStartedAt,
    loadingEarlier,
    loadEarlier
  ])
}
