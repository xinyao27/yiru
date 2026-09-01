import { enrichAgentStatusIpcPayload } from '~main/agents/hooks/agent-status-ipc-boundary'
import { setMigrationUnsupportedPtyListener } from '~main/agents/hooks/migration-unsupported-pty-state'
import { agentHookServer } from '~main/agents/hooks/server'
import type { Store } from '~main/persistence/store'
import { subscribeWorkspacePortAdvertisedUrlChanges } from '~main/ports/workspace-ports'

import { setHostProgressEventPublisher } from '../host-progress-events'
import { setSkillUpdateRunEventPublisher } from '../skill-update-run-events'
import type { YiruRuntimeService } from '../yiru-runtime'

export function attachNodeRuntimeHostEventSources(
  runtime: YiruRuntimeService,
  store: Store
): () => void {
  const detachAgentStatus = attachAgentStatusSource(runtime)

  // Why: host settings RPCs notify this same Store; bridge those real mutations
  // directly because browser-host registration is outside the daemon process.
  const unsubscribeSettings = store.onSettingsChanged((updates) => {
    runtime.emitSettingsChangedEvent({ type: 'changed', updates })
  })

  // Why: host UI RPCs persist into this Store too, so its change notification
  // is the authoritative source even when no browser client is connected.
  const unsubscribeUI = store.onUIChanged((ui) => {
    runtime.emitUIChangedEvent({ type: 'changed', ui })
  })

  // Why: skill mutations exposed by this host use the process-wide skill runner;
  // its publisher carries actual run transitions, not a synthetic readiness event.
  setSkillUpdateRunEventPublisher((event) => runtime.emitSkillUpdateRunEvent(event))

  // Why: host worktree operations reach this publisher from deep repo code, while
  // runtime-owned progress already emits directly; both feed one real stream.
  setHostProgressEventPublisher((event) => runtime.emitHostProgressEvent(event))

  const unsubscribeWorkspacePorts = subscribeWorkspacePortAdvertisedUrlChanges(store, (event) =>
    runtime.emitWorkspacePortAdvertisedUrlChangedEvent(event)
  )

  return () => {
    detachAgentStatus()
    unsubscribeSettings()
    unsubscribeUI()
    unsubscribeWorkspacePorts()
    setSkillUpdateRunEventPublisher(() => {})
    setHostProgressEventPublisher(() => {})
  }
}

function attachAgentStatusSource(runtime: YiruRuntimeService): () => void {
  // Why: the Node daemon ingests real hook envelopes into this server. Resolve
  // its canonical cached payload so the host stream preserves IPC enrichment.
  agentHookServer.setListener(({ paneKey }) => {
    const status = agentHookServer.getStatusSnapshot().find((entry) => entry.paneKey === paneKey)
    if (!status) {
      return
    }
    runtime.emitAgentStatusEvent({
      type: 'set',
      status: enrichAgentStatusIpcPayload(status, status.providerSessionOnly ? undefined : runtime)
    })
  })
  agentHookServer.setPaneStatusClearListener((paneKey) => {
    runtime.emitAgentStatusEvent({ type: 'clear', paneKey })
  })
  setMigrationUnsupportedPtyListener((event) => {
    runtime.emitAgentStatusEvent(
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
