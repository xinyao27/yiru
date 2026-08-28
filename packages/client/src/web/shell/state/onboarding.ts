import {
  getDefaultOnboardingState,
  ONBOARDING_FLOW_VERSION
} from '@yiru/runtime-protocol/workbench/constants'
import type { OnboardingState } from '@yiru/runtime-protocol/workbench/types'
import { isJsonRecord, readLocalJson, writeLocalJson } from '~renderer/web/storage/local-json'

const ONBOARDING_STORAGE_KEY = 'yiru.web.onboarding.v1'

export const webShellOnboardingApi = {
  get: (): Promise<OnboardingState> => Promise.resolve(getStoredOnboarding()),
  update: async (
    updates: Partial<Omit<OnboardingState, 'checklist'>> & {
      checklist?: Partial<OnboardingState['checklist']>
    }
  ): Promise<OnboardingState> => {
    const current = getStoredOnboarding()
    const next: OnboardingState = {
      ...current,
      ...updates,
      flowVersion: ONBOARDING_FLOW_VERSION,
      checklist: { ...current.checklist, ...updates.checklist }
    }
    writeLocalJson(ONBOARDING_STORAGE_KEY, next)
    return next
  }
}

function getStoredOnboarding(): OnboardingState {
  const base = decodeStoredOnboarding(readLocalJson(ONBOARDING_STORAGE_KEY))
  if (base.checklist.dismissed) {
    return base
  }
  const closed: OnboardingState = {
    ...base,
    flowVersion: ONBOARDING_FLOW_VERSION,
    closedAt: Date.now(),
    outcome: 'dismissed',
    checklist: { ...base.checklist, dismissed: true }
  }
  writeLocalJson(ONBOARDING_STORAGE_KEY, closed)
  return closed
}

function decodeStoredOnboarding(value: unknown): OnboardingState {
  const defaults = getDefaultOnboardingState()
  if (!isJsonRecord(value)) {
    return defaults
  }
  const checklist = isJsonRecord(value.checklist) ? value.checklist : {}
  return {
    flowVersion:
      typeof value.flowVersion === 'number' && Number.isInteger(value.flowVersion)
        ? value.flowVersion
        : defaults.flowVersion,
    closedAt:
      value.closedAt === null ||
      (typeof value.closedAt === 'number' && Number.isFinite(value.closedAt))
        ? value.closedAt
        : defaults.closedAt,
    outcome:
      value.outcome === 'completed' || value.outcome === 'dismissed'
        ? value.outcome
        : defaults.outcome,
    lastCompletedStep:
      typeof value.lastCompletedStep === 'number' && Number.isInteger(value.lastCompletedStep)
        ? value.lastCompletedStep
        : defaults.lastCompletedStep,
    checklist: {
      addedRepo: readBoolean(checklist.addedRepo, defaults.checklist.addedRepo),
      choseAgent: readBoolean(checklist.choseAgent, defaults.checklist.choseAgent),
      ranFirstAgent: readBoolean(checklist.ranFirstAgent, defaults.checklist.ranFirstAgent),
      ranSecondAgentOnSameTask: readBoolean(
        checklist.ranSecondAgentOnSameTask,
        defaults.checklist.ranSecondAgentOnSameTask
      ),
      triedCmdJ: readBoolean(checklist.triedCmdJ, defaults.checklist.triedCmdJ),
      shapedSidebar: readBoolean(checklist.shapedSidebar, defaults.checklist.shapedSidebar),
      reviewedDiff: readBoolean(checklist.reviewedDiff, defaults.checklist.reviewedDiff),
      openedPr: readBoolean(checklist.openedPr, defaults.checklist.openedPr),
      addedFolder: readBoolean(checklist.addedFolder, defaults.checklist.addedFolder),
      openedFile: readBoolean(checklist.openedFile, defaults.checklist.openedFile),
      ranAgentOnFile: readBoolean(checklist.ranAgentOnFile, defaults.checklist.ranAgentOnFile),
      dismissed: readBoolean(checklist.dismissed, defaults.checklist.dismissed)
    }
  }
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}
