import type { PublicKnownRuntimeEnvironment } from '@yiru/runtime-protocol/workbench/runtime-environments'
import type { OnboardingState, Repo } from '@yiru/runtime-protocol/workbench/types'
import { useEffect, useRef, useState } from 'react'

import { onOnboardingReopened } from '../onboarding/show-onboarding-event'
import { useAppStore } from '../store/state'
import { hydrateStartupSession, type StartupHydrationAttempt } from './startup-hydration'
import { recoverStartupSession } from './startup-recovery'

type StartupHydrationState = {
  onboarding: OnboardingState | null
  onboardingLoaded: boolean
  setOnboarding: (state: OnboardingState) => void
}

export function useStartupHydration(
  isProjectCatalogPending: boolean,
  repos: readonly Repo[],
  runtimeEnvironments: readonly PublicKnownRuntimeEnvironment[]
): StartupHydrationState {
  const reposRef = useRef(repos)
  reposRef.current = repos
  const runtimeEnvironmentsRef = useRef(runtimeEnvironments)
  runtimeEnvironmentsRef.current = runtimeEnvironments
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null)
  const [onboardingLoaded, setOnboardingLoaded] = useState(false)

  useEffect(() => onOnboardingReopened(setOnboarding), [])
  useEffect(() => {
    if (isProjectCatalogPending) {
      return
    }
    let cancelled = false
    const abortController = new AbortController()
    const attempt: StartupHydrationAttempt = {
      reconnectStarted: false,
      uiHydrated: false
    }
    const actions = useAppStore.getState()
    const isCancelled = (): boolean => cancelled

    void (async () => {
      try {
        const restoredOnboarding = await hydrateStartupSession({
          actions,
          attempt,
          isCancelled,
          repos: reposRef.current,
          runtimeEnvironments: runtimeEnvironmentsRef.current,
          signal: abortController.signal
        })
        if (!cancelled && restoredOnboarding !== null) {
          setOnboarding(restoredOnboarding)
          setOnboardingLoaded(true)
        }
      } catch (error) {
        await recoverStartupSession({
          actions,
          attempt,
          error,
          isCancelled,
          signal: abortController.signal
        })
      } finally {
        void actions.initGitHubCache()
      }
    })()

    return () => {
      cancelled = true
      abortController.abort()
    }
  }, [isProjectCatalogPending])

  return { onboarding, onboardingLoaded, setOnboarding }
}
