import { join } from 'node:path'

import { app } from 'electron'

import { isAgentStatusHooksEnabled } from '../agent-hooks/managed-agent-hook-controls'
import {
  indexPersistedPaneKeyPtyIds,
  isLocalExecutionHost,
  resolveAgentWorkspaceExecutionHostId,
  sweepRestoredSubagentsWithoutLiveAgent
} from '../agent-hooks/restored-subagent-liveness-sweep'
import { agentHookServer } from '../agent-hooks/server'
import { getDaemonProvider, initDaemonPtyProvider } from '../daemon/init'
import type { Store } from '../persistence'
import { getPtyIdForPaneKey } from '../pty/pty'
import { classifyError } from '../telemetry/classify-error'
import { track } from '../telemetry/client'
import { logStartupMilestone } from './diagnostics'
import { startFirstWindowStartupServices } from './first-window-startup-services'

export type TerminalRuntimeStartup = {
  firstWindowReady: Promise<void>
  localPtyReady: Promise<void>
}

async function reapRestoredSubagentsWithoutLiveAgent(store: Store): Promise<void> {
  const provider = getDaemonProvider()
  if (!provider) {
    return
  }
  const persistedPtyIdByPaneKey = indexPersistedPaneKeyPtyIds(
    store.getWorkspaceSession().terminalLayoutsByTabId ?? {}
  )
  await sweepRestoredSubagentsWithoutLiveAgent({
    probeLiveLocalPty: (ptyId) => provider.probePtyLiveness(ptyId),
    isLocalExecutionHost: (worktreeId) =>
      isLocalExecutionHost(
        resolveAgentWorkspaceExecutionHostId(worktreeId, {
          getRepo: (repoId) => store.getRepo(repoId),
          getWorktreeMeta: (worktreeId) => store.getWorktreeMeta(worktreeId),
          getFolderWorkspace: (folderWorkspaceId) => store.getFolderWorkspace(folderWorkspaceId),
          getProjectGroups: () => store.getProjectGroups()
        })
      ),
    getBoundPtyIdForPaneKey: getPtyIdForPaneKey,
    getPersistedPtyIdForPaneKey: (paneKey) => persistedPtyIdByPaneKey.get(paneKey),
    reap: (isLocalHost, isLocalPaneAgentLive, isLocalPaneLivenessEvidenceCurrent) =>
      agentHookServer.reapRestoredClaudeSubagentsWithoutLiveAgent(
        isLocalHost,
        isLocalPaneAgentLive,
        isLocalPaneLivenessEvidenceCurrent
      )
  })
}

export function startTerminalRuntimeStartup(options: {
  store: Store
  agentHookEndpointNamespace?: string
}): TerminalRuntimeStartup {
  logStartupMilestone('first-window-startup-services-start')
  const agentHooksEnabled = isAgentStatusHooksEnabled(options.store.getSettings())
  const endpointRoot = join(app.getPath('userData'), 'agent-hooks')
  const agentHookEndpointDir = options.agentHookEndpointNamespace
    ? join(endpointRoot, options.agentHookEndpointNamespace)
    : endpointRoot
  const agentHookEnvironment = app.isPackaged ? 'production' : 'development'
  if (agentHooksEnabled) {
    agentHookServer.initializeForwardedHost({
      env: agentHookEnvironment,
      userDataPath: app.getPath('userData'),
      ...(options.agentHookEndpointNamespace
        ? { endpointNamespace: options.agentHookEndpointNamespace }
        : {})
    })
  }
  const startup = startFirstWindowStartupServices({
    startDaemonPtyProvider: async (signal) => {
      logStartupMilestone('startup-service-start', { service: 'daemon-pty-provider' })
      await initDaemonPtyProvider(
        signal,
        agentHooksEnabled
          ? {
              agentHookHost: {
                endpointDir: agentHookEndpointDir,
                env: agentHookEnvironment
              }
            }
          : {}
      )
      logStartupMilestone('startup-service-done', { service: 'daemon-pty-provider' })
    },
    startAgentHookServer: async () => {
      if (agentHooksEnabled) {
        logStartupMilestone('startup-service-start', { service: 'agent-hook-server' })
        logStartupMilestone('startup-service-done', { service: 'agent-hook-server' })
      }
    },
    onDaemonError: (error) => {
      const reason = error instanceof Error ? error.message : String(error)
      console.error(
        `[daemon] STARTUP FAILED — falling back to local PTYs; terminals will not persist across quit. Reason: ${reason}`
      )
      track('daemon_start_failed', classifyError(error))
    },
    onAgentHookServerError: (error) => {
      console.error('[agent-hooks] Failed to start local hook server:', error)
    }
  })
  void startup.firstWindowReady.then(() => {
    logStartupMilestone('first-window-startup-services-ready')
  })
  void startup.localPtyReady.then(() => {
    logStartupMilestone('local-pty-startup-ready')
    void reapRestoredSubagentsWithoutLiveAgent(options.store).catch((error) => {
      console.warn('[agent-hooks] restored-subagent liveness probe failed:', error)
    })
  })
  return startup
}
