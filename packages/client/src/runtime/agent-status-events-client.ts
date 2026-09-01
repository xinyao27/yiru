import type { AgentStatusHostSnapshot } from '@yiru/runtime-protocol/contract'
import type {
  AgentStatusIpcPayload,
  MigrationUnsupportedPtyEntry
} from '@yiru/runtime-protocol/model/agent'

import { createRuntimeOrpcClient, type RuntimeClientTarget } from './orpc-client'

type AgentStatusEventHandlers = {
  onReady: (snapshot: AgentStatusHostSnapshot) => void
  onSet: (status: AgentStatusIpcPayload) => void
  onClear: (paneKey: string) => void
  onMigrationUnsupported: (entry: MigrationUnsupportedPtyEntry) => void
  onMigrationUnsupportedClear: (ptyId: string) => void
}

const AGENT_STATUS_RECONNECT_MS = 1_000

function agentStatusTarget(): RuntimeClientTarget | null {
  return { kind: 'local' }
}

export function subscribeAgentStatusEvents(handlers: AgentStatusEventHandlers): () => void {
  let cancelled = false
  let generation = 0
  let controller: AbortController | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  const openStream = (): void => {
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    controller?.abort()
    const target = agentStatusTarget()
    if (!target || cancelled) {
      return
    }
    const currentGeneration = ++generation
    const streamController = new AbortController()
    controller = streamController
    void (async () => {
      let connection: Awaited<ReturnType<typeof createRuntimeOrpcClient>> | null = null
      try {
        connection = await createRuntimeOrpcClient(target, {
          signal: streamController.signal
        })
        const stream = await connection.client.agentStatus.events.subscribe(undefined, {
          signal: streamController.signal
        })
        for await (const event of stream) {
          if (streamController.signal.aborted || currentGeneration !== generation) {
            return
          }
          if (event.type === 'ready') {
            handlers.onReady(event.snapshot)
          } else if (event.type === 'set') {
            handlers.onSet(event.status)
          } else if (event.type === 'clear') {
            handlers.onClear(event.paneKey)
          } else if (event.type === 'migrationUnsupported') {
            handlers.onMigrationUnsupported(event.entry)
          } else if (event.type === 'migrationUnsupportedClear') {
            handlers.onMigrationUnsupportedClear(event.ptyId)
          }
        }
      } catch {
        // Why: renderer teardown aborts the iterator; a dropped host stream is
        // retried below instead of surfacing a user-visible failure.
      } finally {
        connection?.close()
        if (!cancelled && !streamController.signal.aborted && currentGeneration === generation) {
          retryTimer = setTimeout(openStream, AGENT_STATUS_RECONNECT_MS)
        }
      }
    })()
  }

  openStream()
  return () => {
    cancelled = true
    generation += 1
    controller?.abort()
    if (retryTimer) {
      clearTimeout(retryTimer)
    }
  }
}
