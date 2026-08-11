import {
  shellKeybindingsApi,
  shellYiruProfilesApi,
  type ShellKeybindingsApi,
  type ShellYiruProfilesApi
} from './shell-configuration-client'
import type { ShellNotificationsApi } from './shell-notifications-client'
import { electronShellPlatformApi, type ShellPlatformApi } from './shell-platform-client'
import {
  shellCrashReportsApi,
  shellDiagnosticsApi,
  shellFeedbackApi,
  shellTelemetryApi,
  type ShellCrashReportsApi,
  type ShellDiagnosticsApi,
  type ShellFeedbackApi,
  type ShellTelemetryApi
} from './shell-reporting-client'
import {
  shellCacheApi,
  shellOnboardingApi,
  shellSessionApi,
  shellSettingsApi,
  type ShellCacheApi,
  type ShellOnboardingApi,
  type ShellSessionApi,
  type ShellSettingsApi
} from './shell-state-client'
import {
  shellAppApi,
  shellGitHubApi,
  shellNotificationsApi,
  shellRepoHostApi,
  shellRuntimeStateApi,
  shellStarNagApi,
  shellUpdaterApi,
  type ShellAppApi,
  type ShellGitHubApi,
  type ShellRepoHostApi,
  type ShellRuntimeStateApi,
  type ShellStarNagApi,
  type ShellUpdaterApi
} from './shell-system-client'
import {
  shellAutomationsApi,
  shellDeveloperPermissionsApi,
  shellExportApi,
  shellFridayApi,
  shellLocalhostWorktreeLabelsApi,
  shellMiniMaxCredentialsApi,
  shellMobileApi,
  shellPetApi,
  shellSpeechApi,
  type ShellAutomationsApi,
  type ShellDeveloperPermissionsApi,
  type ShellFridayApi,
  type ShellLocalhostWorktreeLabelsApi,
  type ShellMiniMaxCredentialsApi,
  type ShellMobileApi,
  type ShellPetApi,
  type ShellSpeechApi
} from './shell-tools-client'
import { electronShellUiApi, type ShellUiApi } from './shell-ui-client'
import { getWebShellApi } from './web-shell-client'
import { getWebShellUIApi } from './web-ui-shell-client'

type RendererShellClient = {
  automations: ShellAutomationsApi
  app: ShellAppApi
  crashReports: ShellCrashReportsApi
  developerPermissions: ShellDeveloperPermissionsApi
  diagnostics: ShellDiagnosticsApi
  export: ExportApi
  feedback: ShellFeedbackApi
  friday: ShellFridayApi
  repoHost: ShellRepoHostApi
  runtime: ShellRuntimeStateApi
  gh: ShellGitHubApi
  notifications: ShellNotificationsApi
  localhostWorktreeLabels: ShellLocalhostWorktreeLabelsApi
  minimaxCredentials: ShellMiniMaxCredentialsApi
  mobile: ShellMobileApi
  pet: ShellPetApi
  speech: ShellSpeechApi
  starNag: ShellStarNagApi
  updater: ShellUpdaterApi
  telemetry: ShellTelemetryApi
  shell: ShellPlatformApi
  ui: ShellUiApi
  settings: ShellSettingsApi
  session: ShellSessionApi
  onboarding: ShellOnboardingApi
  cache: ShellCacheApi
  keybindings: ShellKeybindingsApi
  yiruProfiles: ShellYiruProfilesApi
}

function isWebShellClient(): boolean {
  return (globalThis as { __YIRU_WEB_CLIENT__?: boolean }).__YIRU_WEB_CLIENT__ === true
}

// Why: feature code targets the shell adapter, not Electron's preload object.
// Desktop delegates to preload; the web build supplies the same shell shape.
export const shellClient: RendererShellClient = {
  automations: shellAutomationsApi,
  app: shellAppApi,
  crashReports: shellCrashReportsApi,
  developerPermissions: shellDeveloperPermissionsApi,
  diagnostics: shellDiagnosticsApi,
  export: shellExportApi,
  feedback: shellFeedbackApi,
  friday: shellFridayApi,
  repoHost: shellRepoHostApi,
  runtime: shellRuntimeStateApi,
  gh: shellGitHubApi,
  notifications: shellNotificationsApi,
  localhostWorktreeLabels: shellLocalhostWorktreeLabelsApi,
  minimaxCredentials: shellMiniMaxCredentialsApi,
  mobile: shellMobileApi,
  pet: shellPetApi,
  speech: shellSpeechApi,
  starNag: shellStarNagApi,
  updater: shellUpdaterApi,
  telemetry: shellTelemetryApi,
  get shell() {
    return isWebShellClient() ? getWebShellApi() : electronShellPlatformApi
  },
  get ui() {
    return isWebShellClient() ? getWebShellUIApi() : electronShellUiApi
  },
  settings: shellSettingsApi,
  session: shellSessionApi,
  onboarding: shellOnboardingApi,
  cache: shellCacheApi,
  keybindings: shellKeybindingsApi,
  yiruProfiles: shellYiruProfilesApi
}
import type { ExportApi } from '~shared/preload/api-types'
