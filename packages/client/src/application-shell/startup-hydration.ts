import {
  toRuntimeExecutionHostId,
  type ExecutionHostId
} from '@yiru/runtime-protocol/model/workspace'
import type { OnboardingState, Repo } from '@yiru/runtime-protocol/workbench/types'
import { collectFolderWorkspaceKeysFromSession } from '~renderer/workspace/session-hydration-keys'

import { fetchWorkspaceSessionWithRuntimeHostOwners } from '../editor/workspace-session-host-persistence'
import { runtimeEnvironmentsClient } from '../runtime/runtime-environments-client'
import { shellClient } from '../runtime/shell-client'
import { getRuntimeUIState } from '../runtime/ui-client'
import { syncZoomCSSVar } from '../settings/ui-zoom'
import {
  logRendererStartupDiagnostic,
  timeRendererStartupStep,
  timeRendererStartupSyncStep
} from '../startup/diagnostics'
import { useAppStore } from '../store/state'
import type { AppState } from '../store/types'
import { publishTerminalViewAttributesAtAppStart } from '../terminal-pane/terminal-appearance'
import { getSystemPrefersDark } from '../terminal/theme'
import { hydratePersistedUIAfterStartupRead } from './startup-ui-hydration'

export type StartupHydrationActions = Pick<
  AppState,
  | 'completeHydratedWorktreePurge'
  | 'fetchKeybindings'
  | 'fetchSettings'
  | 'fetchYiruProfiles'
  | 'hydrateBrowserSession'
  | 'hydrateEditorSession'
  | 'hydratePersistedUI'
  | 'hydrateTabsSession'
  | 'hydrateWorkspaceSession'
  | 'pruneLastVisitedTimestamps'
  | 'reconnectPersistedTerminals'
  | 'seedActiveWorktreeLastVisitedIfMissing'
  | 'setHydrationSucceeded'
>

export type StartupHydrationAttempt = {
  reconnectStarted: boolean
  uiHydrated: boolean
}

type StartupHydrationInput = {
  actions: StartupHydrationActions
  attempt: StartupHydrationAttempt
  isCancelled: () => boolean
  repos: readonly Repo[]
  signal: AbortSignal
}

async function listRuntimeSessionHostIdsForStartup(): Promise<ExecutionHostId[]> {
  try {
    return (await runtimeEnvironmentsClient.list()).map((environment) =>
      toRuntimeExecutionHostId(environment.id)
    )
  } catch (err) {
    console.warn('Failed to list runtime session hosts for startup:', err)
    return []
  }
}

export async function hydrateStartupSession({
  actions,
  attempt,
  isCancelled,
  repos,
  signal
}: StartupHydrationInput): Promise<OnboardingState | null> {
  const startupStartedAt = performance.now()
  logRendererStartupDiagnostic('startup-chain-start')
  void actions.fetchYiruProfiles()
  await timeRendererStartupStep('fetch-settings', () => actions.fetchSettings())
  publishTerminalViewAttributesAtAppStart(useAppStore.getState().settings, getSystemPrefersDark())

  const keybindingsPromise = timeRendererStartupStep('fetch-keybindings', () =>
    actions.fetchKeybindings()
  )
  keybindingsPromise.catch(() => {})
  const onboardingPromise = timeRendererStartupStep('onboarding-get', () =>
    shellClient.onboarding.get()
  )
  onboardingPromise.catch(() => {})

  const persistedUI = await timeRendererStartupStep('ui-get', () =>
    getRuntimeUIState(useAppStore.getState().settings)
  )
  attempt.uiHydrated = timeRendererStartupSyncStep('hydrate-persisted-ui', () =>
    hydratePersistedUIAfterStartupRead({
      persistedUI,
      cancelled: isCancelled(),
      hydratePersistedUI: actions.hydratePersistedUI
    })
  )
  const startupRuntimeHostIds = await timeRendererStartupStep(
    'list-runtime-session-hosts',
    listRuntimeSessionHostIdsForStartup
  )
  const sessionRead = await timeRendererStartupStep('session-get', () =>
    fetchWorkspaceSessionWithRuntimeHostOwners(shellClient.session, repos, startupRuntimeHostIds)
  )
  await keybindingsPromise
  if (isCancelled()) {
    return null
  }

  const sessionHydrationOptions = {
    additionalValidWorkspaceKeys: collectFolderWorkspaceKeysFromSession(sessionRead.session)
  }
  timeRendererStartupSyncStep('hydrate-session-stores', () => {
    actions.hydrateWorkspaceSession(sessionRead.session, {
      ...sessionHydrationOptions,
      runtimeHostIdByWorkspaceSessionKey: sessionRead.runtimeHostIdByWorkspaceSessionKey
    })
    actions.hydrateTabsSession(sessionRead.session, sessionHydrationOptions)
    actions.hydrateEditorSession(sessionRead.session, sessionHydrationOptions)
    actions.hydrateBrowserSession(sessionRead.session, sessionHydrationOptions)
  })
  actions.completeHydratedWorktreePurge()
  timeRendererStartupSyncStep('visit-timestamp-prune', () => {
    actions.pruneLastVisitedTimestamps()
    actions.seedActiveWorktreeLastVisitedIfMissing()
  })
  const onboarding = await onboardingPromise
  if (isCancelled()) {
    return null
  }

  await timeRendererStartupStep('first-window-services-await', () =>
    shellClient.app.awaitFirstWindowStartupServices()
  )
  attempt.reconnectStarted = true
  await timeRendererStartupStep('reconnect-terminals', () =>
    actions.reconnectPersistedTerminals(signal)
  )
  syncZoomCSSVar()
  actions.setHydrationSucceeded(true)
  actions.completeHydratedWorktreePurge()
  logRendererStartupDiagnostic('startup-hydration-done', {
    durationMs: Math.round(performance.now() - startupStartedAt)
  })
  return onboarding
}
