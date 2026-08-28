import { focusOrCreateExternalUrl } from './workspace-navigation'

type Respond = (response: unknown) => void

export function handleTabCommandMessage(message: object, respond: Respond): boolean | null {
  if (Reflect.get(message, 'type') !== 'daemon-open-tab') {
    return null
  }
  const eventId = Reflect.get(message, 'eventId')
  const url = Reflect.get(message, 'url')
  const projectId = Reflect.get(message, 'projectId')
  if (
    typeof eventId !== 'number' ||
    !Number.isSafeInteger(eventId) ||
    eventId < 1 ||
    typeof url !== 'string' ||
    (projectId !== undefined && typeof projectId !== 'string')
  ) {
    respond({ error: 'invalid_tab_command', ok: false })
    return false
  }
  void runCommand({ eventId, ...(typeof projectId === 'string' ? { projectId } : {}), url }).then(
    () => respond({ ok: true }),
    (error: unknown) =>
      respond({ error: error instanceof Error ? error.message : String(error), ok: false })
  )
  return true
}

async function runCommand(input: {
  eventId: number
  projectId?: string
  url: string
}): Promise<void> {
  const stored: unknown = await chrome.storage.local.get('lastBrowserCommandEventId')
  const lastSeen =
    typeof stored === 'object' &&
    stored !== null &&
    typeof Reflect.get(stored, 'lastBrowserCommandEventId') === 'number'
      ? Reflect.get(stored, 'lastBrowserCommandEventId')
      : 0
  if (input.eventId <= lastSeen) {
    return
  }
  await focusOrCreateExternalUrl(input.url, input.projectId)
  await chrome.storage.local.set({ lastBrowserCommandEventId: input.eventId })
}
