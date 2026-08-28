import type { IDisposable } from '@xterm/xterm'

import type { ManagedPane } from '../pane-manager/pane-manager'
import { discardTerminalOutput } from '../pane-manager/pane-terminal-output-scheduler'
import { cancelPendingSafeFitContinuations } from '../pane-manager/pane-tree-ops'
import type { TerminalStructuralReplayCoordinator } from '../pane-manager/terminal-structural-replay-coordinator'
import type { HasPty } from '../terminal-dead-session-reconcile'
import type { AgentPaneSession } from './agent-pane-session'
import type { ConnectionStart } from './connection-start'
import type { GeometrySession } from './geometry-session'
import type { HibernatedAgentWake } from './hibernated-agent-wake'
import type { SessionReconciler } from './session-reconciler'
import type { StartupConnectGate } from './startup-connect-gate'
import type { StartupLaunch } from './startup-launch'
import type { TerminalInput } from './terminal-input'
import type { TransportIo } from './transport-io'

const SHIFT_ENTER_RECONFIRM_IDLE_MS = 350

export type PanePtyBinding = IDisposable & {
  syncProcessTracking: () => void
  noteVisibilityResume: () => void
  wakeHibernatedAgentIfArmed: (claimedProviderSessions?: Set<string>) => string | null
  sampleForegroundAgentOnFocus: () => void
  requestDroidReconfirmation: () => void
  reconcileIfSessionDead: (liveSessionIds: Set<string>, snapshotRequestedAt?: number) => void
  reconcileIfSessionMissing: (hasPty: HasPty, livenessRequestedAt?: number) => void
}

type ConnectionLifecycleOptions = {
  pane: ManagedPane
  setDisposed: () => void
  unregisterRecovery: () => void
  transportIo: TransportIo
  connectionStart: ConnectionStart
  structuralCoordinator: TerminalStructuralReplayCoordinator
  startupConnectGate: StartupConnectGate
  geometry: GeometrySession
  agentPaneSession: AgentPaneSession
  waitTeardowns: (() => void)[]
  startupLaunch: StartupLaunch
  dropSideEffectFacts: () => void
  clearPaneBinding: () => void
  disposeWindowsModeReset: () => void
  terminalInput: TerminalInput
  hibernatedAgentWake: HibernatedAgentWake
  sessionReconciler: SessionReconciler
}

export function createConnectionLifecycle(options: ConnectionLifecycleOptions): PanePtyBinding {
  let shiftEnterReconfirmTimer: ReturnType<typeof setTimeout> | null = null
  const sampleForegroundAgent = (): void => {
    options.agentPaneSession.requestKnownDroidReconfirmation()
    options.agentPaneSession.sampleVisibleForegroundAgent()
  }

  return {
    syncProcessTracking: options.agentPaneSession.startProcessTracking,
    noteVisibilityResume: () => {
      options.geometry.requestReassertion()
      options.hibernatedAgentWake.consume()
      sampleForegroundAgent()
    },
    wakeHibernatedAgentIfArmed: options.hibernatedAgentWake.wakeIfArmed,
    sampleForegroundAgentOnFocus: sampleForegroundAgent,
    requestDroidReconfirmation: () => {
      if (shiftEnterReconfirmTimer !== null) {
        clearTimeout(shiftEnterReconfirmTimer)
      }
      shiftEnterReconfirmTimer = setTimeout(() => {
        shiftEnterReconfirmTimer = null
        sampleForegroundAgent()
      }, SHIFT_ENTER_RECONFIRM_IDLE_MS)
    },
    reconcileIfSessionDead: options.sessionReconciler.reconcileDead,
    reconcileIfSessionMissing: options.sessionReconciler.reconcileMissing,
    dispose: () => {
      options.setDisposed()
      cancelPendingSafeFitContinuations(options.pane)
      options.unregisterRecovery()
      options.transportIo.dispose()
      options.connectionStart.disposeReattachOutput()
      options.structuralCoordinator.dispose()
      options.connectionStart.cancelFreshSpawnFollow()
      options.startupConnectGate.dispose()
      options.geometry.dispose()
      options.agentPaneSession.disposeBeforeStartup()
      if (shiftEnterReconfirmTimer !== null) {
        clearTimeout(shiftEnterReconfirmTimer)
        shiftEnterReconfirmTimer = null
      }
      while (options.waitTeardowns.length > 0) {
        options.waitTeardowns.pop()?.()
      }
      options.connectionStart.disposeStartupSession()
      options.startupLaunch.releaseUnattemptedDraftPaste()
      options.agentPaneSession.disposeBeforeOutput()
      options.connectionStart.disposeOutputSession()
      options.dropSideEffectFacts()
      options.clearPaneBinding()
      discardTerminalOutput(options.pane.terminal)
      options.disposeWindowsModeReset()
      options.terminalInput.dispose()
      options.agentPaneSession.disposeAfterOutput()
    }
  }
}
