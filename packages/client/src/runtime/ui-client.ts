import type {
  RuntimeFeatureInteractionId,
  RuntimePersistedUIState,
  RuntimeUISubscriptionEvent,
  UIUpdateInput
} from '@yiru/runtime-protocol/contract'
import { normalizeFeatureInteractions } from '~shared/feature-interactions'
import type { GlobalSettings, PersistedUIState } from '~shared/types'

import { callRuntimeOrpc, createLocalRuntimeOrpcClient, isWebRuntimeClient } from './orpc-client'
import { getActiveRuntimeTarget } from './rpc-client'
import { createRuntimeStreamFanOut } from './stream-fan-out'
import {
  mergeWebContextualTourSeenIds,
  mergeWebFeatureInteractionState,
  mergeWebUIState,
  readWebUIState,
  writeWebUIState
} from './web-ui-state'

type RuntimeEnvironmentSettings =
  | Pick<GlobalSettings, 'activeRuntimeEnvironmentId'>
  | null
  | undefined

function mergeRuntimeUIIntoWebState(incoming: RuntimePersistedUIState): PersistedUIState {
  const local = readWebUIState()
  const next = {
    ...mergeWebUIState(local, incoming),
    featureInteractions: mergeWebFeatureInteractionState(
      local.featureInteractions,
      incoming.featureInteractions
    ),
    contextualToursSeenIds: mergeWebContextualTourSeenIds(
      local.contextualToursSeenIds,
      incoming.contextualToursSeenIds
    )
  }
  writeWebUIState(next)
  return next
}

const uiEvents = createRuntimeStreamFanOut({
  resolveClient: async () => (await createLocalRuntimeOrpcClient()).client,
  open: (client, signal) => client.ui.events.subscribe(undefined, { signal })
})

export function subscribeRuntimeUIChanges(
  listener: (ui: RuntimePersistedUIState) => void
): () => void {
  return uiEvents.subscribe((event: RuntimeUISubscriptionEvent) => {
    if (event.type !== 'changed') {
      return
    }
    // Why: the web adapter owns offline/localStorage merge semantics. Treat
    // the runtime event as an invalidation and re-read through that adapter.
    void getRuntimeUIState(null).then(listener).catch(console.error)
  })
}

export async function getRuntimeUIState(
  settings: RuntimeEnvironmentSettings
): Promise<RuntimePersistedUIState> {
  if (isWebRuntimeClient()) {
    try {
      const result = await callRuntimeOrpc(
        getActiveRuntimeTarget(settings),
        (client) => client.ui.get,
        undefined,
        { timeoutMs: 15_000 }
      )
      return mergeRuntimeUIIntoWebState(result.ui)
    } catch {
      return readWebUIState()
    }
  }
  const result = await callRuntimeOrpc(
    getActiveRuntimeTarget(settings),
    (client) => client.ui.get,
    undefined
  )
  return result.ui
}

export async function setRuntimeUIState(
  settings: RuntimeEnvironmentSettings,
  updates: UIUpdateInput
): Promise<void> {
  if (isWebRuntimeClient()) {
    const next = mergeWebUIState(readWebUIState(), updates as Partial<PersistedUIState>)
    writeWebUIState(next)
    try {
      await callRuntimeOrpc(getActiveRuntimeTarget(settings), (client) => client.ui.set, updates, {
        timeoutMs: 15_000
      })
    } catch {
      // Why: unpaired web clients still need browser-local UI persistence.
    }
    return
  }
  await callRuntimeOrpc(getActiveRuntimeTarget(settings), (client) => client.ui.set, updates)
}

export async function recordRuntimeUIFeatureInteraction(
  settings: RuntimeEnvironmentSettings,
  id: RuntimeFeatureInteractionId
): Promise<RuntimePersistedUIState> {
  if (isWebRuntimeClient()) {
    const current = readWebUIState()
    const featureInteractions = normalizeFeatureInteractions(current.featureInteractions)
    const existing = featureInteractions[id]
    const optimistic = mergeWebUIState(current, {
      featureInteractions: {
        ...featureInteractions,
        [id]: {
          firstInteractedAt: existing?.firstInteractedAt ?? Date.now(),
          interactionCount: (existing?.interactionCount ?? 0) + 1
        }
      }
    })
    writeWebUIState(optimistic)
    try {
      const result = await callRuntimeOrpc(
        getActiveRuntimeTarget(settings),
        (client) => client.ui.recordFeatureInteraction,
        id,
        { timeoutMs: 15_000 }
      )
      return mergeRuntimeUIIntoWebState(result.ui)
    } catch {
      return optimistic
    }
  }
  const result = await callRuntimeOrpc(
    getActiveRuntimeTarget(settings),
    (client) => client.ui.recordFeatureInteraction,
    id
  )
  return result.ui
}
