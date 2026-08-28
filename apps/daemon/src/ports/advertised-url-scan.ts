import type {
  AdvertisedUrlChangeEvent,
  AdvertisedUrlListenerObservation,
  ListenerScanState
} from './advertised-url-types'

export function advertisedUrlCacheKey(worktreeId: string, port: number): string {
  return `${worktreeId}::${port}`
}

export function worktreeIdFromAdvertisedUrlCacheKey(key: string, port: number): string {
  const suffix = `::${port}`
  return key.endsWith(suffix) ? key.slice(0, -suffix.length) : key
}

export function observedListenersByPort(
  observations: readonly AdvertisedUrlListenerObservation[]
): Map<number, number | undefined> {
  const observed = new Map<number, number | undefined>()
  for (const observation of observations) {
    const existing = observed.get(observation.port)
    if (!observed.has(observation.port)) {
      observed.set(observation.port, observation.pid)
    } else if (existing !== observation.pid) {
      // Multiple host-specific listeners make PID attribution ambiguous.
      observed.set(observation.port, undefined)
    }
  }
  return observed
}

export function listenerScanStateChanged(
  previous: ListenerScanState,
  current: ListenerScanState
): boolean {
  if (previous.kind !== current.kind) {
    return true
  }
  if (previous.kind === 'absent' || current.kind === 'absent') {
    return false
  }
  return previous.pid !== undefined && current.pid !== undefined && previous.pid !== current.pid
}

export function dedupeAdvertisedUrlChanges(
  events: readonly AdvertisedUrlChangeEvent[]
): AdvertisedUrlChangeEvent[] {
  const seen = new Set<string>()
  return events.filter((event) => {
    const key = advertisedUrlCacheKey(event.worktreeId, event.port)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}
