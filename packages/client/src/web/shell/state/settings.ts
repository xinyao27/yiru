import {
  getRuntimeBackedWebSettings,
  readWebSettings,
  setWebSettings,
  updateWebPRBotAuthorOverride
} from '~renderer/web/settings'
import type { GlobalSettings } from '~shared/types'

export const webShellSettingsApi = {
  get: (): Promise<GlobalSettings> => getRuntimeBackedWebSettings(),
  getSnapshot: (): GlobalSettings => readWebSettings(),
  set: (updates: Partial<GlobalSettings>): Promise<GlobalSettings> => setWebSettings(updates),
  updatePRBotAuthorOverride: updateWebPRBotAuthorOverride
}
