import { getShellKeybindingsService } from '~main/keybindings/keybindings'
import { getShellOnboardingService } from '~main/persisted-state/onboarding'
import { getShellSessionService } from '~main/persisted-state/session'
import { runtimeImplementation } from '~main/runtime/rpc/orpc/access-middleware'
import { requireShellRenderer } from '~main/shell/files'
import { getShellSettingsService } from '~main/shell/settings'
import { getShellYiruProfilesService } from '~main/yiru-profiles/yiru-profiles'
import { isKeybindingActionId } from '~shared/keybindings'
import type { PersistedState, WorkspaceSessionPatch, WorkspaceSessionState } from '~shared/types'
import type {
  CreateLocalYiruProfileArgs,
  FindYiruProfileProjectsByPathArgs,
  SwitchYiruProfileArgs,
  TransferYiruProfileProjectArgs
} from '~shared/yiru-profiles'

export const shellConfigurationRuntimeHandlers = {
  keybindings: {
    get: runtimeImplementation.shell.keybindings.get.handler(() =>
      getShellKeybindingsService().get()
    ),
    ensureFile: runtimeImplementation.shell.keybindings.ensureFile.handler(() =>
      getShellKeybindingsService().ensureFile()
    ),
    setAction: runtimeImplementation.shell.keybindings.setAction.handler(({ input }) => {
      if (!isKeybindingActionId(input.actionId)) {
        throw new Error('invalid_keybinding_action')
      }
      return getShellKeybindingsService().setAction({ ...input, actionId: input.actionId })
    }),
    reload: runtimeImplementation.shell.keybindings.reload.handler(() =>
      getShellKeybindingsService().reload()
    ),
    openFile: runtimeImplementation.shell.keybindings.openFile.handler(() =>
      getShellKeybindingsService().openFile()
    ),
    revealFile: runtimeImplementation.shell.keybindings.revealFile.handler(() =>
      getShellKeybindingsService().revealFile()
    )
  },
  settings: {
    get: runtimeImplementation.shell.settings.get.handler(() => getShellSettingsService().get()),
    set: runtimeImplementation.shell.settings.set.handler(({ input, context }) =>
      getShellSettingsService().set(
        shellDocument(input, 'invalid_shell_settings'),
        requireShellRenderer(context.renderingWebContentsId).id
      )
    ),
    updatePRBotAuthorOverride:
      runtimeImplementation.shell.settings.updatePRBotAuthorOverride.handler(({ input, context }) =>
        getShellSettingsService().updatePRBotAuthorOverride(
          input,
          requireShellRenderer(context.renderingWebContentsId).id
        )
      )
  },
  session: {
    get: runtimeImplementation.shell.session.get.handler(({ input }) =>
      getShellSessionService().get(input?.hostId)
    ),
    set: runtimeImplementation.shell.session.set.handler(({ input }) =>
      getShellSessionService().set(
        shellDocument<WorkspaceSessionState>(input.session, 'invalid_shell_session'),
        input.hostId
      )
    ),
    patch: runtimeImplementation.shell.session.patch.handler(({ input }) =>
      getShellSessionService().patch(
        shellDocument<WorkspaceSessionPatch>(input.patch, 'invalid_shell_session_patch'),
        input.hostId
      )
    ),
    flush: runtimeImplementation.shell.session.flush.handler(() => getShellSessionService().flush())
  },
  onboarding: {
    get: runtimeImplementation.shell.onboarding.get.handler(() =>
      getShellOnboardingService().get()
    ),
    update: runtimeImplementation.shell.onboarding.update.handler(({ input }) =>
      getShellOnboardingService().update(input)
    )
  },
  cache: {
    getGitHub: runtimeImplementation.shell.cache.getGitHub.handler(() =>
      getShellSettingsService().getGitHubCache()
    ),
    setGitHub: runtimeImplementation.shell.cache.setGitHub.handler(({ input }) => {
      const args = shellDocument<{ cache: PersistedState['githubCache'] }>(
        input,
        'invalid_shell_github_cache'
      )
      getShellSettingsService().setGitHubCache(args.cache)
    })
  },
  yiruProfiles: {
    list: runtimeImplementation.shell.yiruProfiles.list.handler(() =>
      getShellYiruProfilesService().list()
    ),
    createLocal: runtimeImplementation.shell.yiruProfiles.createLocal.handler(({ input }) =>
      getShellYiruProfilesService().createLocal(
        input === undefined
          ? undefined
          : shellDocument<CreateLocalYiruProfileArgs>(input, 'invalid_yiru_profile_create')
      )
    ),
    switchProfile: runtimeImplementation.shell.yiruProfiles.switchProfile.handler(({ input }) =>
      getShellYiruProfilesService().switchProfile(
        shellDocument<SwitchYiruProfileArgs>(input, 'invalid_yiru_profile_switch')
      )
    ),
    transferProject: runtimeImplementation.shell.yiruProfiles.transferProject.handler(({ input }) =>
      getShellYiruProfilesService().transferProject(
        shellDocument<TransferYiruProfileProjectArgs>(input, 'invalid_yiru_profile_transfer')
      )
    ),
    findProjectProfiles: runtimeImplementation.shell.yiruProfiles.findProjectProfiles.handler(
      ({ input }) =>
        getShellYiruProfilesService().findProjectProfiles(
          shellDocument<FindYiruProfileProjectsByPathArgs>(input, 'invalid_yiru_profile_path')
        )
    )
  }
} as const

function shellDocument<T>(value: unknown, code: string): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(code)
  }
  // Why: runtime-protocol cannot import desktop-only shared document types;
  // the fixed-local boundary validates the container before restoring the
  // concrete main-process type used by the owning Store sanitizer.
  return value as T
}
