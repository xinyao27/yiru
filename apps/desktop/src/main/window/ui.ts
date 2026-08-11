import { ipcMain } from 'electron'
import { isFeatureInteractionId } from '~shared/feature-interactions'
import type { PersistedUIState } from '~shared/types'

import type { Store } from '../persistence'
import { publishUIChangedEvent } from '../runtime/ui-events'

export function registerUIHandlers(store: Store): void {
  // Why: UI view-state is shared between every client through the runtime event
  // stream; publishing here makes Electron windows and paired clients peers.
  store.onUIChanged((ui) => {
    publishUIChangedEvent({ type: 'changed', ui })
  })

  ipcMain.handle('ui:get', () => {
    return store.getUI()
  })

  ipcMain.handle('ui:set', (_event, args: Partial<PersistedUIState>) => {
    store.updateUI(args)
  })

  ipcMain.handle('ui:recordFeatureInteraction', (_event, id: unknown) => {
    if (!isFeatureInteractionId(id)) {
      throw new Error('invalid_feature_interaction_id')
    }
    return store.recordFeatureInteraction(id)
  })
}
