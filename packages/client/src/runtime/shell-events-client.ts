import type { ShellEvent, ShellSubscriptionEvent } from '@yiru/runtime-protocol/contract'

import { callShellOrpc } from './orpc-client'
import { createRuntimeStreamFanOut, type RuntimeStreamConnectionState } from './stream-fan-out'

type ShellEventConnectionListener = (state: RuntimeStreamConnectionState) => void
type ShellEventResyncListener = () => void

const connectionListeners = new Set<ShellEventConnectionListener>()
const resyncListeners = new Set<ShellEventResyncListener>()
let connectionState: RuntimeStreamConnectionState = 'idle'
let lastSeenSeq: number | undefined
let stopBootstrap: (() => void) | null = null

const shellEventFanOut = createRuntimeStreamFanOut<void, ShellSubscriptionEvent>({
  resolveClient: () => Promise.resolve(),
  open: (_client, signal) =>
    callShellOrpc((client) => client.shell.events.subscribe, { lastSeenSeq }, { signal }),
  // Why: menu and window intent delivery must recover without a reconnect
  // stampede when the browser resumes or its transport briefly drops.
  retryDelayMs: (attempt) => {
    const exponentialMs = Math.min(30_000, 500 * 2 ** Math.min(attempt - 1, 6))
    return exponentialMs + Math.floor(Math.random() * Math.min(1_000, exponentialMs / 4))
  },
  onConnectionStateChange: (state) => {
    connectionState = state
    for (const listener of Array.from(connectionListeners)) {
      listener(state)
    }
  }
})

function observeShellSubscriptionEvent(event: ShellSubscriptionEvent): void {
  if (event.type === 'ready') {
    lastSeenSeq = event.seq
    return
  }
  if (event.type === 'resync') {
    lastSeenSeq = event.seq
    for (const listener of Array.from(resyncListeners)) {
      listener()
    }
    return
  }
  lastSeenSeq = Math.max(lastSeenSeq ?? 0, event.seq)
}

export function startShellEventStream(): void {
  stopBootstrap ??= shellEventFanOut.subscribe(observeShellSubscriptionEvent)
}

export function subscribeShellEvent(
  listener: (event: ShellEvent & { seq: number }) => void
): () => void {
  startShellEventStream()
  return shellEventFanOut.subscribe((event) => {
    if (event.type !== 'ready' && event.type !== 'resync') {
      listener(event)
    }
  })
}

export function subscribeShellEventConnection(listener: ShellEventConnectionListener): () => void {
  listener(connectionState)
  connectionListeners.add(listener)
  return () => connectionListeners.delete(listener)
}

export function subscribeShellEventResync(listener: ShellEventResyncListener): () => void {
  resyncListeners.add(listener)
  return () => resyncListeners.delete(listener)
}
