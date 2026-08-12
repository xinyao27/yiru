import { webShellCacheApi } from './github-cache'
import { webShellOnboardingApi } from './onboarding'
import { webShellSessionApi } from './session'
import { webShellSettingsApi } from './settings'

export function getWebShellStateApis() {
  return {
    settings: webShellSettingsApi,
    session: webShellSessionApi,
    onboarding: webShellOnboardingApi,
    cache: webShellCacheApi
  }
}
