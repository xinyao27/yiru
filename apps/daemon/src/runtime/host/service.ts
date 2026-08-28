import {
  AI_VAULT_RUNTIME_CAPABILITY,
  BROWSER_CERTIFICATE_TRUST_RUNTIME_CAPABILITY,
  FOLDER_WORKSPACE_PATH_STATUS_RUNTIME_CAPABILITY,
  ORCHESTRATION_CONTRACT_RUNTIME_CAPABILITY,
  PROJECT_HOST_SETUP_RUNTIME_CAPABILITY,
  PROJECT_SOURCE_CONTEXT_RUNTIME_CAPABILITY,
  RUNTIME_CAPABILITIES,
  RUNTIME_ORPC_RUNTIME_CAPABILITY,
  TERMINAL_MULTIPLEX_RUNTIME_CAPABILITY,
  WORKSPACE_RUN_CONTEXT_RUNTIME_CAPABILITY,
  type RuntimeCapability
} from '@yiru/runtime-protocol/protocol-version'
import { ClaudeUsageStore } from '~main/agents/claude/usage/store'
import { CodexUsageStore } from '~main/agents/codex/usage/store'
import { agentHookServer } from '~main/agents/hooks/server'
import { OpenCodeUsageStore } from '~main/agents/opencode/usage/store'
import type { IPtyProvider } from '~main/agents/provider-runtime/types'
import { EmulatorBridge } from '~main/emulator/bridge'
import { resolveAuthorizedPath } from '~main/filesystem/auth'
import { previewGhosttyImport } from '~main/ghostty/import-preview'
import { initializeObservability, shutdownObservability } from '~main/observability/service'
import { initDataPath } from '~main/persistence/data-path'
import { Store } from '~main/persistence/store'
import type { RateLimitResumeUsageState } from '~main/rate-limit-resume/reset-resolution'
import { RateLimitResumeService } from '~main/rate-limit-resume/service'
import type { RateLimitService } from '~main/rate-limits/service'
import { StatsCollector, initStatsPath } from '~main/stats/collector'
import { getUsageScopePaths } from '~main/stats/usage-scope'
import { previewWarpThemeImport } from '~main/warp-themes/import-preview'

import { setGitHubEventPublisher } from '../github-events'
import { subscribeShellServicesConnectionLifecycle } from '../rpc/orpc/shell-services-reverse-link'
import { terminalMultiplexDisabledCapabilities } from '../terminal-multiplex/release-gate'
import { YiruRuntimeService } from '../yiru-runtime'
import { attachNodeRuntimeHostAccountServices } from './account-services'
import { attachNodeRuntimeHostEventSources } from './event-sources'
import { attachNodeRuntimeHostPtyController } from './pty-controller'
import {
  type NodeRuntimeHostTerminalManagementAdapter,
  setNodeRuntimeHostTerminalManagementAdapter
} from './terminal-management'

const NODE_RUNTIME_HOST_CAPABILITIES: ReadonlySet<RuntimeCapability> = new Set([
  'runtime.status.compat.v1',
  'browser.screencast.v1',
  AI_VAULT_RUNTIME_CAPABILITY,
  FOLDER_WORKSPACE_PATH_STATUS_RUNTIME_CAPABILITY,
  ORCHESTRATION_CONTRACT_RUNTIME_CAPABILITY,
  PROJECT_HOST_SETUP_RUNTIME_CAPABILITY,
  PROJECT_SOURCE_CONTEXT_RUNTIME_CAPABILITY,
  RUNTIME_ORPC_RUNTIME_CAPABILITY,
  TERMINAL_MULTIPLEX_RUNTIME_CAPABILITY,
  WORKSPACE_RUN_CONTEXT_RUNTIME_CAPABILITY
])

const EMPTY_RATE_LIMIT_USAGE: RateLimitResumeUsageState = {
  claude: null,
  codex: null,
  cursor: null,
  gemini: null,
  opencodeGo: null,
  kimi: null,
  antigravity: null,
  minimax: null,
  grok: null
}

export type NodeRuntimeHostService = {
  runtime: YiruRuntimeService
  rateLimits: RateLimitService
  shutdown: () => Promise<void>
  stats: StatsCollector
  store: Store
}

type NodeRuntimeHostServiceOptions = {
  disabledCapabilities?: readonly RuntimeCapability[]
  localPtyProvider: IPtyProvider
  profileDataFile: string
  restartDaemon: () => Promise<void>
  terminalManagementAdapter?: NodeRuntimeHostTerminalManagementAdapter
  userDataPath: string
}

export function createNodeRuntimeHostService({
  disabledCapabilities = [],
  localPtyProvider,
  profileDataFile,
  restartDaemon,
  terminalManagementAdapter,
  userDataPath
}: NodeRuntimeHostServiceOptions): NodeRuntimeHostService {
  initDataPath(userDataPath)
  initStatsPath()
  initializeObservability()
  // Why: runtime credentials and daemon state stay at the installation root,
  // while workbench state follows the same active profile file as Electron.
  const store = new Store({ dataFile: profileDataFile })
  const stats = new StatsCollector()
  const runtime = new YiruRuntimeService(store, stats, {
    getLocalProvider: () => localPtyProvider,
    // Why: guarded terminal sends must read the same daemon-ingested hook state
    // that the host publishes through agentStatus.events.
    getAgentStatusSnapshot: () =>
      agentHookServer.getStatusSnapshot().filter((entry) => entry.providerSessionOnly !== true),
    getDesktopWindowStatus: () => 'blocked',
    getWindowById: () => null,
    disabledCapabilities: [
      ...terminalMultiplexDisabledCapabilities(),
      ...RUNTIME_CAPABILITIES.filter(
        (capability) => !NODE_RUNTIME_HOST_CAPABILITIES.has(capability)
      ),
      ...disabledCapabilities,
      BROWSER_CERTIFICATE_TRUST_RUNTIME_CAPABILITY
    ],
    previewGhosttyImportForClient: () => previewGhosttyImport(store),
    previewWarpThemeImportForClient: (source) => previewWarpThemeImport(store, source),
    // Why: a relay or `serve` host answers mobile's stats reads on its own, so it
    // owns the same attributed-usage stores the windowed app wires. Cursor's
    // metered spend stays desktop-only — that probe needs Electron's net stack.
    providerUsageStores: {
      claude: new ClaudeUsageStore(store),
      codex: new CodexUsageStore(store),
      openCode: new OpenCodeUsageStore(store),
      getUsageScopePaths: () => getUsageScopePaths(store)
    }
  })
  const accountServices = attachNodeRuntimeHostAccountServices(runtime, store)
  const disposeEventSources = attachNodeRuntimeHostEventSources(runtime, store)
  const ptyController = attachNodeRuntimeHostPtyController(runtime, store, localPtyProvider)
  setNodeRuntimeHostTerminalManagementAdapter(
    terminalManagementAdapter ?? null,
    terminalManagementAdapter ? restartDaemon : null
  )
  const rateLimitResumes = new RateLimitResumeService(store, {
    getState: () => EMPTY_RATE_LIMIT_USAGE
  })
  runtime.setRateLimitResumeService(rateLimitResumes)
  rateLimitResumes.start()
  const emulatorBridge = new EmulatorBridge()
  runtime.setEmulatorBridge(emulatorBridge)
  // Why: the public contract keeps its cross-platform absolute-path shape, but
  // the standalone host may install only files whose canonical path is in an authorized root.
  runtime.emulatorCommands.configureInstallPathResolver((path) =>
    resolveAuthorizedPath(path, store)
  )
  const unsubscribeShellConnectionLifecycle = subscribeShellServicesConnectionLifecycle((event) => {
    switch (event.type) {
      case 'connected':
        runtime.attachShellConnection(event.shellConnectionId)
        break
      case 'disconnected':
        runtime.detachShellConnection(event.shellConnectionId)
        break
    }
  })
  setGitHubEventPublisher((event) => runtime.emitGitHubEvent(event))
  return {
    rateLimits: accountServices.rateLimits,
    runtime,
    stats,
    store,
    shutdown: async () => {
      setGitHubEventPublisher(() => {})
      shutdownObservability()
      disposeEventSources()
      unsubscribeShellConnectionLifecycle()
      accountServices.dispose()
      rateLimitResumes.dispose()
      runtime.stopOrchestrationFederationRelay()
      stats.flush()
      ptyController.dispose()
      setNodeRuntimeHostTerminalManagementAdapter(null)
      await emulatorBridge.destroyAllSessions()
      runtime.setEmulatorBridge(null)
      store.flush()
    }
  }
}
