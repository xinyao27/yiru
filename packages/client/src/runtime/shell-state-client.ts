import type { ExecutionHostId } from '@yiru/workbench-model/workspace'
import type { PRInfo, GlobalSettings, OnboardingState } from '~shared/types'
import type { WorkspaceSessionPatch, WorkspaceSessionState } from '~shared/types'

import { getWebShellStateApis } from '../web/shell-state'
import { callShellOrpc } from './orpc-client'

type GitHubCache = { pr: Record<string, { data: PRInfo | null; fetchedAt: number }> }

export type ShellSettingsApi = {
  get: () => Promise<GlobalSettings>
  getSnapshot: () => GlobalSettings | null
  set: (updates: Partial<GlobalSettings>) => Promise<GlobalSettings>
  updatePRBotAuthorOverride: (args: { author: string; isBot: boolean }) => Promise<GlobalSettings>
}

export type ShellSessionApi = {
  get: (hostId?: ExecutionHostId) => Promise<WorkspaceSessionState>
  set: (session: WorkspaceSessionState, hostId?: ExecutionHostId) => Promise<void>
  patch: (patch: WorkspaceSessionPatch, hostId?: ExecutionHostId) => Promise<void>
  flush: () => Promise<void>
}

export type ShellOnboardingApi = {
  get: () => Promise<OnboardingState>
  update: (
    updates: Partial<Omit<OnboardingState, 'checklist'>> & {
      checklist?: Partial<OnboardingState['checklist']>
    }
  ) => Promise<OnboardingState>
}

export type ShellCacheApi = {
  getGitHub: () => Promise<GitHubCache>
  setGitHub: (args: { cache: GitHubCache }) => Promise<void>
}

let settingsSnapshot: GlobalSettings | null = null

function isWebShellClient(): boolean {
  return (globalThis as { __YIRU_WEB_CLIENT__?: boolean }).__YIRU_WEB_CLIENT__ === true
}

function restoreShellDocument<T>(value: unknown): T {
  // Why: runtime-protocol cannot import desktop-only shared document types.
  // The owning shell validates/sanitizes these objects; this adapter restores
  // their concrete client type after the typed oRPC transport succeeds.
  return value as T
}

const electronSettingsApi: ShellSettingsApi = {
  get: async () => {
    const settings = restoreShellDocument<GlobalSettings>(
      await callShellOrpc((client) => client.shell.settings.get, undefined)
    )
    settingsSnapshot = settings
    return settings
  },
  getSnapshot: () => settingsSnapshot,
  set: async (updates) => {
    const settings = restoreShellDocument<GlobalSettings>(
      await callShellOrpc((client) => client.shell.settings.set, updates)
    )
    settingsSnapshot = settings
    return settings
  },
  updatePRBotAuthorOverride: async (args) => {
    const settings = restoreShellDocument<GlobalSettings>(
      await callShellOrpc((client) => client.shell.settings.updatePRBotAuthorOverride, args)
    )
    settingsSnapshot = settings
    return settings
  }
}

const electronSessionApi: ShellSessionApi = {
  get: async (hostId) =>
    restoreShellDocument<WorkspaceSessionState>(
      await callShellOrpc((client) => client.shell.session.get, { hostId })
    ),
  set: (session, hostId) =>
    callShellOrpc((client) => client.shell.session.set, { session, hostId }),
  patch: (patch, hostId) =>
    callShellOrpc((client) => client.shell.session.patch, { patch, hostId }),
  flush: () => callShellOrpc((client) => client.shell.session.flush, undefined)
}

const electronOnboardingApi: ShellOnboardingApi = {
  get: async () =>
    restoreShellDocument<OnboardingState>(
      await callShellOrpc((client) => client.shell.onboarding.get, undefined)
    ),
  update: async (updates) =>
    restoreShellDocument<OnboardingState>(
      await callShellOrpc((client) => client.shell.onboarding.update, updates)
    )
}

const electronCacheApi: ShellCacheApi = {
  getGitHub: async () =>
    restoreShellDocument<GitHubCache>(
      await callShellOrpc((client) => client.shell.cache.getGitHub, undefined)
    ),
  setGitHub: (args) => callShellOrpc((client) => client.shell.cache.setGitHub, args)
}

export function hydrateShellSettings(): Promise<void> {
  return shellSettingsApi.get().then(() => undefined)
}

export const shellSettingsApi: ShellSettingsApi = isWebShellClient()
  ? getWebShellStateApis().settings
  : electronSettingsApi
export const shellSessionApi: ShellSessionApi = isWebShellClient()
  ? getWebShellStateApis().session
  : electronSessionApi
export const shellOnboardingApi: ShellOnboardingApi = isWebShellClient()
  ? getWebShellStateApis().onboarding
  : electronOnboardingApi
export const shellCacheApi: ShellCacheApi = isWebShellClient()
  ? getWebShellStateApis().cache
  : electronCacheApi
