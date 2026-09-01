import { focusOrCreatePage, focusOrCreateWorkspace } from './workspace-navigation'

type Respond = (response: unknown) => void

export function handleRitualNavigationMessage(message: object, respond: Respond): boolean | null {
  const type = Reflect.get(message, 'type')
  if (
    type !== 'ritual-start-layout' &&
    type !== 'ritual-end-layout' &&
    type !== 'scheduled-ritual'
  ) {
    return null
  }
  if (type === 'scheduled-ritual') {
    const scheduled = parseScheduledRitual(message)
    if (!scheduled) {
      respond({ error: 'invalid_scheduled_ritual', ok: false })
      return false
    }
    void runScheduledRitual(scheduled).then(
      () => respond({ ok: true }),
      (error: unknown) =>
        respond({ error: error instanceof Error ? error.message : String(error), ok: false })
    )
    return true
  }
  const task =
    type === 'ritual-start-layout'
      ? openProjectWorkspaces(parseProjectIds(Reflect.get(message, 'projectIds')))
      : collapseProjectWorkspaces()
  void task.then(
    () => respond({ ok: true }),
    (error: unknown) =>
      respond({ error: error instanceof Error ? error.message : String(error), ok: false })
  )
  return true
}

async function runScheduledRitual(input: {
  eventId: number
  kind: 'end-day' | 'start-day'
  projectIds: string[]
}): Promise<void> {
  const stored: unknown = await chrome.storage.local.get('lastScheduledRitualEventId')
  const lastSeen =
    typeof stored === 'object' &&
    stored !== null &&
    typeof Reflect.get(stored, 'lastScheduledRitualEventId') === 'number'
      ? Reflect.get(stored, 'lastScheduledRitualEventId')
      : 0
  if (input.eventId <= lastSeen) {
    return
  }
  await (input.kind === 'start-day'
    ? openProjectWorkspaces(input.projectIds)
    : collapseProjectWorkspaces())
  await chrome.storage.local.set({ lastScheduledRitualEventId: input.eventId })
}

async function openProjectWorkspaces(projectIds: string[]): Promise<void> {
  for (const projectId of projectIds) {
    await focusOrCreateWorkspace({ projectId })
  }
}

async function collapseProjectWorkspaces(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: `${chrome.runtime.getURL('workspace.html')}*` })
  const groupIds = new Set(tabs.flatMap((tab) => (tab.groupId >= 0 ? [tab.groupId] : [])))
  for (const groupId of groupIds) {
    await chrome.tabGroups.update(groupId, { collapsed: true })
  }
  await focusOrCreatePage('activity')
}

function parseProjectIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error('invalid_ritual_projects')
  }
  return value.filter((entry) => entry.length > 0)
}

function parseScheduledRitual(value: object): {
  eventId: number
  kind: 'end-day' | 'start-day'
  projectIds: string[]
} | null {
  const eventId = Reflect.get(value, 'eventId')
  const kind = Reflect.get(value, 'kind')
  try {
    return typeof eventId === 'number' &&
      Number.isSafeInteger(eventId) &&
      eventId > 0 &&
      (kind === 'start-day' || kind === 'end-day')
      ? { eventId, kind, projectIds: parseProjectIds(Reflect.get(value, 'projectIds')) }
      : null
  } catch {
    return null
  }
}
