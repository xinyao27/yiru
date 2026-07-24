import type { GlobalSettings, PersistedState } from '../../shared/types'
import type { PersistedSettingsMutation } from './persisted-settings-mutations'

export type PersistedSettingsChangeListener = (
  updates: Partial<GlobalSettings>,
  settings: GlobalSettings,
  originWebContentsId?: number
) => void

export type PersistedUiChangeListener = (ui: PersistedState['ui']) => void

export class PersistedStateNotifications {
  private readonly settingsListeners = new Set<PersistedSettingsChangeListener>()
  private readonly uiListeners = new Set<PersistedUiChangeListener>()

  onSettingsChanged(listener: PersistedSettingsChangeListener): () => void {
    this.settingsListeners.add(listener)
    return () => {
      this.settingsListeners.delete(listener)
    }
  }

  publishSettingsMutation(
    mutation: PersistedSettingsMutation,
    notifyListeners: boolean,
    originWebContentsId?: number
  ): void {
    if (!notifyListeners || Object.keys(mutation.changedUpdates).length === 0) {
      return
    }
    for (const listener of this.settingsListeners) {
      listener(mutation.changedUpdates, mutation.settings, originWebContentsId)
    }
  }

  onUiChanged(listener: PersistedUiChangeListener): () => void {
    this.uiListeners.add(listener)
    return () => {
      this.uiListeners.delete(listener)
    }
  }

  publishUiMutation(readUi: () => PersistedState['ui']): void {
    if (this.uiListeners.size === 0) {
      return
    }
    // Why: computing normalized UI can be non-trivial; retain the old lazy
    // behavior when no renderer or runtime subscriber is listening.
    const ui = readUi()
    for (const listener of this.uiListeners) {
      listener(ui)
    }
  }
}
