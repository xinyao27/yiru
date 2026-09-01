import { useEffect } from 'react'

import { getExtensionBrowserCapabilities } from '../browser-capabilities'
import { getExtensionRuntimeClient } from './session'

export function DaemonCommandBridge(): null {
  useEffect(() => {
    const controller = new AbortController()
    void consumeCommands(controller.signal)
    return () => {
      controller.abort()
    }
  }, [])
  return null
}

async function consumeCommands(signal: AbortSignal): Promise<void> {
  let afterId = 0
  while (!signal.aborted) {
    try {
      const subscription = await (
        await getExtensionRuntimeClient()
      ).workspaceEvents.subscribe({ afterId, scope: 'daemon' }, { signal })
      for await (const message of subscription) {
        if (signal.aborted) {
          return
        }
        if (message.type !== 'event') {
          continue
        }
        if (message.event.kind !== 'browser.open-tab.requested') {
          if (
            message.event.kind === 'ritual.start-day.complete' ||
            message.event.kind === 'ritual.end-day.complete'
          ) {
            const projects = await (await getExtensionRuntimeClient()).repo.list()
            await getExtensionBrowserCapabilities().applyScheduledRitual({
              eventId: message.event.id,
              kind: message.event.kind === 'ritual.start-day.complete' ? 'start-day' : 'end-day',
              projectIds: projects.repos.map((project) => project.id)
            })
          }
          afterId = message.event.id
          continue
        }
        const url = message.event.payload.url
        const projectId = message.event.payload.projectId
        if (typeof url !== 'string') {
          afterId = message.event.id
          continue
        }
        await getExtensionBrowserCapabilities().openDaemonTabCommand({
          eventId: message.event.id,
          ...(typeof projectId === 'string' ? { projectId } : {}),
          url
        })
        afterId = message.event.id
      }
    } catch {
      if (!signal.aborted) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 1_500))
      }
    }
  }
}
