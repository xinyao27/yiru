import type { AnyRouter } from '@orpc/server'
import { RPCHandler, type MinimalWebsocket } from '@orpc/server/websocket'
import {
  AGENT_STATUS_STALE_AFTER_MS,
  agentPhaseFromStatus,
  type TuiAgent
} from '@yiru/runtime-protocol/model/agent'
import { agentHookServer } from '~main/agents/hooks/server'
import type { IPtyProvider } from '~main/agents/provider-runtime/types'
import { initializeRuntimeEnvironmentRegistry } from '~main/runtime/environments'
import {
  configureSkillBundleArtifactSources,
  type SkillBundleArtifactSources
} from '~main/skills/skill-bundle-artifacts'
import { ensureActiveYiruProfile } from '~main/yiru-profiles/profile-index-store'

import type { WorkspaceEventLog } from '../../events/log'
import type { DaemonRestart } from '../../server/restart'
import type { RuntimeOrpcContext } from '../rpc/orpc/bridge'
import { createRuntimeOrpcHandlerOptions } from '../rpc/orpc/request-metadata'
import { requestShellBrowserCommand } from '../rpc/orpc/shell-services-browser-client'
import { TerminalMultiplexConnections } from '../terminal-multiplex/connections'
import { listWorkbenchAgentSessions } from './agent-sessions'
import { initializeBunShellServices } from './bun-shell/bootstrap'
import type { BunShellPlatformActions } from './bun-shell/platform'
import { createBunShellServicesBridge } from './bun-shell/reverse-link'
import { createBunShellHandlers } from './bun-shell/router'
import { createNodeRuntimeHostPathsProvider, setRuntimeHostPathsProvider } from './paths-provider'
import { nodeRuntimeHostRouter } from './router'
import { createNodeRuntimeHostService } from './service'
import { readWorkbenchSessionContext } from './session-context'
import type { NodeRuntimeHostTerminalManagementAdapter } from './terminal-management'
import {
  createWorkbenchRuntimeContext,
  type WorkbenchClientIdentity,
  type WorkbenchContextTransport
} from './workbench-context'

export async function createBunWorkbenchRuntime(options: {
  localPtyProvider: IPtyProvider & NodeRuntimeHostTerminalManagementAdapter
  platformActions: BunShellPlatformActions
  readMobileEndpoint: () => string | null
  restartDaemon: DaemonRestart
  skillBundleArtifacts: SkillBundleArtifactSources
  userDataPath: string
  workspaceEventLog: WorkspaceEventLog
}) {
  configureSkillBundleArtifactSources(options.skillBundleArtifacts)
  setRuntimeHostPathsProvider(createNodeRuntimeHostPathsProvider(options.userDataPath))
  const activeProfile = ensureActiveYiruProfile(options.userDataPath)
  await agentHookServer.start({
    env: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    userDataPath: options.userDataPath
  })
  const service = createNodeRuntimeHostService({
    localPtyProvider: options.localPtyProvider,
    profileDataFile: activeProfile.dataFile,
    restartDaemon: async () => options.restartDaemon(),
    terminalManagementAdapter: options.localPtyProvider,
    userDataPath: options.userDataPath
  })
  initializeBunShellServices({
    platformActions: options.platformActions,
    rateLimits: service.rateLimits,
    runtime: service.runtime,
    stats: service.stats,
    store: service.store,
    workspaceEventLog: options.workspaceEventLog
  })
  initializeRuntimeEnvironmentRegistry(service.store)
  const shellServices = createBunShellServicesBridge()
  const terminalMultiplex = new TerminalMultiplexConnections()
  return {
    approveWorkbenchTerminal: async (terminalHandle: string) =>
      (await service.runtime.sendTerminal(terminalHandle, { enter: true, text: 'y' })).accepted,
    cleanupConnection: (connectionId: string) => {
      terminalMultiplex.closeConnection(connectionId)
      service.runtime.cleanupSubscriptionsForConnection(connectionId)
    },
    closeWorkbenchTerminal: async (terminalHandle: string) => {
      await service.runtime.closeTerminal(terminalHandle)
    },
    closeWorkbenchTerminals: async (worktreeId: string) => {
      const result = await service.runtime.listTerminals(`id:${worktreeId}`, 500)
      await Promise.all(
        result.terminals
          .filter((terminal) => terminal.connected)
          .map((terminal) => service.runtime.closeTerminal(terminal.handle))
      )
    },
    createContext: (
      connectionId: string,
      transport: WorkbenchContextTransport,
      identity: WorkbenchClientIdentity = { kind: 'extension' }
    ) =>
      createWorkbenchRuntimeContext({
        connectionId,
        identity,
        runtime: service.runtime,
        terminalMultiplex,
        transport,
        workspaceEventLog: options.workspaceEventLog
      }),
    createRpcHandler: (router: AnyRouter) => {
      const handler = new RPCHandler<RuntimeOrpcContext>(router, createRuntimeOrpcHandlerOptions())
      return {
        close: (peer: MinimalWebsocket) => handler.close(peer),
        message: (
          peer: MinimalWebsocket,
          payload: string | ArrayBuffer,
          context: RuntimeOrpcContext
        ) => handler.message(peer, payload, { context })
      }
    },
    findActiveWorkbenchAgent: (worktreeId: string) =>
      agentHookServer
        .getStatusSnapshot()
        .find(
          (status) =>
            status.worktreeId === worktreeId &&
            status.state !== 'done' &&
            Date.now() - status.receivedAt <= AGENT_STATUS_STALE_AFTER_MS &&
            status.terminalHandle
        )?.terminalHandle ?? null,
    getWorkbenchAgentPhase: (terminalHandle: string) => {
      const status = agentHookServer
        .getStatusSnapshot()
        .find(
          (candidate) =>
            candidate.terminalHandle === terminalHandle &&
            Date.now() - candidate.receivedAt <= AGENT_STATUS_STALE_AFTER_MS
        )
      return status ? agentPhaseFromStatus(status) : null
    },
    handleBinary: (connectionId: string, payload: Uint8Array<ArrayBufferLike>) =>
      terminalMultiplex.handle(connectionId, payload),
    hasWorkbenchTerminal: async (worktreeId: string, terminalHandle: string) => {
      try {
        const terminal = await service.runtime.showTerminal(terminalHandle)
        return terminal.worktreeId === worktreeId && terminal.connected
      } catch {
        return false
      }
    },
    launchWorkbenchAgent: async (
      worktreeId: string,
      prompt: string,
      title: string,
      agent: TuiAgent = 'codex'
    ) => {
      const terminal = await service.runtime.launchAgentTerminal(`id:${worktreeId}`, {
        agent,
        presentation: 'visible',
        prompt,
        title
      })
      return { terminalHandle: terminal.handle }
    },
    launchWorkbenchTerminal: async (worktreeId: string, title: string, command?: string) => {
      const terminal = await service.runtime.createTerminal(`id:${worktreeId}`, {
        ...(command ? { command } : {}),
        presentation: 'visible',
        title
      })
      return { terminalHandle: terminal.handle }
    },
    listWorkbenchAgentSessions: (worktreeId?: string) =>
      listWorkbenchAgentSessions(service.runtime, agentHookServer.getStatusSnapshot(), worktreeId),
    listRepos: () => service.runtime.listRepos(),
    onAgentStatusEvent: (listener: Parameters<typeof service.runtime.onAgentStatusEvent>[0]) =>
      service.runtime.onAgentStatusEvent(listener),
    onHostProgressEvent: (listener: Parameters<typeof service.runtime.onHostProgressEvent>[0]) =>
      service.runtime.onHostProgressEvent(listener),
    onReposChanged: (listener: () => void) =>
      service.runtime.onClientEvent((event) => {
        if (event.type === 'reposChanged') {
          listener()
        }
      }),
    readWorktreeChangeCount: async (worktreeId: string) => {
      const status = await service.runtime.gitCommands.getRuntimeGitStatus(worktreeId)
      return new Set(status.entries.map((entry) => entry.path)).size
    },
    readWorkbenchSessionContext: (worktreeIds: ReadonlySet<string>, maxChars?: number) =>
      readWorkbenchSessionContext(service.runtime, worktreeIds, maxChars),
    router: {
      ...nodeRuntimeHostRouter,
      shell: createBunShellHandlers({
        platformActions: options.platformActions,
        readMobileEndpoint: options.readMobileEndpoint,
        restartDaemon: options.restartDaemon,
        runtime: service.runtime,
        store: service.store,
        stats: service.stats,
        userDataPath: options.userDataPath
      })
    },
    requestBrowserCommand: <TResult>(method: string, input: unknown) => {
      // Why: the reverse-link contract validates each method result after dynamic dispatch.
      return requestShellBrowserCommand(undefined, { input, method }) as Promise<TResult>
    },
    runtimeId: service.runtime.getRuntimeId(),
    scanWorkspacePorts: (repoId?: string) => service.runtime.scanWorkspacePorts(repoId),
    sendWorkbenchAgentPrompt: async (terminalHandle: string, prompt: string) =>
      (await service.runtime.sendTerminalAgentPrompt(terminalHandle, prompt)).accepted,
    shellServices,
    shutdown: async () => {
      try {
        await service.shutdown()
      } finally {
        configureSkillBundleArtifactSources(null)
        agentHookServer.stop()
      }
    },
    startedAt: service.runtime.getStartedAt(),
    terminalEnvironment: agentHookServer.buildPtyEnv()
  }
}
