import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'

import { shellClient } from '../runtime/shell-client'
import { useAppStore } from '../store/state'
import type { StartupHydrationActions, StartupHydrationAttempt } from './startup-hydration'
import { getStartupErrorFallbackUI } from './startup-ui-hydration'

type StartupRecoveryInput = {
  actions: StartupHydrationActions
  attempt: StartupHydrationAttempt
  error: unknown
  isCancelled: () => boolean
  signal: AbortSignal
}

function forceWorkspaceSessionReady(): void {
  // Why: a failed reconnect must still mount the shell, but its transient
  // pending maps cannot survive and trigger phantom reconnect attempts later.
  useAppStore.setState({
    workspaceSessionReady: true,
    pendingReconnectWorktreeIds: [],
    pendingReconnectTabByWorktree: {},
    pendingReconnectPtyIdByTabId: {}
  })
}

export async function recoverStartupSession({
  actions,
  attempt,
  error,
  isCancelled,
  signal
}: StartupRecoveryInput): Promise<void> {
  const stepLabel = error instanceof Error && error.message ? error.message : String(error)
  console.error(
    '[startup] Workspace session hydration failed; leaving disk state untouched:',
    stepLabel,
    error
  )
  if (isCancelled()) {
    return
  }

  // Why: defaults are safe only when the persisted UI read never landed;
  // otherwise writing them would overwrite the user's real ui.json state.
  const fallbackUI = getStartupErrorFallbackUI(attempt.uiHydrated)
  if (fallbackUI) {
    actions.hydratePersistedUI(fallbackUI, 'startup')
  }
  toast.error(translate('auto.App.12e77cf12b', 'Session restore failed'), {
    description: translate(
      'auto.App.0a9e810705',
      "Changes won't be saved until restart. Your previous tabs are safe on disk."
    ),
    duration: Infinity,
    dismissible: true,
    action: {
      label: translate('auto.App.caea5b51b9', 'Restart now'),
      onClick: () => {
        void shellClient.app.restart()
      }
    }
  })

  if (attempt.reconnectStarted) {
    forceWorkspaceSessionReady()
    return
  }
  try {
    await actions.reconnectPersistedTerminals(signal)
  } catch (reconnectError) {
    console.error('[startup] reconnectPersistedTerminals failed in error path:', reconnectError)
    if (!isCancelled()) {
      forceWorkspaceSessionReady()
    }
  }
}
