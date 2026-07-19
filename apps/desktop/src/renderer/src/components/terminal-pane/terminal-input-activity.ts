import { useAppStore } from '@/store'

import { makePaneKey } from '../../../../shared/stable-pane-id'

export function recordTerminalUserInputForLeaf(tabId: string, leafId: string): void {
  try {
    // Why: hibernation must see all user-authorized terminal writes, including
    // sends that bypass xterm.onData.
    useAppStore.getState().recordTerminalInput(makePaneKey(tabId, leafId))
  } catch {
    // Legacy/malformed layouts are ignored; hibernation remains conservative
    // when it cannot match live PTYs to stable pane keys.
  }
}
