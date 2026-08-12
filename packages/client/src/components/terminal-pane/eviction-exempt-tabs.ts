import { isRuntimeTerminalPtyId } from '~renderer/runtime/terminal-inspection'
import { useAppStore } from '~renderer/store'
import { parseAppSshPtyId } from '~shared/ssh-pty-id'

import {
  isSnapshotBackedTerminalPty,
  type ColdParkableTerminalTab
} from './terminal-hidden-view-parking'
import { resolveParkedTerminalPaneCandidates } from './terminal-parked-tab-watchers'

function isEvictionExemptTerminalPty(
  ptyId: string | null | undefined,
  worktreeId: string
): boolean {
  if (!ptyId || isRuntimeTerminalPtyId(ptyId) || parseAppSshPtyId(ptyId)) {
    return false
  }
  return !isSnapshotBackedTerminalPty(ptyId, worktreeId)
}

export function selectEvictionExemptTerminalTabIds(
  worktreeId: string,
  tabs: readonly ColdParkableTerminalTab[],
  terminalLayoutsByTabId = useAppStore.getState().terminalLayoutsByTabId
): ReadonlySet<string> {
  const currentState = useAppStore.getState()
  const paneFallbackState = {
    terminalLayoutsByTabId,
    runtimePaneTitlesByTabId: currentState.runtimePaneTitlesByTabId
  }
  const exemptTabIds = new Set<string>()
  for (const tab of tabs) {
    if (
      isEvictionExemptTerminalPty(tab.ptyId, worktreeId) ||
      resolveParkedTerminalPaneCandidates(tab, paneFallbackState).some((pane) =>
        isEvictionExemptTerminalPty(pane.ptyId, worktreeId)
      )
    ) {
      exemptTabIds.add(tab.id)
    }
  }
  return exemptTabIds
}
