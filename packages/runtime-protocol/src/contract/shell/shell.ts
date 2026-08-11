import type { ContractRouter } from '@orpc/contract'

import type { RuntimeProcedureMeta } from '../access-meta.js'
import { shellBrowserContract } from './browser.js'
import { shellKeybindingsContract, shellYiruProfilesContract } from './configuration.js'
import { shellEventsContract } from './events.js'
import { shellFilesContract } from './files.js'
import {
  shellCacheContract,
  shellOnboardingContract,
  shellSessionContract
} from './persisted-state.js'
import { shellPlatformContract } from './platform.js'
import { shellSettingsContract } from './settings.js'
import { shellUiContract } from './ui.js'

export const shellContract = {
  browser: shellBrowserContract,
  keybindings: shellKeybindingsContract,
  events: shellEventsContract,
  files: shellFilesContract,
  platform: shellPlatformContract,
  settings: shellSettingsContract,
  session: shellSessionContract,
  onboarding: shellOnboardingContract,
  cache: shellCacheContract,
  ui: shellUiContract,
  yiruProfiles: shellYiruProfilesContract
} satisfies ContractRouter<RuntimeProcedureMeta>

export * from './browser.js'
export * from './configuration.js'
export * from './events.js'
export * from './files.js'
export * from './platform.js'
export * from './persisted-state.js'
export * from './settings.js'
export * from './ui.js'
