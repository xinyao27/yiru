import {
  getDefaultOnboardingState,
  ONBOARDING_FINAL_STEP,
  ONBOARDING_FLOW_VERSION
} from '../../shared/constants'
import type {
  OnboardingChecklistState,
  OnboardingOutcome,
  OnboardingState
} from '../../shared/types'

type SanitizeOnboardingUpdateOptions = {
  migrateLegacyProgress?: boolean
}

export type SanitizedOnboardingUpdate = Partial<Omit<OnboardingState, 'checklist'>> & {
  checklist?: Partial<OnboardingChecklistState>
}

function remapLegacyProgress(lastCompletedStep: number, raw: Record<string, unknown>): number {
  if (raw.outcome === 'completed' && lastCompletedStep >= 4) {
    return ONBOARDING_FINAL_STEP
  }
  if (raw.flowVersion === 3) {
    return Math.min(4, lastCompletedStep)
  }
  if (raw.flowVersion === 2) {
    if (lastCompletedStep === 3) {
      return 2
    }
    return lastCompletedStep >= 4 ? 3 : lastCompletedStep
  }
  if (lastCompletedStep === 3 || lastCompletedStep === 4) {
    return 2
  }
  return lastCompletedStep >= 5 ? 3 : lastCompletedStep
}

// Why: both disk decode and IPC updates share one strict whitelist, so
// malformed or unknown renderer/disk fields cannot enter durable state.
export function sanitizeOnboardingUpdate(
  input: unknown,
  options: SanitizeOnboardingUpdateOptions = {}
): SanitizedOnboardingUpdate {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {}
  }
  const raw = input as Record<string, unknown>
  const output: SanitizedOnboardingUpdate = {}
  if ('closedAt' in raw) {
    if (typeof raw.closedAt === 'number' && Number.isFinite(raw.closedAt) && raw.closedAt >= 0) {
      output.closedAt = raw.closedAt
    } else if (raw.closedAt === null) {
      output.closedAt = null
    }
  }
  if ('outcome' in raw) {
    if (raw.outcome === 'completed' || raw.outcome === 'dismissed') {
      output.outcome = raw.outcome as OnboardingOutcome
    } else if (raw.outcome === null) {
      output.outcome = null
    }
  }
  if ('flowVersion' in raw) {
    const version = raw.flowVersion
    if (
      typeof version === 'number' &&
      Number.isInteger(version) &&
      version >= 1 &&
      version <= ONBOARDING_FLOW_VERSION
    ) {
      output.flowVersion = version
    }
  }
  if ('lastCompletedStep' in raw) {
    const step = raw.lastCompletedStep
    if (typeof step === 'number' && Number.isInteger(step) && step >= -1) {
      const normalized =
        options.migrateLegacyProgress && raw.flowVersion !== ONBOARDING_FLOW_VERSION
          ? remapLegacyProgress(step, raw)
          : step
      if (normalized <= ONBOARDING_FINAL_STEP) {
        output.lastCompletedStep = normalized
      }
    }
  }
  if (
    'checklist' in raw &&
    raw.checklist &&
    typeof raw.checklist === 'object' &&
    !Array.isArray(raw.checklist)
  ) {
    const defaults = getDefaultOnboardingState().checklist
    const checklist: Partial<OnboardingChecklistState> = {}
    const candidate = raw.checklist as Record<string, unknown>
    for (const key of Object.keys(defaults) as (keyof OnboardingChecklistState)[]) {
      if (typeof candidate[key] === 'boolean') {
        checklist[key] = candidate[key]
      }
    }
    output.checklist = checklist
  }
  if (options.migrateLegacyProgress) {
    output.flowVersion = ONBOARDING_FLOW_VERSION
  }
  return output
}

export function decodePersistedOnboarding(
  value: unknown,
  now: () => number
): { onboarding: OnboardingState; needsSave: boolean } {
  const defaults = getDefaultOnboardingState()
  if (!value) {
    return {
      onboarding: {
        ...defaults,
        closedAt: now(),
        outcome: 'completed',
        lastCompletedStep: ONBOARDING_FINAL_STEP
      },
      needsSave: true
    }
  }
  const sanitized = sanitizeOnboardingUpdate(value, { migrateLegacyProgress: true })
  const recoveredClosedAt =
    typeof sanitized.closedAt === 'number'
      ? sanitized.closedAt
      : sanitized.outcome !== null && sanitized.outcome !== undefined
        ? now()
        : sanitized.closedAt
  return {
    onboarding: {
      ...defaults,
      ...sanitized,
      closedAt: recoveredClosedAt ?? defaults.closedAt,
      checklist: { ...defaults.checklist, ...sanitized.checklist }
    },
    needsSave: false
  }
}
