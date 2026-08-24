export {
  applyFreshWebSessionTabsSnapshot,
  applyFreshWebSessionTabsSnapshots,
  applyWebSessionTabsSnapshot,
  applyWebSessionTabsSnapshots,
  applyWebSessionTabsStorePatch
} from './web-session-tabs-application'
export type { WebSessionTabsSyncState } from './web-session-tabs-state'
export {
  acceptReplayedWebSessionTabsSnapshot,
  clearWebSessionTabsTrackingForEnvironment,
  getLastKnownHostTerminalTabCount,
  resolveHostSessionTabIdForWebSessionTab,
  shouldApplyWebSessionTabsSnapshot,
  shouldBootstrapInitialWebRuntimeTerminal,
  shouldRespawnWebRuntimeTerminalAfterWake,
  shouldSyncAllRuntimeSessionTabs,
  shouldSyncRuntimeSessionTabs
} from './web-session-tabs-tracking'
export { useWebSessionTabsSync } from './use-web-session-tabs-sync'
