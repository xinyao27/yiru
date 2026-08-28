import {
  toRuntimeExecutionHostId,
  type ExecutionHostId
} from '@yiru/runtime-protocol/model/workspace'
import type { Repo } from '@yiru/runtime-protocol/workbench/types'

import { fetchWorkspaceSessionWithRuntimeHostOwners } from '../../editor/workspace-session-host-persistence'
import { runtimeEnvironmentsClient } from '../../runtime/runtime-environments-client'
import { shellClient } from '../../runtime/shell-client'
import { getRuntimeUIState } from '../../runtime/ui-client'
import { useAppStore } from '../../store/state'
import { collectFolderWorkspaceKeysFromSession } from '../../workspace/session-hydration-keys'

async function listRuntimeSessionHostIds(): Promise<ExecutionHostId[]> {
  try {
    return (await runtimeEnvironmentsClient.list()).map((environment) =>
      toRuntimeExecutionHostId(environment.id)
    )
  } catch {
    return []
  }
}

export async function hydrateSidePanelNavigation(repos: readonly Repo[]): Promise<void> {
  const initial = useAppStore.getState()
  void initial.fetchYiruProfiles()
  await initial.fetchSettings()

  const settings = useAppStore.getState().settings
  if (settings) {
    const persistedUi = await getRuntimeUIState(settings)
    useAppStore.getState().hydratePersistedUI(persistedUi, 'startup')
  }

  const keybindings = useAppStore.getState().fetchKeybindings()
  const runtimeHostIds = await listRuntimeSessionHostIds()

  const sessionRead = await fetchWorkspaceSessionWithRuntimeHostOwners(
    shellClient.session,
    repos,
    runtimeHostIds
  )
  const hydrationOptions = {
    additionalValidWorkspaceKeys: collectFolderWorkspaceKeysFromSession(sessionRead.session)
  }
  const state = useAppStore.getState()
  state.hydrateWorkspaceSession(sessionRead.session, {
    ...hydrationOptions,
    runtimeHostIdByWorkspaceSessionKey: sessionRead.runtimeHostIdByWorkspaceSessionKey
  })
  state.hydrateTabsSession(sessionRead.session, hydrationOptions)
  state.hydrateEditorSession(sessionRead.session, hydrationOptions)
  state.hydrateBrowserSession(sessionRead.session, hydrationOptions)
  await keybindings
}
