// Pure helpers for `use-native-chat-live-session.ts`: the read/appended/hasMore
// masking, and the notFound retry backoff schedule. Split out (rather than
// inlined) so that hook stays under budget and these pure-data pieces read as
// their own seam, separate from the hook's IO/effect orchestration.

import type { NativeChatMessage } from '@yiru/workbench-model/agent'

export type NativeChatReadState =
  | { phase: 'loading' }
  | { phase: 'ready'; messages: NativeChatMessage[] }
  | { phase: 'error'; error: string }

// Why: the raw read state is tagged with the source generation it was fetched
// for, so a stale generation's data can be masked at render time instead of
// cleared via a synchronous effect setState (see deriveNativeChatEffectiveReadState).
export type NativeChatStoredReadState = NativeChatReadState & { generation: string }

const EMPTY_MESSAGES: readonly NativeChatMessage[] = []
const LOADING_READ_STATE: NativeChatReadState = { phase: 'loading' }
const EMPTY_READY_READ_STATE: NativeChatReadState = { phase: 'ready', messages: [] }

const GENERATION_FIELD_SEPARATOR = '::'

type SourceGenerationArgs = {
  agent: string
  sessionId: string | null
  transcriptPath?: string | null
  runtimeEnvironmentId?: string | null
}

/** Identifies a fetch/subscribe "generation": agent + session + transcript
 *  path + runtime owner. Recomputed every render (cheap) so a stale
 *  generation's data can be masked immediately, even the render before the
 *  effect that starts the new generation's fetch runs. */
export function nativeChatSourceGeneration(args: SourceGenerationArgs): string {
  return [
    args.agent,
    args.sessionId ?? '',
    args.transcriptPath ?? '',
    args.runtimeEnvironmentId ?? ''
  ].join(GENERATION_FIELD_SEPARATOR)
}

// Why: a brand-new session's transcript can take seconds to minutes to appear
// on disk (#8401), so a `notFound` miss retries — 1s/2s/4s/8s then every 10s —
// until the window below elapses.
const NOTFOUND_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000]
const NOTFOUND_RETRY_FIXED_DELAY_MS = 10_000
export const NOTFOUND_RETRY_WINDOW_MS = 60_000

export function notFoundRetryDelayMs(attempt: number): number {
  return NOTFOUND_RETRY_DELAYS_MS[attempt] ?? NOTFOUND_RETRY_FIXED_DELAY_MS
}

export type NativeChatEffectiveReadState = {
  read: NativeChatReadState
  appended: readonly NativeChatMessage[]
  hasMore: boolean
}

/**
 * Masks out a previous generation's read/appended/hasMore so a pane/session/
 * path/owner swap never paints a stale conversation while the new
 * generation's fetch is still in flight. The raw state is trusted again the
 * instant a real write (already async - a .then()/subscribe frame) tags
 * itself with the current generation, so this never needs a synchronous reset.
 */
export function deriveNativeChatEffectiveReadState(
  sessionId: string | null,
  sourceGeneration: string,
  raw: { read: NativeChatStoredReadState; appended: NativeChatMessage[]; hasMore: boolean }
): NativeChatEffectiveReadState {
  if (sessionId === null) {
    return { read: EMPTY_READY_READ_STATE, appended: EMPTY_MESSAGES, hasMore: false }
  }
  if (raw.read.generation !== sourceGeneration) {
    return { read: LOADING_READ_STATE, appended: EMPTY_MESSAGES, hasMore: false }
  }
  return raw
}
