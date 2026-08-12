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
    writeJson(sessionStorageKeyForHost(hostId), sanitizeWebRuntimeWorkspaceSession(session))
  },
  patch: async (patch: WorkspaceSessionPatch, hostId?: ExecutionHostId): Promise<void> => {
    writeJson(
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
    writeJson(ONBOARDING_STORAGE_KEY, next)
    return next
  }
}

const webShellCacheApi = {
  getGitHub: () =>
    Promise.resolve(
      readJson<{ pr: Record<string, { data: PRInfo | null; fetchedAt: number }> }>(
        GITHUB_CACHE_STORAGE_KEY,
        { pr: {} }
      )
    ),
  setGitHub: async (args: {
    cache: { pr: Record<string, { data: PRInfo | null; fetchedAt: number }> }
  }): Promise<void> => writeJson(GITHUB_CACHE_STORAGE_KEY, args.cache)
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
  const storedRaw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY)
  const base = storedRaw
    ? readJson(ONBOARDING_STORAGE_KEY, getDefaultOnboardingState())
    : getDefaultOnboardingState()
  if (base.checklist.dismissed) {
    return base
  }
  const closed = {
    ...base,
    flowVersion: ONBOARDING_FLOW_VERSION,
    closedAt: Date.now(),
    outcome: 'dismissed' as const,
    checklist: { ...base.checklist, dismissed: true }
  }
  writeJson(ONBOARDING_STORAGE_KEY, closed)
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
      readJson(sessionStorageKeyForHost(resolvedHostId), getDefaultWorkspaceSession())
    )
  }
  const localSession = sanitizeWebRuntimeWorkspaceSession(
    readJson(SESSION_STORAGE_KEY, getDefaultWorkspaceSession())
  )
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

function readJson<T>(key: string, fallback: T): T {
  const raw = window.localStorage.getItem(key)
  if (!raw) {
    return fallback
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  window.localStorage.setItem(key, JSON.stringify(value))
}
