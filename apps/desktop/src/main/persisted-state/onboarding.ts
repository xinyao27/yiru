import type { OnboardingState } from '~shared/types'

import { sanitizeOnboardingUpdate, type Store } from '../persistence'

type ShellOnboardingService = ReturnType<typeof createShellOnboardingService>

let shellOnboardingService: ShellOnboardingService | null = null

export function initializeShellOnboardingService(store: Store): void {
  shellOnboardingService = createShellOnboardingService(store)
}

export function getShellOnboardingService(): ShellOnboardingService {
  if (!shellOnboardingService) {
    throw new Error('shell_onboarding_service_unavailable')
  }
  return shellOnboardingService
}

function createShellOnboardingService(store: Store) {
  return {
    get: (): OnboardingState => store.getOnboarding(),
    // Why: never trust renderer input — a compromised/buggy caller could send
    // unknown keys or wrong-typed values that would poison persisted state.
    update: (updates: unknown): OnboardingState =>
      store.updateOnboarding(sanitizeOnboardingUpdate(updates))
  }
}
