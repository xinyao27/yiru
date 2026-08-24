import type { StateCreator } from 'zustand'
import { addAdditionalValidWorkspaceKeys } from '~renderer/lib/workspace-session-hydration-keys'
import { folderWorkspaceKey } from '~shared/workspace/scope'

import type { AppState } from '../types'
import type { TabsSlice } from './tabs'
import { buildHydratedTabState } from './tabs-hydration'

export function createHydrationActions(
  set: Parameters<StateCreator<AppState, [], [], TabsSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], TabsSlice>>[1]
): Pick<TabsSlice, 'hydrateTabsSession'> {
  return {
    hydrateTabsSession: (session, options) => {
      const state = get()
      const validWorktreeIds = new Set(
        Object.values(state.worktreesByRepo)
          .flat()
          .map((w) => w.id)
      )
      for (const workspace of state.folderWorkspaces) {
        validWorktreeIds.add(folderWorkspaceKey(workspace.id))
      }
      addAdditionalValidWorkspaceKeys(validWorktreeIds, options)
      set(buildHydratedTabState(session, validWorktreeIds))
    }
  }
}
