import type { GlobalSettings, PersistedState } from '@yiru/runtime-protocol/workbench/types'
import type { PersistedStateNotifications } from '~main/persisted-state/notifications'
import { applyPersistedSettingsUpdate } from '~main/persisted-state/persisted-settings-mutations'

import { PersistenceSlice, type PersistenceRuntime, type StoreMethodLookup } from '../slice'

export class SettingsSlice extends PersistenceSlice {
  private readonly notifications: PersistedStateNotifications

  constructor(
    runtime: PersistenceRuntime,
    lookupStoreMethod: StoreMethodLookup,
    notifications: PersistedStateNotifications
  ) {
    super(runtime, lookupStoreMethod)
    this.notifications = notifications
  }

  getSettings(): GlobalSettings {
    return this.state.settings
  }

  onSettingsChanged(
    listener: (
      updates: Partial<GlobalSettings>,
      settings: GlobalSettings,
      originClientId?: number
    ) => void
  ): () => void {
    return this.notifications.onSettingsChanged(listener)
  }

  // Why: Chrome and iOS write one UI view-state and both need immediate updates.
  onUIChanged(listener: (ui: PersistedState['ui']) => void): () => void {
    return this.notifications.onUiChanged(listener)
  }

  updateSettings(
    updates: Partial<GlobalSettings>,
    options: { notifyListeners?: boolean; originClientId?: number } = {}
  ): GlobalSettings {
    const mutation = applyPersistedSettingsUpdate(this.state.settings, updates)
    this.state.settings = mutation.settings
    this.scheduleSave('settings')
    this.notifications.publishSettingsMutation(
      mutation,
      options.notifyListeners === true,
      options.originClientId
    )
    return mutation.settings
  }
}
