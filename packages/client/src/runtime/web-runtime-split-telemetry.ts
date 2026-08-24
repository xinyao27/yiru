const WEB_RUNTIME_SPLIT_MIRROR_SUPPRESSION_TTL_MS = 30_000

const pendingMirrorTelemetry = new Map<string, Set<string>>()
let nextPendingMirrorTelemetryId = 0

export function reserveWebRuntimeSplitMirrorTelemetry(
  sourcePtyId: string,
  direction: 'horizontal' | 'vertical'
): () => void {
  const id = String(++nextPendingMirrorTelemetryId)
  const key = mirrorTelemetryKey(sourcePtyId, direction)
  const ids = pendingMirrorTelemetry.get(key) ?? new Set<string>()
  ids.add(id)
  pendingMirrorTelemetry.set(key, ids)
  let released = false
  const release = (): void => {
    if (released) {
      return
    }
    released = true
    releasePendingMirrorTelemetry(sourcePtyId, direction, id)
  }
  const timeout = globalThis.setTimeout(release, WEB_RUNTIME_SPLIT_MIRROR_SUPPRESSION_TTL_MS)
  return () => {
    globalThis.clearTimeout(timeout)
    release()
  }
}

export function consumePendingWebRuntimeSplitMirrorTelemetry(
  sourcePtyId: string | null | undefined,
  direction: 'horizontal' | 'vertical'
): boolean {
  if (!sourcePtyId) {
    return false
  }
  const key = mirrorTelemetryKey(sourcePtyId, direction)
  const ids = pendingMirrorTelemetry.get(key)
  const id = ids?.values().next().value
  if (!ids || !id) {
    return false
  }
  ids.delete(id)
  if (ids.size === 0) {
    pendingMirrorTelemetry.delete(key)
  }
  return true
}

function releasePendingMirrorTelemetry(
  sourcePtyId: string,
  direction: 'horizontal' | 'vertical',
  id: string
): void {
  const key = mirrorTelemetryKey(sourcePtyId, direction)
  const ids = pendingMirrorTelemetry.get(key)
  if (!ids) {
    return
  }
  ids.delete(id)
  if (ids.size === 0) {
    pendingMirrorTelemetry.delete(key)
  }
}

function mirrorTelemetryKey(sourcePtyId: string, direction: 'horizontal' | 'vertical'): string {
  return `${direction}:${sourcePtyId}`
}
