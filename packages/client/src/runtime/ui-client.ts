import type {
  RuntimeFeatureInteractionId,
  RuntimePersistedUIState,
  RuntimeUISubscriptionEvent,
  UIUpdateInput
} from '@yiru/runtime-protocol/contract'
import type { GlobalSettings } from '@yiru/runtime-protocol/workbench/types'

import { callRuntimeOrpc, createLocalRuntimeOrpcClient } from './orpc-client'
import { getActiveRuntimeTarget } from './rpc-client'
import { createRuntimeStreamFanOut } from './stream-fan-out'

type RuntimeEnvironmentSettings =
  | Pick<GlobalSettings, 'activeRuntimeEnvironmentId'>
  | null
  | undefined

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
    void getRuntimeUIState(null).then(listener).catch(console.error)
  })
}

export async function getRuntimeUIState(
  settings: RuntimeEnvironmentSettings
): Promise<RuntimePersistedUIState> {
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
  await callRuntimeOrpc(getActiveRuntimeTarget(settings), (client) => client.ui.set, updates)
}

export async function recordRuntimeUIFeatureInteraction(
  settings: RuntimeEnvironmentSettings,
  id: RuntimeFeatureInteractionId
): Promise<RuntimePersistedUIState> {
  const result = await callRuntimeOrpc(
    getActiveRuntimeTarget(settings),
    (client) => client.ui.recordFeatureInteraction,
    id
  )
  return result.ui
}
