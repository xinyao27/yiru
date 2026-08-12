import type { GlobalSettings } from '~shared/types'

import {
  getRuntimeBackedWebSettings,
  readWebSettings,
  setWebSettings,
  updateWebPRBotAuthorOverride
} from '../../settings'

export const webShellSettingsApi = {
  get: (): Promise<GlobalSettings> => getRuntimeBackedWebSettings(),
  getSnapshot: (): GlobalSettings => readWebSettings(),
  set: (updates: Partial<GlobalSettings>): Promise<GlobalSettings> => setWebSettings(updates),
  updatePRBotAuthorOverride: updateWebPRBotAuthorOverride
}
