import type { DirectSshAuthority, SshConnectionState } from '@yiru/runtime-protocol/ssh-connection'
import { useAppStore } from '~renderer/store'
import type { AppState } from '~renderer/store/types'

import type { DirectSshReconnectCoordinator } from './reconnect/coordinator-contract'
import type { DirectSshPreparationReason } from './reconnect/coordinator-contract'
import { isDirectSshReconnectCoordinatorRoutingEnabled } from './reconnect/rollout'
import {
  registerDirectSshWakeRouting,
  routeDirectSshConnectedState,
  type DirectSshConnectedStateOrigin
} from './reconnect/state-routing'
import { directSshAuthoritiesEqual } from './reconnect/tokens'

type DirectSshTerminalActions = Pick<
  AppState,
  | 'clearDirectSshTargetPtyBindings'
  | 'invalidateStaleDirectSshTargetPtyBindings'
  | 'retryDirectSshTargetPanes'
>

export type DirectSshConnectionStateController = {
  handleStateChangedEvent: (data: { targetId: string; state: unknown }) => void
  start: () => void
  stop: () => void
}

export function createDirectSshConnectionStateController(args: {
  coordinator: DirectSshReconnectCoordinator
  currentAuthority: (targetId: string) => DirectSshAuthority | null
  terminalActions: () => DirectSshTerminalActions
  prepareAndSync: (
    authority: DirectSshAuthority,
    reason: DirectSshPreparationReason,
    options?: { authorityAlreadyReplaced?: boolean }
  ) => void
  rememberReconnectAuthority: (targetId: string, authority: DirectSshAuthority | null) => void
}): DirectSshConnectionStateController {
  const authorityReconciliationDeadlines = new Set<{
    timer: ReturnType<typeof setTimeout>
    settle: () => void
  }>()
  const sshStateWatermarkByTargetId = new Map<string, number>()
  const latestStateEventByTargetId = new Map<string, number>()
  const unsubs: (() => void)[] = []
  let stateEventId = 0
  let started = false
  let stopped = false

  const reconcileAuthority = (
    targetId: string,
    initiatingState: SshConnectionState,
    origin: DirectSshConnectedStateOrigin,
    watermark: number
  ): void => {
    let pendingDeadline: { timer: ReturnType<typeof setTimeout>; settle: () => void } | undefined
    const deadline = new Promise<null>((resolve) => {
      const settle = (): void => resolve(null)
      const timer = setTimeout(settle, 5_000)
      pendingDeadline = { timer, settle }
      authorityReconciliationDeadlines.add(pendingDeadline)
    })
    void Promise.race([window.api.ssh.getState({ targetId }).catch(() => null), deadline])
      .then((latest) => {
        if (
          stopped ||
          latest?.targetId !== targetId ||
          !latest.providerEpoch ||
          latest.connectionGeneration === undefined ||
          sshStateWatermarkByTargetId.get(targetId) !== watermark
        ) {
          return
        }
        const current = useAppStore.getState().sshConnectionStates.get(targetId)
        if (
          current?.status !== initiatingState.status ||
          latest.status !== initiatingState.status ||
          current.providerEpoch !== initiatingState.providerEpoch ||
          current.connectionGeneration !== initiatingState.connectionGeneration ||
          (current.providerEpoch != null && current.providerEpoch !== latest.providerEpoch) ||
          (current.connectionGeneration !== undefined &&
            current.connectionGeneration !== latest.connectionGeneration)
        ) {
          return
        }
        applyConnectionState(
          targetId,
          {
            ...current,
            providerEpoch: latest.providerEpoch,
            connectionGeneration: latest.connectionGeneration
          },
          origin
        )
      })
      .catch(() => undefined)
      .finally(() => {
        if (pendingDeadline) {
          clearTimeout(pendingDeadline.timer)
          authorityReconciliationDeadlines.delete(pendingDeadline)
        }
      })
  }

  const applyConnectionState = (
    targetId: string,
    state: SshConnectionState,
    origin: DirectSshConnectedStateOrigin
  ): void => {
    const store = useAppStore.getState()
    const previous = store.sshConnectionStates.get(targetId)
    store.setSshConnectionState(targetId, state)

    if (['disconnected', 'auth-failed', 'reconnection-failed', 'error'].includes(state.status)) {
      args.rememberReconnectAuthority(targetId, null)
      args.coordinator.invalidate(targetId)
      store.clearRemoteDetectedAgents(targetId)
      store.clearPortForwards(targetId)
      store.setDetectedPorts(targetId, [])
      store.clearDirectSshTargetPtyBindings(targetId)
      return
    }
    if (state.status !== 'connected') {
      return
    }
    const authority = args.currentAuthority(targetId)
    if (!authority) {
      reconcileAuthority(targetId, state, origin, sshStateWatermarkByTargetId.get(targetId) ?? 0)
      return
    }
    const previousAuthority =
      previous?.status === 'connected' &&
      previous.providerEpoch &&
      previous.connectionGeneration !== undefined
        ? {
            targetId,
            providerEpoch: previous.providerEpoch,
            connectionGeneration: previous.connectionGeneration
          }
        : null
    routeDirectSshConnectedState(
      {
        coordinator: args.coordinator,
        coordinatorRoutingEnabled: isDirectSshReconnectCoordinatorRoutingEnabled(),
        invalidateStaleTerminalBindings: (nextAuthority) =>
          args.terminalActions().invalidateStaleDirectSshTargetPtyBindings(nextAuthority),
        retryTargetPanes: (nextAuthority) =>
          args.terminalActions().retryDirectSshTargetPanes(nextAuthority),
        prepareAndSync: args.prepareAndSync,
        rememberReconnectAuthority: (nextAuthority) =>
          args.rememberReconnectAuthority(targetId, nextAuthority)
      },
      { authority, previousAuthority, origin }
    )
  }

  const handleStateChangedEvent = (data: { targetId: string; state: unknown }): void => {
    const store = useAppStore.getState()
    const state = data.state as SshConnectionState
    const eventId = ++stateEventId
    sshStateWatermarkByTargetId.set(
      data.targetId,
      (sshStateWatermarkByTargetId.get(data.targetId) ?? 0) + 1
    )
    latestStateEventByTargetId.set(data.targetId, eventId)
    if (!store.sshTargetLabels.has(data.targetId)) {
      window.api.ssh
        .listTargets()
        .catch(() => window.api.ssh.listTargets())
        .then((targets) => {
          if (latestStateEventByTargetId.get(data.targetId) !== eventId) {
            return
          }
          latestStateEventByTargetId.delete(data.targetId)
          if (stopped) {
            return
          }
          const latestStore = useAppStore.getState()
          if (!targets.some((target) => target.id === data.targetId)) {
            latestStore.clearRemovedSshTargetState(data.targetId)
            return
          }
          latestStore.setSshTargetsMetadata(targets)
          applyConnectionState(data.targetId, state, 'push')
        })
        .catch(() => {
          if (!stopped && latestStateEventByTargetId.get(data.targetId) === eventId) {
            latestStateEventByTargetId.delete(data.targetId)
            applyConnectionState(data.targetId, state, 'push')
          }
        })
      return
    }
    latestStateEventByTargetId.delete(data.targetId)
    applyConnectionState(data.targetId, state, 'push')
  }

  const hydrateTargets = async (): Promise<void> => {
    try {
      const targets = await window.api.ssh.listTargets()
      if (stopped) {
        return
      }
      useAppStore.getState().setSshTargetsMetadata(targets)
      try {
        const removedLabels = await window.api.ssh.listRemovedTargetLabels()
        if (stopped) {
          return
        }
        useAppStore.getState().setRemovedSshTargetLabels(removedLabels)
      } catch {
        // Why: a missing tombstone map can safely fall back to the raw target id.
      }
      for (const target of targets) {
        const hydrationWatermark = sshStateWatermarkByTargetId.get(target.id) ?? 0
        const state = await window.api.ssh.getState({ targetId: target.id })
        if (
          stopped ||
          !state ||
          (sshStateWatermarkByTargetId.get(target.id) ?? 0) !== hydrationWatermark
        ) {
          continue
        }
        applyConnectionState(target.id, state, 'initial-hydration')
        if (state.status !== 'connected') {
          continue
        }
        const authority = args.currentAuthority(target.id)
        const [forwards, detected] = await Promise.all([
          window.api.ssh.listPortForwards({ targetId: target.id }),
          window.api.ssh.listDetectedPorts({ targetId: target.id })
        ])
        if (
          !stopped &&
          authority &&
          directSshAuthoritiesEqual(args.currentAuthority(target.id), authority)
        ) {
          useAppStore.getState().setPortForwards(target.id, forwards)
          useAppStore.getState().setDetectedPorts(target.id, detected)
        }
      }
    } catch {
      // Why: SSH is optional, so startup hydration has no required failure surface.
    }
  }

  return {
    handleStateChangedEvent,
    start: () => {
      if (started || stopped) {
        return
      }
      started = true
      void hydrateTargets()
      unsubs.push(window.api.ssh.onStateChanged(handleStateChangedEvent))
      unsubs.push(
        registerDirectSshWakeRouting({
          getConnectionStates: () => useAppStore.getState().sshConnectionStates,
          wakeAuthority: (authority) => {
            args.coordinator.correctUnboundTerminals(authority, 'wake-refresh')
            args.prepareAndSync(authority, 'wake-refresh')
          },
          ...(typeof window.api.ui.onSystemResumed === 'function'
            ? { onSystemResumed: window.api.ui.onSystemResumed }
            : {})
        })
      )
    },
    stop: () => {
      if (stopped) {
        return
      }
      stopped = true
      unsubs.forEach((unsubscribe) => unsubscribe())
      for (const deadline of authorityReconciliationDeadlines) {
        clearTimeout(deadline.timer)
        deadline.settle()
      }
      authorityReconciliationDeadlines.clear()
      latestStateEventByTargetId.clear()
    }
  }
}
