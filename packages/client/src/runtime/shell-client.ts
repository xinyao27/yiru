import { shellAccountsApi, type ShellAccountsApi } from './shell-accounts-client'
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
  shellDeveloperPermissionsApi,
  shellExportApi,
  shellLocalhostWorktreeLabelsApi,
  shellMiniMaxCredentialsApi,
  shellMobileApi,
  type ShellDeveloperPermissionsApi,
  type ShellExportApi,
  type ShellLocalhostWorktreeLabelsApi,
  type ShellMiniMaxCredentialsApi,
  type ShellMobileApi
} from './shell-tools-client'
import { electronShellUiApi, type ShellUiApi } from './shell-ui-client'
import { shellWebConnectApi, type ShellWebConnectApi } from './shell-web-connect-client'
import { getWebShellApi } from './web-shell-client'
import { getWebShellUIApi } from './web-ui-shell-client'

type RendererShellClient = {
  accounts: ShellAccountsApi
  app: ShellAppApi
  crashReports: ShellCrashReportsApi
  developerPermissions: ShellDeveloperPermissionsApi
  diagnostics: ShellDiagnosticsApi
  export: ShellExportApi
  feedback: ShellFeedbackApi
  repoHost: ShellRepoHostApi
  runtime: ShellRuntimeStateApi
  gh: ShellGitHubApi
  notifications: ShellNotificationsApi
  localhostWorktreeLabels: ShellLocalhostWorktreeLabelsApi
  minimaxCredentials: ShellMiniMaxCredentialsApi
  mobile: ShellMobileApi
  starNag: ShellStarNagApi
  updater: ShellUpdaterApi
  telemetry: ShellTelemetryApi
  webConnect: ShellWebConnectApi
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

// Why: feature code targets one shell adapter. Desktop calls the fixed local
// oRPC host; the web build supplies the same shape explicitly.
export const shellClient: RendererShellClient = {
  accounts: shellAccountsApi,
  app: shellAppApi,
  crashReports: shellCrashReportsApi,
  developerPermissions: shellDeveloperPermissionsApi,
  diagnostics: shellDiagnosticsApi,
  export: shellExportApi,
  feedback: shellFeedbackApi,
  repoHost: shellRepoHostApi,
  runtime: shellRuntimeStateApi,
  gh: shellGitHubApi,
  notifications: shellNotificationsApi,
  localhostWorktreeLabels: shellLocalhostWorktreeLabelsApi,
  minimaxCredentials: shellMiniMaxCredentialsApi,
  mobile: shellMobileApi,
  starNag: shellStarNagApi,
  updater: shellUpdaterApi,
  telemetry: shellTelemetryApi,
  webConnect: shellWebConnectApi,
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
