import type { DirectSshAuthority } from '@yiru/runtime-protocol/ssh-connection'
import { toSshExecutionHostId } from '@yiru/workbench-model/workspace'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store'
import { acquireDirectSshDetectedWorktreeRefresh } from '~renderer/store/slices/worktrees'

import { createDirectSshConnectionStateController } from './connection-state'
import { createDirectSshHostHydration } from './host-hydration/hydration'
import {
  createDirectSshReconnectCoordinator,
  type DirectSshPreparationInput,
  type DirectSshPreparationReason
} from './reconnect/coordinator'
import { createDirectSshReconnectProductTelemetryAdapter } from './reconnect/product-telemetry'
import { directSshAuthoritiesEqual } from './reconnect/tokens'
import {
  createRemoteWorkspaceTargetSync,
  type RemoteWorkspaceTargetSync
} from './remote-workspace/target-sync'
import { createDirectSshWorktreeRefreshScheduler } from './worktree-refresh/scheduler'

export type DirectSshRuntimeController = {
  handleStateChangedEvent: (data: { targetId: string; state: unknown }) => void
  start: () => void
  stop: () => void
}

export function createDirectSshRuntimeController(): DirectSshRuntimeController {
  const reconnectAuthorityByTarget = new Map<string, DirectSshAuthority>()
  const unsubs: (() => void)[] = []
  let remoteWorkspaceTargetSync: RemoteWorkspaceTargetSync | null = null
  let remoteWorkspaceClientId: string | null = null
  let remoteWorkspaceClientIdPromise: Promise<string | null> | null = null
  let started = false
  let stopped = false

  const currentAuthority = (targetId: string): DirectSshAuthority | null => {
    const state = useAppStore.getState().sshConnectionStates.get(targetId)
    if (
      state?.status !== 'connected' ||
      state.targetId !== targetId ||
      !state.providerEpoch ||
      state.connectionGeneration === undefined
    ) {
      return null
    }
    return {
      targetId,
      providerEpoch: state.providerEpoch,
      connectionGeneration: state.connectionGeneration
    }
  }

  const refreshScheduler = createDirectSshWorktreeRefreshScheduler({
    startAttempt: (key) => {
      const acquired = acquireDirectSshDetectedWorktreeRefresh(useAppStore, {
        repoId: key.repoId,
        executionHostId: key.executionHostId,
        authority: {
          targetId: key.targetId,
          providerEpoch: key.providerEpoch,
          connectionGeneration: key.connectionGeneration
        },
        requireAuthoritative: key.authorityRequirement === 'required'
      })
      return {
        providerRequestId: acquired.providerRequestId,
        result: acquired.result.then((result) => acquired.merge(result)),
        cancel: acquired.release
      }
    }
  })
  const hostHydration = createDirectSshHostHydration({
    store: useAppStore,
    isCurrentAuthority: (authority) =>
      directSshAuthoritiesEqual(currentAuthority(authority.targetId), authority),
    listRepos: (authority) =>
      window.api.repos.listForExecutionHost({
        executionHostId: toSshExecutionHostId(authority.targetId),
        expectedAuthority: authority
      }),
    listLineage: (authority) =>
      window.api.worktrees.listLineageForHost({
        executionHostId: toSshExecutionHostId(authority.targetId),
        expectedAuthority: authority
      })
  })
  const terminalActions = () => useAppStore.getState()
  const reconnectCoordinator = createDirectSshReconnectCoordinator({
    scheduler: refreshScheduler,
    isCurrentConnectedAuthority: (authority) =>
      directSshAuthoritiesEqual(currentAuthority(authority.targetId), authority),
    capturePreparationInput: hostHydration.capturePreparationInput,
    readHostScopedLineage: hostHydration.readHostScopedLineage,
    invalidateStaleTerminalBindings: (authority) =>
      terminalActions().invalidateStaleDirectSshTargetPtyBindings(authority),
    retryTargetPanes: (authority) => terminalActions().retryDirectSshTargetPanes(authority),
    finalizeHydratedTerminalPanes: (authority) =>
      terminalActions().retryDirectSshTargetPanes(authority),
    correctUnboundTerminalPanes: (authority) =>
      terminalActions().retryDirectSshTargetPanes(authority),
    syncRemoteWorkspaceAfterConnect: (token) => remoteWorkspaceTargetSync?.syncAfterConnect(token),
    onTelemetry: createDirectSshReconnectProductTelemetryAdapter()
  })

  if (window.api.remoteWorkspace) {
    remoteWorkspaceTargetSync = createRemoteWorkspaceTargetSync({
      store: useAppStore,
      remoteWorkspace: window.api.remoteWorkspace,
      getCurrentAuthority: currentAuthority,
      isPreparationTokenCurrent: hostHydration.isPreparationTokenCurrent,
      capturePreparationInput: (authority, reason, snapshotRevision) =>
        hostHydration.capturePreparationInput(authority, reason, snapshotRevision),
      prepareOnly: reconnectCoordinator.prepareOnly,
      finalizeHydratedTerminals: (authority) =>
        directSshAuthoritiesEqual(reconnectAuthorityByTarget.get(authority.targetId), authority)
          ? reconnectCoordinator.finalizeHydratedTerminals(authority)
          : 0
    })
  }

  const prepareAndSync = async (
    authority: DirectSshAuthority,
    reason: DirectSshPreparationReason,
    options?: { authorityAlreadyReplaced?: boolean }
  ): Promise<void> => {
    try {
      if (!options?.authorityAlreadyReplaced) {
        reconnectCoordinator.replaceAuthority(authority)
      }
      const input: DirectSshPreparationInput | null = await hostHydration.capturePreparationInput(
        authority,
        reason
      )
      if (!input) {
        return
      }
      const prepared = await reconnectCoordinator.prepareOnly(input)
      if (prepared.token && hostHydration.isPreparationTokenCurrent(prepared.token)) {
        await remoteWorkspaceTargetSync?.syncAfterConnect(prepared.token)
      }
    } catch (error) {
      if (directSshAuthoritiesEqual(currentAuthority(authority.targetId), authority)) {
        useAppStore.getState().setRemoteWorkspaceSyncStatus(authority.targetId, {
          phase: 'error',
          message:
            error instanceof Error
              ? error.message
              : translate('auto.hooks.useIpcEvents.2fe88c2e06', 'Remote workspace sync unavailable')
        })
      }
    }
  }

  const connectionState = createDirectSshConnectionStateController({
    coordinator: reconnectCoordinator,
    currentAuthority,
    terminalActions,
    prepareAndSync: (authority, reason, options) => void prepareAndSync(authority, reason, options),
    rememberReconnectAuthority: (targetId, authority) => {
      if (authority) {
        reconnectAuthorityByTarget.set(targetId, authority)
      } else {
        reconnectAuthorityByTarget.delete(targetId)
      }
    }
  })

  const getRemoteWorkspaceClientId = (): Promise<string | null> => {
    const remoteWorkspace = window.api.remoteWorkspace
    if (!remoteWorkspace) {
      return Promise.resolve(null)
    }
    if (remoteWorkspaceClientId) {
      return Promise.resolve(remoteWorkspaceClientId)
    }
    remoteWorkspaceClientIdPromise ??= remoteWorkspace
      .clientId()
      .then((id) => {
        remoteWorkspaceClientId = id
        return id
      })
      .catch(() => null)
    return remoteWorkspaceClientIdPromise
  }

  return {
    handleStateChangedEvent: connectionState.handleStateChangedEvent,
    start: () => {
      if (started || stopped) {
        return
      }
      started = true
      connectionState.start()
      unsubs.push(
        window.api.ssh.onCredentialRequest((data) => {
          useAppStore.getState().enqueueSshCredentialRequest(data)
        }),
        window.api.ssh.onCredentialResolved(({ requestId }) => {
          useAppStore.getState().removeSshCredentialRequest(requestId)
        }),
        window.api.ssh.onPortForwardsChanged(({ targetId, forwards }) => {
          useAppStore.getState().setPortForwards(targetId, forwards)
        }),
        window.api.ssh.onDetectedPortsChanged(({ targetId, ports }) => {
          useAppStore.getState().setDetectedPorts(targetId, ports)
        })
      )
      if (!window.api.remoteWorkspace) {
        return
      }
      void getRemoteWorkspaceClientId()
      unsubs.push(
        window.api.remoteWorkspace.onChanged((event) => {
          void (async () => {
            const clientId = await getRemoteWorkspaceClientId()
            if (event.sourceClientId && clientId && event.sourceClientId === clientId) {
              return
            }
            await remoteWorkspaceTargetSync
              ?.applyUnsolicitedSnapshot(event.targetId, event.snapshot)
              .catch((error) => {
                useAppStore.getState().setRemoteWorkspaceSyncStatus(event.targetId, {
                  phase: 'error',
                  revision: event.snapshot.revision,
                  message:
                    error instanceof Error
                      ? error.message
                      : translate(
                          'auto.hooks.useIpcEvents.2fe88c2e06',
                          'Remote workspace sync unavailable'
                        )
                })
              })
          })()
        })
      )
    },
    stop: () => {
      if (stopped) {
        return
      }
      stopped = true
      unsubs.forEach((unsubscribe) => unsubscribe())
      connectionState.stop()
      remoteWorkspaceTargetSync?.stop()
      hostHydration.stop()
      reconnectCoordinator.stop()
      reconnectAuthorityByTarget.clear()
    }
  }
}
