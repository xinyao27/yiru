import { useAppStore } from '~renderer/store/state'

import {
  isAgentTaskCompleteOsNotificationEnabledFromState,
  isAgentTaskCompleteTrackingEnabledFromState
} from '../agent/task-complete-policy'

export function isAgentTaskCompleteNotificationEnabled(): boolean {
  return isAgentTaskCompleteOsNotificationEnabledFromState(useAppStore.getState())
}

export function isAgentTaskCompleteTrackingEnabled(): boolean {
  return isAgentTaskCompleteTrackingEnabledFromState(useAppStore.getState())
}

const listeners = new Set<() => void>()
let unsubscribe: (() => void) | null = null
let settingsSnapshot: string | null = null

function getSettingsSnapshot(state: ReturnType<typeof useAppStore.getState>): string {
  return `${isAgentTaskCompleteTrackingEnabledFromState(state)}:${isAgentTaskCompleteOsNotificationEnabledFromState(state)}`
}

export function subscribeAgentTaskCompleteTrackingEnabled(listener: () => void): () => void {
  if (unsubscribe === null) {
    settingsSnapshot = getSettingsSnapshot(useAppStore.getState())
    unsubscribe = useAppStore.subscribe((state) => {
      const snapshot = getSettingsSnapshot(state)
      if (snapshot === settingsSnapshot) {
        return
      }
      settingsSnapshot = snapshot
      for (const subscriber of Array.from(listeners)) {
        subscriber()
      }
    })
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && unsubscribe !== null) {
      unsubscribe()
      unsubscribe = null
      settingsSnapshot = null
    }
  }
}
