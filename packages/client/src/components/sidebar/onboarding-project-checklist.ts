import { track } from '~renderer/lib/telemetry'
import { rendererHostClient } from '~renderer/runtime/renderer-host-client'
import type { OnboardingState } from '~shared/types'

export type OnboardingProjectChecklistItem = 'addedRepo' | 'addedFolder'

export async function markOnboardingProjectAdded(
  item: OnboardingProjectChecklistItem
): Promise<void> {
  if (typeof window === 'undefined' || !rendererHostClient?.onboarding) {
    return
  }
  const onboarding = await rendererHostClient.onboarding.get().catch(() => null)
  if (!onboarding || onboarding.checklist[item]) {
    return
  }

  const checklist: Partial<OnboardingState['checklist']> = {}
  checklist[item] = true
  try {
    await rendererHostClient.onboarding.update({ checklist })
  } catch (err) {
    console.warn('[onboarding] Failed to update project checklist item:', err)
    return
  }

  track('activation_checklist_item_completed', {
    item,
    time_since_completed_ms: 0
  })
}
