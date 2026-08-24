import {
  getSyntheticAgentTitleProfile,
  shouldDriveSyntheticAgentTitleFromHook
} from '~shared/synthetic-agent-title'

import { setMigrationUnsupportedPtyListener } from '../agent-hooks/migration-unsupported-pty-state'
import { agentHookServer } from '../agent-hooks/server'
import {
  shouldSuppressCodexAutoApprovalSyntheticTitle,
  type SyntheticTitleController
} from '../pty/synthetic-title-controller'
import { publishAgentStatusEvent } from '../runtime/agent-status-events'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'

type FirstWorkRenameHandler = (event: {
  paneKey: string
  tabId: string | undefined
  worktreeId: string | undefined
  payload: { state: string; prompt?: string; lastAssistantMessage?: string }
  isReplay: boolean | undefined
}) => void

export function registerMainWindowAgentStatus(options: {
  runtime: YiruRuntimeService
  syntheticTitles: SyntheticTitleController
  renameFirstWork: FirstWorkRenameHandler
  recordCrashBreadcrumb: (agentType: string, state: string) => void
}): () => void {
  agentHookServer.setListener(
    ({
      paneKey,
      tabId,
      worktreeId,
      connectionId,
      payload,
      receivedAt,
      stateStartedAt,
      launchToken,
      providerSession,
      providerSessionOnly,
      promptInteractionKey,
      isReplay
    }) => {
      if (providerSessionOnly) {
        publishAgentStatusEvent({
          type: 'set',
          status: {
            ...payload,
            paneKey,
            ...(launchToken ? { launchToken } : {}),
            tabId,
            worktreeId,
            connectionId,
            receivedAt,
            stateStartedAt,
            ...(providerSession ? { providerSession } : {}),
            providerSessionOnly: true
          }
        })
        return
      }

      options.renameFirstWork({ paneKey, tabId, worktreeId, payload, isReplay })
      const orchestration = options.runtime.getAgentStatusOrchestrationContextForPaneKey(paneKey)
      const terminalHandle = options.runtime.getAgentStatusTerminalHandleForPaneKey(paneKey)
      publishAgentStatusEvent({
        type: 'set',
        status: {
          ...payload,
          paneKey,
          ...(launchToken ? { launchToken } : {}),
          ...(terminalHandle ? { terminalHandle } : {}),
          tabId,
          worktreeId,
          connectionId,
          receivedAt,
          stateStartedAt,
          ...(providerSession ? { providerSession } : {}),
          ...(promptInteractionKey ? { promptInteractionKey } : {}),
          ...(orchestration ? { orchestration } : {})
        }
      })
      options.recordCrashBreadcrumb(payload.agentType ?? 'unknown', payload.state)

      const profile = getSyntheticAgentTitleProfile(payload.agentType)
      const suppressAutoApprovalTitle =
        payload.agentType === 'codex' &&
        (payload.state === 'waiting' || payload.state === 'blocked') &&
        shouldSuppressCodexAutoApprovalSyntheticTitle({
          agentType: payload.agentType,
          state: payload.state,
          launchConfig: options.runtime.getAgentStatusLaunchConfigForPaneKey(paneKey, {
            launchToken
          })
        })
      if (
        profile &&
        shouldDriveSyntheticAgentTitleFromHook(payload.agentType, payload.state) &&
        !suppressAutoApprovalTitle
      ) {
        options.syntheticTitles.driveFromHook(paneKey, payload.state, profile)
      }
    }
  )
  agentHookServer.setPaneStatusClearListener((paneKey) => {
    publishAgentStatusEvent({ type: 'clear', paneKey })
  })
  setMigrationUnsupportedPtyListener((event) => {
    publishAgentStatusEvent(
      event.type === 'set'
        ? { type: 'migrationUnsupported', entry: event.entry }
        : { type: 'migrationUnsupportedClear', ptyId: event.ptyId }
    )
  })

  return () => {
    agentHookServer.setListener(null)
    agentHookServer.setPaneStatusClearListener(null)
    setMigrationUnsupportedPtyListener(null)
  }
}
