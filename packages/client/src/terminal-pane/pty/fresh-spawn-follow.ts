import type { IDisposable } from '@xterm/xterm'

import type { ManagedPane } from '../pane-manager/pane-manager'
import {
  getTerminalScrollIntentKind,
  markTerminalFollowOutput
} from '../pane-manager/terminal-scroll-intent'
import { deferTerminalGeometryMutationDuringRebuild } from '../pane-manager/terminal-scroll-intent-rebuild'

export type FreshSpawnFollow = {
  reset: () => void
  dispose: () => void
}

export function createFreshSpawnFollow(
  pane: ManagedPane,
  getIsDisposed: () => boolean
): FreshSpawnFollow {
  let disposables: IDisposable[] = []

  const dispose = (): void => {
    for (const disposable of disposables) {
      disposable.dispose()
    }
    disposables = []
  }

  const reset = (): void => {
    dispose()
    markTerminalFollowOutput(pane.terminal)
    let isComplete = false
    const tryResetNativeFollow = (): void => {
      if (
        getIsDisposed() ||
        getTerminalScrollIntentKind(pane.terminal) !== 'followOutput' ||
        deferTerminalGeometryMutationDuringRebuild(
          pane.terminal,
          'fresh-spawn-follow-reset',
          tryResetNativeFollow
        )
      ) {
        return
      }
      try {
        pane.terminal.scrollToBottom()
        isComplete = true
        dispose()
      } catch (error) {
        if (!(error instanceof TypeError && /dimensions/.test(error.message))) {
          dispose()
          throw error
        }
      }
    }
    tryResetNativeFollow()
    if (!isComplete) {
      // Why: xterm's browser viewport can reject scrolling while its renderer
      // is detached; the first render/resize is the earliest safe native retry.
      disposables = [
        pane.terminal.onRender(tryResetNativeFollow),
        pane.terminal.onResize(tryResetNativeFollow)
      ]
    }
  }

  return { reset, dispose }
}
