import type { ContractRouter } from '@orpc/contract'

import type { RuntimeProcedureMeta } from '../access-meta.js'
import { shellAccountsContract } from './accounts.js'
import { shellAiVaultContract } from './ai-vault.js'
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
import { shellRuntimeEnvironmentsContract } from './runtime-environments.js'
import { shellSettingsContract } from './settings.js'
import {
  shellAppContract,
  shellGitHubContract,
  shellNotificationsContract,
  shellRepoHostContract,
  shellRuntimeStateContract,
  shellStarNagContract,
  shellUpdaterContract
} from './system.js'
import {
  shellCrashReportsContract,
  shellDeveloperPermissionsContract,
  shellDiagnosticsContract,
  shellExportContract,
  shellFeedbackContract,
  shellLocalhostWorktreeLabelsContract,
  shellMiniMaxCredentialsContract,
  shellMobileContract,
  shellTelemetryContract
} from './tools.js'
import { shellUiContract } from './ui.js'
import { shellWebConnectContract } from './web-connect.js'

export const shellContract = {
  accounts: shellAccountsContract,
  aiVault: shellAiVaultContract,
  app: shellAppContract,
  browser: shellBrowserContract,
  crashReports: shellCrashReportsContract,
  developerPermissions: shellDeveloperPermissionsContract,
  diagnostics: shellDiagnosticsContract,
  export: shellExportContract,
  feedback: shellFeedbackContract,
  keybindings: shellKeybindingsContract,
  events: shellEventsContract,
  files: shellFilesContract,
  gh: shellGitHubContract,
  notifications: shellNotificationsContract,
  localhostWorktreeLabels: shellLocalhostWorktreeLabelsContract,
  minimaxCredentials: shellMiniMaxCredentialsContract,
  mobile: shellMobileContract,
  platform: shellPlatformContract,
  repoHost: shellRepoHostContract,
  runtime: shellRuntimeStateContract,
  runtimeEnvironments: shellRuntimeEnvironmentsContract,
  settings: shellSettingsContract,
  session: shellSessionContract,
  starNag: shellStarNagContract,
  telemetry: shellTelemetryContract,
  onboarding: shellOnboardingContract,
  cache: shellCacheContract,
  ui: shellUiContract,
  updater: shellUpdaterContract,
  webConnect: shellWebConnectContract,
  yiruProfiles: shellYiruProfilesContract
} satisfies ContractRouter<RuntimeProcedureMeta>

export * from './browser.js'
export * from './accounts.js'
export * from './ai-vault.js'
export * from './configuration.js'
export * from './events.js'
export * from './files.js'
export * from './platform.js'
export * from './persisted-state.js'
export * from './settings.js'
export * from './runtime-environments.js'
export * from './system.js'
export * from './tools.js'
export * from './ui.js'
export * from './web-connect.js'
