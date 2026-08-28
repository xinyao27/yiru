import { browserWorkspaceHasRemoteOwner } from '~renderer/runtime/remote-browser-tab-ownership'
import {
  closeWebRuntimeSessionTab,
  isWebRuntimeSessionActive
} from '~renderer/runtime/web-runtime-session'

import { closeTerminalTab } from '../terminal/tab-actions'
import {
  getActiveWorktreeRuntimeEnvironmentId,
  type TerminalStoreSnapshot
} from './tab-model-lookup'

type BulkCloseTabsArgs = {
  worktreeId: string
  ids: string[]
  state: TerminalStoreSnapshot
  closeTab: (tabId: string) => void
  closeFile: (fileId: string) => void
  closeBrowserTab: (tabId: string) => void
}

// Why: "close others" and "close to the right" route each id through the
// identical pinned-skip / web-runtime-session / local terminal-editor-browser
// close decision — only the id list differs — so they share this pure
// function instead of duplicating the routing logic per caller.
export function closeUnifiedTabsById({
  worktreeId,
  ids,
  state,
  closeTab,
  closeFile,
  closeBrowserTab
}: BulkCloseTabsArgs): string[] {
  const dirtyFileIds: string[] = []
  for (const id of ids) {
    const unifiedTab = (state.unifiedTabsByWorktree[worktreeId] ?? []).find(
      (candidate) => candidate.id === id || candidate.entityId === id
    )
    if (unifiedTab?.isPinned) {
      continue
    }
    const runtimeEnvironmentId = getActiveWorktreeRuntimeEnvironmentId(worktreeId)
    if (
      isWebRuntimeSessionActive(runtimeEnvironmentId) &&
      (unifiedTab?.contentType === 'terminal' ||
        (unifiedTab?.contentType === 'browser' &&
          browserWorkspaceHasRemoteOwner(state, unifiedTab.entityId, runtimeEnvironmentId)))
    ) {
      if (unifiedTab.contentType === 'terminal') {
        // Why: paired-host bulk close must revoke renderer resume and hook
        // authority as well as removing the host-owned session tab.
        closeTerminalTab(unifiedTab.entityId)
      } else {
        void closeWebRuntimeSessionTab({
          worktreeId,
          tabId: unifiedTab.id,
          environmentId: runtimeEnvironmentId
        })
      }
      continue
    }
    if ((state.tabsByWorktree[worktreeId] ?? []).some((tab) => tab.id === id)) {
      closeTab(id)
    } else if (state.openFiles.some((file) => file.worktreeId === worktreeId && file.id === id)) {
      const file = state.openFiles.find((candidate) => candidate.id === id)
      if (file?.isDirty) {
        dirtyFileIds.push(id)
        continue
      }
      closeFile(id)
    } else if ((state.browserTabsByWorktree[worktreeId] ?? []).some((tab) => tab.id === id)) {
      closeBrowserTab(id)
    }
  }
  return dirtyFileIds
}
