import {
  AI_VAULT_RUNTIME_CAPABILITY,
  BROWSER_CERTIFICATE_TRUST_RUNTIME_CAPABILITY,
  BROWSER_HEADLESS_RUNTIME_CAPABILITY,
  FOLDER_WORKSPACE_PATH_STATUS_RUNTIME_CAPABILITY,
  ORCHESTRATION_CONTRACT_RUNTIME_CAPABILITY,
  PROJECT_HOST_SETUP_RUNTIME_CAPABILITY,
  PROJECT_SOURCE_CONTEXT_RUNTIME_CAPABILITY,
  RUNTIME_CAPABILITIES,
  RUNTIME_ORPC_RUNTIME_CAPABILITY,
  TERMINAL_MULTIPLEX_RUNTIME_CAPABILITY,
  WORKSPACE_RUN_CONTEXT_RUNTIME_CAPABILITY,
  type RuntimeCapability
} from '@yiru/runtime-protocol/capabilities'
import { agentHookServer } from '~main/agent-hooks/server'
import { createHeadlessAutomationDispatcher } from '~main/automations/headless-dispatch'
import { AutomationService } from '~main/automations/service'
import { AgentBrowserBridge } from '~main/browser/agent-browser-bridge'
import { ChromeBrowserBackend } from '~main/browser/chrome/backend'
import { BrowserPageCatalog } from '~main/browser/page/catalog'
import { browserSessionRegistry } from '~main/browser/session-registry'
import { ClaudeUsageStore } from '~main/claude/usage/store'
import { CodexUsageStore } from '~main/codex/usage/store'
import {
  createCoworkingOwnerComposition,
  type CoworkingOwnerComposition
} from '~main/coworking/owner/composition'
import { registerCoworkingSharingController } from '~main/coworking/sharing'
import { CoworkingUnavailableOwnerService } from '~main/coworking/unavailable-owner-service'
import type { DaemonPtyAdapter } from '~main/daemon/pty-adapter'
import { EmulatorBridge } from '~main/emulator/bridge'
import { resolveAuthorizedPath } from '~main/filesystem/auth'
import { previewGhosttyImport } from '~main/ghostty/import-preview'
import { OpenCodeUsageStore } from '~main/opencode/usage/store'
import { initDataPath, Store } from '~main/persistence'
import type { RateLimitResumeUsageState } from '~main/rate-limit-resume/reset-resolution'
import { RateLimitResumeService } from '~main/rate-limit-resume/service'
import { configureOpenAiSpeechStorage } from '~main/speech/openai-api-key-store'
import { StatsCollector, initStatsPath } from '~main/stats/collector'
import { getUsageScopePaths } from '~main/stats/usage-scope'
import { previewWarpThemeImport } from '~main/warp-themes/import-preview'

import { setGitHubEventPublisher } from '../github-events'
import { subscribeShellServicesConnectionLifecycle } from '../rpc/orpc/shell-services-reverse-link'
import { YiruRuntimeService } from '../yiru-runtime'
import { attachNodeRuntimeHostAccountServices } from './account-services'
import { NodeRuntimeBrowserCommands } from './browser-commands'
import { createNodeRuntimeBrowserShellAdapter } from './browser-shell-adapter'
import { attachNodeRuntimeHostEventSources } from './event-sources'
import { getRuntimeHostPathsProvider } from './paths-provider'
import { attachNodeRuntimeHostPtyController } from './pty-controller'
import { setNodeRuntimeHostTerminalManagementAdapter } from './terminal-management'
import type { NodeRuntimeHostWebService } from './web-service'

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
  attachCoworkingOwner: (
    runtimeRpc: NodeRuntimeHostWebService['coworkingRuntimeRpc']
  ) => Promise<void>
  runtime: YiruRuntimeService
  shutdown: () => Promise<void>
}

export function createNodeRuntimeHostService(
  userDataPath: string,
  localPtyProvider: DaemonPtyAdapter,
  restartDaemon: () => Promise<void>
): NodeRuntimeHostService {
  configureOpenAiSpeechStorage({
    allowPlaintext: false,
    directory: () => userDataPath
  })
  initDataPath(userDataPath)
  initStatsPath()
  const store = new Store()
  const stats = new StatsCollector()
  const chromeExecutablePath = process.env.YIRU_CHROME_EXECUTABLE_PATH?.trim()
  const runtime = new YiruRuntimeService(store, stats, {
    getLocalProvider: () => localPtyProvider,
    // Why: guarded terminal sends must read the same daemon-ingested hook state
    // that the host publishes through agentStatus.events.
    getAgentStatusSnapshot: () =>
      agentHookServer.getStatusSnapshot().filter((entry) => entry.providerSessionOnly !== true),
    getDesktopWindowStatus: () => 'blocked',
    getWindowById: () => null,
    disabledCapabilities: [
      ...RUNTIME_CAPABILITIES.filter(
        (capability) => !NODE_RUNTIME_HOST_CAPABILITIES.has(capability)
      ),
      ...(chromeExecutablePath ? [] : [BROWSER_HEADLESS_RUNTIME_CAPABILITY]),
      BROWSER_CERTIFICATE_TRUST_RUNTIME_CAPABILITY
    ],
    createBrowserCommands: (host) =>
      new NodeRuntimeBrowserCommands(host, createNodeRuntimeBrowserShellAdapter(host)),
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
  let coworkingOwner: CoworkingOwnerComposition | null = null
  let unregisterCoworkingOwner: (() => void) | null = null
  const ptyController = attachNodeRuntimeHostPtyController(runtime, store, localPtyProvider)
  setNodeRuntimeHostTerminalManagementAdapter(localPtyProvider, restartDaemon)
  const rateLimitResumes = new RateLimitResumeService(store, {
    getState: () => EMPTY_RATE_LIMIT_USAGE
  })
  runtime.setRateLimitResumeService(rateLimitResumes)
  rateLimitResumes.start()
  const automations = new AutomationService(store, {
    allowRemoteHostScheduling: true,
    headlessDispatcher: createHeadlessAutomationDispatcher(runtime)
  })
  runtime.setAutomationService(automations)
  automations.start()
  let browserBridge: AgentBrowserBridge | null = null
  const browserPages = chromeExecutablePath
    ? new BrowserPageCatalog((browserPageId) => {
        if (browserBridge) {
          void browserBridge.onTabClosed(browserPageId).catch(() => {})
        }
      })
    : null
  browserBridge = browserPages ? new AgentBrowserBridge(browserPages) : null
  const browserBackend =
    browserPages && chromeExecutablePath
      ? new ChromeBrowserBackend({
          pageCatalog: browserPages,
          resolveExecutablePath: () => chromeExecutablePath,
          userDataParentPath: userDataPath
        })
      : null
  if (browserBackend) {
    browserSessionRegistry.enableHeadlessProfileStorage()
    browserSessionRegistry.initializeBrowserSessionsFromPersistedState()
  }
  runtime.setAgentBrowserBridge(browserBridge)
  runtime.setBrowserBackend(browserBackend)
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
    attachCoworkingOwner: async (runtimeRpc) => {
      const paths = getRuntimeHostPathsProvider()
      try {
        coworkingOwner = createCoworkingOwnerComposition({
          store,
          runtime,
          runtimeRpc,
          rateLimits: accountServices.rateLimits,
          userDataPath,
          profileId: process.env.YIRU_PROFILE_ID?.trim() || 'runtime-host',
          ownerRuntimeId: runtime.getRuntimeId(),
          yiruVersion: paths.version(),
          osFamily:
            process.platform === 'darwin'
              ? 'macos'
              : process.platform === 'win32'
                ? 'windows'
                : 'linux',
          isPackaged: paths.isPackaged(),
          executablePath: paths.executablePath()
        })
        unregisterCoworkingOwner = registerCoworkingSharingController(
          runtime,
          coworkingOwner.service
        )
        await coworkingOwner.start()
      } catch (error) {
        await coworkingOwner?.stop().catch(() => {})
        coworkingOwner = null
        unregisterCoworkingOwner?.()
        unregisterCoworkingOwner = registerCoworkingSharingController(
          runtime,
          new CoworkingUnavailableOwnerService(runtimeRpc)
        )
        console.error('[coworking] Failed to compose Node runtime host sharing:', error)
      }
    },
    runtime,
    shutdown: async () => {
      setGitHubEventPublisher(() => {})
      disposeEventSources()
      unsubscribeShellConnectionLifecycle()
      automations.stop()
      unregisterCoworkingOwner?.()
      unregisterCoworkingOwner = null
      await coworkingOwner?.stop()
      coworkingOwner = null
      accountServices.dispose()
      rateLimitResumes.dispose()
      runtime.stopOrchestrationFederationRelay()
      stats.flush()
      ptyController.dispose()
      setNodeRuntimeHostTerminalManagementAdapter(null)
      await emulatorBridge.destroyAllSessions()
      runtime.setEmulatorBridge(null)
      await browserBridge?.destroyAll()
      await browserBackend?.destroyAll()
      browserPages?.clear()
      runtime.setAgentBrowserBridge(null)
      runtime.setBrowserBackend(null)
      store.flush()
    }
  }
}
