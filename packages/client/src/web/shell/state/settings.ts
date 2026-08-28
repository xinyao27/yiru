import type { GlobalSettings } from '@yiru/runtime-protocol/workbench/types'
import {
  getRuntimeBackedWebSettings,
  readWebSettings,
  setWebSettings,
  updateWebPRBotAuthorOverride
} from '~renderer/web/settings'

export const webShellSettingsApi = {
  get: (): Promise<GlobalSettings> => getRuntimeBackedWebSettings(),
  getSnapshot: (): GlobalSettings => readWebSettings(),
  set: (updates: Partial<GlobalSettings>): Promise<GlobalSettings> => setWebSettings(updates),
  updatePRBotAuthorOverride: updateWebPRBotAuthorOverride
}
