import {
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostId,
  type ExecutionHostId
} from '@yiru/workbench-model/workspace'
import {
  getDefaultOnboardingState,
  getDefaultWorkspaceSession,
  ONBOARDING_FLOW_VERSION
} from '~shared/constants'
import type {
  GlobalSettings,
  OnboardingState,
  PRInfo,
  WorkspaceSessionPatch,
  WorkspaceSessionState
} from '~shared/types'

import { readWebUIState } from '../runtime/web-ui-state'
import { getWebActiveEnvironment } from './runtime-connection'
import {
  getRuntimeBackedWebSettings,
  readWebSettings,
  setWebSettings,
  updateWebPRBotAuthorOverride
} from './settings'
import { isJsonRecord, readLocalJson, writeLocalJson } from './storage/local-json'
import { sanitizeWebRuntimeWorkspaceSession } from './workspace-session'

const SESSION_STORAGE_KEY = 'yiru.web.workspaceSession.v1'
const ONBOARDING_STORAGE_KEY = 'yiru.web.onboarding.v1'
const GITHUB_CACHE_STORAGE_KEY = 'yiru.web.githubCache.v1'

const webShellSettingsApi = {
  get: (): Promise<GlobalSettings> => getRuntimeBackedWebSettings(),
  getSnapshot: (): GlobalSettings => readWebSettings(),
  set: (updates: Partial<GlobalSettings>): Promise<GlobalSettings> => setWebSettings(updates),
  updatePRBotAuthorOverride: updateWebPRBotAuthorOverride
}

const webShellSessionApi = {
  get: (hostId?: ExecutionHostId): Promise<WorkspaceSessionState> =>
    Promise.resolve(getStoredWorkspaceSession(hostId)),
  set: async (session: WorkspaceSessionState, hostId?: ExecutionHostId): Promise<void> => {
    writeLocalJson(sessionStorageKeyForHost(hostId), sanitizeWebRuntimeWorkspaceSession(session))
  },
  patch: async (patch: WorkspaceSessionPatch, hostId?: ExecutionHostId): Promise<void> => {
    writeLocalJson(
      sessionStorageKeyForHost(hostId),
      sanitizeWebRuntimeWorkspaceSession({ ...getStoredWorkspaceSession(hostId), ...patch })
    )
  },
  flush: async (): Promise<void> => {}
}

const webShellOnboardingApi = {
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

const webShellCacheApi = {
  getGitHub: () => Promise.resolve(readStoredGitHubCache()),
  setGitHub: async (args: {
    cache: { pr: Record<string, { data: PRInfo | null; fetchedAt: number }> }
  }): Promise<void> => writeLocalJson(GITHUB_CACHE_STORAGE_KEY, args.cache)
}

export function getWebShellStateApis() {
  return {
    settings: webShellSettingsApi,
    session: webShellSessionApi,
    onboarding: webShellOnboardingApi,
    cache: webShellCacheApi
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

function sessionStorageKeyForHost(hostId?: string | null): string {
  const resolved = normalizeExecutionHostId(hostId) ?? LOCAL_EXECUTION_HOST_ID
  return resolved === LOCAL_EXECUTION_HOST_ID
    ? SESSION_STORAGE_KEY
    : `${SESSION_STORAGE_KEY}.${resolved}`
}

function getStoredWorkspaceSession(hostId?: string | null): WorkspaceSessionState {
  const resolvedHostId = normalizeExecutionHostId(hostId) ?? LOCAL_EXECUTION_HOST_ID
  if (resolvedHostId !== LOCAL_EXECUTION_HOST_ID) {
    return sanitizeWebRuntimeWorkspaceSession(
      readLocalJson(sessionStorageKeyForHost(resolvedHostId))
    )
  }
  const localSession = sanitizeWebRuntimeWorkspaceSession(readLocalJson(SESSION_STORAGE_KEY))
  if (!getWebActiveEnvironment()) {
    return localSession
  }
  const ui = readWebUIState()
  return sanitizeWebRuntimeWorkspaceSession({
    ...getDefaultWorkspaceSession(),
    activeRepoId: ui.lastActiveRepoId,
    activeWorktreeId: ui.lastActiveWorktreeId,
    lastVisitedAtByWorktreeId: localSession.lastVisitedAtByWorktreeId
  })
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

function readStoredGitHubCache(): {
  pr: Record<string, { data: PRInfo | null; fetchedAt: number }>
} {
  const value = readLocalJson(GITHUB_CACHE_STORAGE_KEY)
  if (!isJsonRecord(value) || !isJsonRecord(value.pr)) {
    return { pr: {} }
  }
  const pr: Record<string, { data: PRInfo | null; fetchedAt: number }> = {}
  for (const [key, entry] of Object.entries(value.pr)) {
    if (
      !isJsonRecord(entry) ||
      typeof entry.fetchedAt !== 'number' ||
      !Number.isFinite(entry.fetchedAt)
    ) {
      continue
    }
    const data = decodeStoredPRInfo(entry.data)
    if (data !== undefined) {
      pr[key] = { data, fetchedAt: entry.fetchedAt }
    }
  }
  return { pr }
}

function decodeStoredPRInfo(value: unknown): PRInfo | null | undefined {
  if (value === null) {
    return null
  }
  if (
    !isJsonRecord(value) ||
    typeof value.number !== 'number' ||
    !Number.isFinite(value.number) ||
    typeof value.title !== 'string' ||
    !isPRState(value.state) ||
    typeof value.url !== 'string' ||
    !isCheckStatus(value.checksStatus) ||
    typeof value.updatedAt !== 'string' ||
    !isMergeableState(value.mergeable)
  ) {
    return undefined
  }
  return {
    number: value.number,
    title: value.title,
    state: value.state,
    url: value.url,
    checksStatus: value.checksStatus,
    updatedAt: value.updatedAt,
    mergeable: value.mergeable
  }
}

function isPRState(value: unknown): value is PRInfo['state'] {
  return value === 'open' || value === 'closed' || value === 'merged' || value === 'draft'
}

function isCheckStatus(value: unknown): value is PRInfo['checksStatus'] {
  return value === 'pending' || value === 'success' || value === 'failure' || value === 'neutral'
}

function isMergeableState(value: unknown): value is PRInfo['mergeable'] {
  return value === 'MERGEABLE' || value === 'CONFLICTING' || value === 'UNKNOWN'
}
