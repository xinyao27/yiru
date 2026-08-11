import type {
  SequencedShellEvent,
  ShellEvent,
  ShellEventsSubscribeInput,
  ShellSubscriptionEvent
} from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../runtime/rpc/core'
import { readShellWindowUiState } from './ui'

const MAX_PENDING_SHELL_EVENTS = 64
const MAX_REPLAY_SHELL_EVENTS = 128

type ShellEventListener = (event: SequencedShellEvent) => void

type WindowShellEventState = {
  nextSeq: number
  listeners: Set<ShellEventListener>
  pending: SequencedShellEvent[]
  replay: SequencedShellEvent[]
}

const windowStates = new Map<number, WindowShellEventState>()

function getWindowState(webContentsId: number): WindowShellEventState {
  const existing = windowStates.get(webContentsId)
  if (existing) {
    return existing
  }
  const created: WindowShellEventState = {
    nextSeq: 1,
    listeners: new Set(),
    pending: [],
    replay: []
  }
  windowStates.set(webContentsId, created)
  return created
}

function appendBounded<T>(values: T[], value: T, limit: number): void {
  values.push(value)
  if (values.length > limit) {
    values.splice(0, values.length - limit)
  }
}

export function publishShellEvent(webContentsId: number, event: ShellEvent): void {
  const state = getWindowState(webContentsId)
  const sequenced = { ...event, seq: state.nextSeq++ } satisfies SequencedShellEvent
  appendBounded(state.replay, sequenced, MAX_REPLAY_SHELL_EVENTS)
  if (state.listeners.size === 0) {
    appendBounded(state.pending, sequenced, MAX_PENDING_SHELL_EVENTS)
    return
  }
  for (const listener of Array.from(state.listeners)) {
    listener(sequenced)
  }
}

export async function handleShellEventsSubscribe(
  input: ShellEventsSubscribeInput,
  context: RpcContext,
  emit: (event: ShellSubscriptionEvent) => void
): Promise<void> {
  const webContentsId = context.renderingWebContentsId
  if (webContentsId === undefined) {
    throw new Error('unavailable_on_host: shell event stream requires an Electron window')
  }
  const state = getWindowState(webContentsId)
  const currentSeq = state.nextSeq - 1
  const lastSeenSeq = input.lastSeenSeq
  const oldestReplaySeq = state.replay[0]?.seq
  const shouldResync =
    lastSeenSeq !== undefined &&
    lastSeenSeq < currentSeq &&
    (oldestReplaySeq === undefined || oldestReplaySeq > lastSeenSeq + 1)
  const initialEvents =
    lastSeenSeq === undefined
      ? state.pending.splice(0)
      : state.replay.filter((event) => event.seq > lastSeenSeq)

  await new Promise<void>((resolve) => {
    let isClosed = false
    const close = (): void => {
      if (isClosed) {
        return
      }
      isClosed = true
      context.signal?.removeEventListener('abort', close)
      state.listeners.delete(listener)
      resolve()
    }
    const listener: ShellEventListener = (event) => emit(event)
    state.listeners.add(listener)
    context.signal?.addEventListener('abort', close, { once: true })
    emit({ type: 'ready', seq: currentSeq })
    if (shouldResync) {
      emit({ type: 'resync', seq: currentSeq })
      const uiState = readShellWindowUiState(webContentsId)
      if (uiState) {
        publishShellEvent(webContentsId, {
          type: 'uiMaximizeChanged',
          isMaximized: uiState.isMaximized
        })
        publishShellEvent(webContentsId, {
          type: 'uiFullscreenChanged',
          isFullScreen: uiState.isFullScreen
        })
      }
    }
    for (const event of initialEvents) {
      emit(event)
    }
    if (context.signal?.aborted) {
      close()
    }
  })
}
