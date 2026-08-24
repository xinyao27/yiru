import { is } from '@electron-toolkit/utils'
import { app } from 'electron'

import { AgentAwakeService } from '../agent-awake-service'
import { agentHookServer } from '../agent-hooks/server'
import { applyAppIcon } from '../app-icon'
import { initializeBrowserSessionsForApp } from '../browser/session-startup'
import {
  attachClaudeLivePtyPersistence,
  seedLiveClaudePtysFromPersistence
} from '../claude/accounts/live-pty-gate'
import { setDefaultWslDistroOverride } from '../git/runner'
import { applyElectronProxySettings } from '../network/proxy-settings'
import { initObservability } from '../observability/service'
import { Store } from '../persistence'
import { selfHealRuntimeEnvironmentFocus } from '../runtime-environment-focus-self-heal'
import { registerSystemResumeBroadcast } from '../system-resume-broadcast'
import { initTelemetry } from '../telemetry/client'
import { initCohortClassifier } from '../telemetry/cohort-classifier'
import { initOnboardingCohortClassifier } from '../telemetry/onboarding-cohort-classifier'
import { registerWindowFocusBroadcast } from '../window/focus-broadcast'
import { ensureActiveYiruProfile } from '../yiru-profiles/profile-index-store'
import {
  shouldSuppressDevEducation,
  suppressDevEducationForStore
} from './dev-education-suppression'
import { logStartupMilestone } from './diagnostics'

export type DesktopStoreStartup = {
  profileId: string
  profileDirectory: string
  store: Store
  agentAwakeService: AgentAwakeService
  unsubscribeAgentAwakeStatusChanges: () => void
  unsubscribeSystemResumeBroadcast: () => void
  unsubscribeWindowFocusBroadcast: () => void
}

export async function initializeDesktopStore(options: {
  syncMacMenuBarIcon: (visible: boolean) => void
  refreshRateLimits: () => void
}): Promise<DesktopStoreStartup> {
  const activeProfile = ensureActiveYiruProfile()
  const store = new Store({ dataFile: activeProfile.dataFile })
  logStartupMilestone('store-loaded')
  setDefaultWslDistroOverride(store.getSettings().terminalWindowsWslDistro ?? null)
  store.onSettingsChanged((updates, settings) => {
    if ('terminalWindowsWslDistro' in updates) {
      setDefaultWslDistroOverride(settings.terminalWindowsWslDistro ?? null)
    }
    if ('showMenuBarIcon' in updates) {
      options.syncMacMenuBarIcon(settings.showMenuBarIcon !== false)
    }
    if ('activeRuntimeEnvironmentId' in updates || 'localWindowsRuntimeDefault' in updates) {
      options.refreshRateLimits()
    }
  })

  attachClaudeLivePtyPersistence(store)
  const persistedClaudePtyIds = store.getClaudeLivePtySessionIds()
  seedLiveClaudePtysFromPersistence(persistedClaudePtyIds)
  if (persistedClaudePtyIds.length > 0) {
    console.log(
      `[claude-live-pty] Seeded ${persistedClaudePtyIds.length} persisted Claude session id(s) into the refresh gate`
    )
  }
  selfHealRuntimeEnvironmentFocus({ store, userDataPath: app.getPath('userData') })
  applyAppIcon(store.getSettings().appIcon)
  if (shouldSuppressDevEducation({ isDev: is.dev })) {
    suppressDevEducationForStore(store)
  }
  try {
    await applyElectronProxySettings(store.getSettings())
  } catch {
    console.warn('[proxy] Failed to apply network proxy settings')
  }
  initializeBrowserSessionsForApp({
    yiruProfileId: activeProfile.profile.id,
    profileDirectory: activeProfile.profileDirectory
  })

  const agentAwakeService = new AgentAwakeService()
  agentAwakeService.setEnabled(store.getSettings().keepComputerAwakeWhileAgentsRun)
  agentAwakeService.setStatuses([])
  const unsubscribeAgentAwakeStatusChanges = agentHookServer.subscribeStatusChanges((statuses) => {
    agentAwakeService.setStatuses(statuses)
  })
  initTelemetry(store)
  initObservability()
  initCohortClassifier(store)
  initOnboardingCohortClassifier(store)

  return {
    profileId: activeProfile.profile.id,
    profileDirectory: activeProfile.profileDirectory,
    store,
    agentAwakeService,
    unsubscribeAgentAwakeStatusChanges,
    unsubscribeSystemResumeBroadcast: registerSystemResumeBroadcast(),
    unsubscribeWindowFocusBroadcast: registerWindowFocusBroadcast()
  }
}
