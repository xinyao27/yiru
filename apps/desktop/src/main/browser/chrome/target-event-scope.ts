import type { BrowserPageCdpEvent } from '../page/handle'

export function isChromePageCdpEvent(
  event: Extract<BrowserPageCdpEvent, { type: 'message' }>,
  targetId: string,
  ownedSessionIds: ReadonlySet<string>
): boolean {
  if (event.sessionId) {
    return ownedSessionIds.has(event.sessionId)
  }
  if (!event.method.startsWith('Target.')) {
    return false
  }

  const directTargetId = readString(event.params.targetId)
  const targetInfo = isRecord(event.params.targetInfo) ? event.params.targetInfo : null
  const targetInfoId = readString(targetInfo?.targetId)
  if (directTargetId || targetInfoId) {
    return (directTargetId ?? targetInfoId) === targetId
  }

  const nestedSessionId = readString(event.params.sessionId)
  return nestedSessionId ? ownedSessionIds.has(nestedSessionId) : false
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
