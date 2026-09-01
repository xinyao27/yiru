import type { AgentStatusOrchestrationContext } from '@yiru/runtime-protocol/model/agent'

import type { RuntimeCapability } from '../../protocol-version'
import type { RemoteRuntimeSharedConnectionDiagnostics } from '../remote-runtime/shared-control-types'
import type { RemoteServerUpdateSupport } from '../remote-server-update'
import type { TerminalPaneLayoutNode } from '../types'
import type { RuntimeMobileSessionTabsSnapshot } from './mobile-session'

export type RuntimeGraphStatus = 'ready' | 'reloading' | 'unavailable'

// Why: headless serve still owns one runtime graph, but zero cannot collide
// with a browser window id and can be transferred safely on promotion.
export const HEADLESS_RUNTIME_WINDOW_ID = 0

// Why: the access scope a paired device token grants. Lives in shared so
// pairing offers, status.get, and the device registry use one vocabulary.
export type DeviceScope = 'mobile' | 'runtime'

// Why: presence-lock driver state crosses main/preload/renderer IPC. Keep one
// checked source so future variants cannot drift silently across layers.
export type RuntimeTerminalDriverState =
  | { kind: 'idle' }
  | { kind: 'desktop' }
  | { kind: 'mobile'; clientId: string }

export type RuntimeBrowserDriverState = RuntimeTerminalDriverState

export type RuntimeStatus = {
  runtimeId: string
  rendererGraphEpoch: number
  graphStatus: RuntimeGraphStatus
  authoritativeWindowId: number | null
  liveTabCount: number
  liveLeafCount: number
  // Why: optional so clients can read both new and pre-contract runtimes.
  // Absence is treated as protocol 0 by the compat evaluator.
  runtimeProtocolVersion?: number
  minCompatibleRuntimeClientVersion?: number
  capabilities?: RuntimeCapability[]
  // Why: optional inventory fields keep new clients compatible with older paired servers.
  appVersion?: string
  remoteUpdateSupport?: RemoteServerUpdateSupport
  remoteControl?: RemoteRuntimeSharedConnectionDiagnostics | null
  hostPlatform?: NodeJS.Platform
  terminalWindowsShell?: string | null
  // Why: legacy or saved WebSocket pairings may not carry scope metadata, so
  // the server stamps the authenticated token scope here for status.get only.
  deviceScope?: DeviceScope
  // COMPAT(runtimeStatusMobileAliases): added 2026-05-15 for mobile builds
  // that still read these names; new desktop/CLI code uses the fields above.
  protocolVersion?: number
  minCompatibleMobileVersion?: number
}

export type CliRuntimeState =
  | 'not_running'
  | 'starting'
  | 'ready'
  | 'graph_not_ready'
  | 'stale_bootstrap'

export type CliStatusResult = {
  app: {
    running: boolean
    pid: number | null
  }
  runtime: {
    state: CliRuntimeState
    reachable: boolean
    runtimeId: string | null
    appVersion?: string
    remoteUpdateSupport?: RemoteServerUpdateSupport
    capabilities?: RuntimeCapability[]
  }
  graph: {
    state: RuntimeGraphStatus | 'not_running' | 'starting'
  }
}

export type RuntimeSyncedTab = {
  tabId: string
  worktreeId: string
  title: string | null
  activeLeafId: string | null
  layout: TerminalPaneLayoutNode | null
}

export type RuntimeSyncedLeaf = {
  tabId: string
  worktreeId: string
  leafId: string
  paneRuntimeId: number
  ptyId: string | null
  paneTitle?: string | null
  title?: string | null
}

export type RuntimeSyncWindowGraph = {
  tabs: RuntimeSyncedTab[]
  leaves: RuntimeSyncedLeaf[]
  mobileSessionTabs?: RuntimeMobileSessionTabsSnapshot[]
}

export type RuntimeSyncWindowGraphResult = RuntimeStatus & {
  /** Main owns terminal handles/dispatches, so renderer graph sync returns the
   *  parent metadata needed by title-derived agent rows without name guessing. */
  agentOrchestrationByPaneKey?: Record<string, AgentStatusOrchestrationContext>
}
