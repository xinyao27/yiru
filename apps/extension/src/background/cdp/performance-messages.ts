import { runPerformanceAudit } from './performance-audit'

type Respond = (response: unknown) => void

export function handlePerformanceAuditMessage(message: object, respond: Respond): boolean | null {
  if (Reflect.get(message, 'type') !== 'performance-audit') {
    return null
  }
  const tabId = Reflect.get(message, 'tabId')
  if (typeof tabId !== 'number' || !Number.isInteger(tabId)) {
    respond({ error: 'invalid_tab_id', ok: false })
    return false
  }
  void runPerformanceAudit(tabId).then(
    (capture) => respond({ capture, ok: true }),
    (error: unknown) =>
      respond({ error: error instanceof Error ? error.message : String(error), ok: false })
  )
  return true
}
