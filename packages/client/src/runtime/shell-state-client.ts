import type { ShellGitHubCache } from '@yiru/runtime-protocol/contract'
import type { ExecutionHostId } from '@yiru/runtime-protocol/model/workspace'
import type {
  GlobalSettings,
  OnboardingState,
  WorkspaceSessionPatch,
  WorkspaceSessionState
} from '@yiru/runtime-protocol/workbench/types'

import { callShellOrpc } from './orpc-client'

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
  getGitHub: () => Promise<ShellGitHubCache>
  setGitHub: (args: { cache: ShellGitHubCache }) => Promise<void>
}

let settingsSnapshot: GlobalSettings | null = null

export const shellSettingsApi: ShellSettingsApi = {
  get: async () => {
    const settings = await callShellOrpc((client) => client.shell.settings.get, undefined)
    settingsSnapshot = settings
    return settings
  },
  getSnapshot: () => settingsSnapshot,
  set: async (updates) => {
    const settings = await callShellOrpc((client) => client.shell.settings.set, updates)
    settingsSnapshot = settings
    return settings
  },
  updatePRBotAuthorOverride: async (args) => {
    const settings = await callShellOrpc(
      (client) => client.shell.settings.updatePRBotAuthorOverride,
      args
    )
    settingsSnapshot = settings
    return settings
  }
}

export const shellSessionApi: ShellSessionApi = {
  get: (hostId) => callShellOrpc((client) => client.shell.session.get, { hostId }),
  set: (session, hostId) =>
    callShellOrpc((client) => client.shell.session.set, { session, hostId }),
  patch: (patch, hostId) =>
    callShellOrpc((client) => client.shell.session.patch, { patch, hostId }),
  flush: () => callShellOrpc((client) => client.shell.session.flush, undefined)
}

export const shellOnboardingApi: ShellOnboardingApi = {
  get: () => callShellOrpc((client) => client.shell.onboarding.get, undefined),
  update: (updates) => callShellOrpc((client) => client.shell.onboarding.update, updates)
}

export const shellCacheApi: ShellCacheApi = {
  getGitHub: () => callShellOrpc((client) => client.shell.cache.getGitHub, undefined),
  setGitHub: (args) => callShellOrpc((client) => client.shell.cache.setGitHub, args)
}
