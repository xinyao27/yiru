import type { RuntimeHostProgressEvent } from '@yiru/runtime-protocol/contract'

import { createRuntimeOrpcClient, type RuntimeClientTarget } from './orpc-client'
import { targetKey } from './query-target'
import { createRuntimeStreamFanOut } from './stream-fan-out'

const LOCAL_TARGET = { kind: 'local' } as const satisfies RuntimeClientTarget
const hostProgressEventsByTarget = new Map<string, ReturnType<typeof createHostProgressEvents>>()

function createHostProgressEvents(target: RuntimeClientTarget) {
  return createRuntimeStreamFanOut({
    resolveClient: () => createRuntimeOrpcClient(target),
    open: (connection, signal) =>
      connection.client.runtime.progressEvents.subscribe(undefined, { signal }),
    releaseClient: (connection) => connection.close()
  })
}

function hostProgressEvents(target: RuntimeClientTarget) {
  const key = targetKey(target)
  const existing = hostProgressEventsByTarget.get(key)
  if (existing) {
    return existing
  }
  const created = createHostProgressEvents(target)
  hostProgressEventsByTarget.set(key, created)
  return created
}

export function onHostProgressEvent<TType extends RuntimeHostProgressEvent['type']>(
  target: RuntimeClientTarget,
  type: TType,
  callback: (event: Extract<RuntimeHostProgressEvent, { type: TType }>) => void
): () => void {
  return hostProgressEvents(target).subscribe((event) => {
    if (event.type === type) {
      callback(event as Extract<RuntimeHostProgressEvent, { type: TType }>)
    }
  })
}

export function onLocalHostProgressEvent<TType extends RuntimeHostProgressEvent['type']>(
  type: TType,
  callback: (event: Extract<RuntimeHostProgressEvent, { type: TType }>) => void
): () => void {
  return onHostProgressEvent(LOCAL_TARGET, type, callback)
}
