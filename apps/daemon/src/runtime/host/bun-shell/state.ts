import { spawn } from 'node:child_process'
import { dirname } from 'node:path'

import type { ShellEvent } from '@yiru/runtime-protocol/contract'
import { applyPRBotAuthorOverride } from '@yiru/runtime-protocol/model/review'
import { normalizeExecutionHostId } from '@yiru/runtime-protocol/model/workspace'
import { isKeybindingActionId } from '@yiru/runtime-protocol/workbench/keybindings'
import type {
  CreateLocalYiruProfileArgs,
  FindYiruProfileProjectsByPathArgs,
  SwitchYiruProfileArgs,
  TransferYiruProfileProjectArgs
} from '@yiru/runtime-protocol/workbench/yiru-profiles'
import { KeybindingService } from '~main/keybindings/keybinding-service'
import { sanitizeOnboardingUpdate } from '~main/persisted-state/persisted-onboarding-codec'
import type { Store } from '~main/persistence/store'
import { runtimeImplementation } from '~main/runtime/rpc/orpc/access-middleware'
import type { DaemonRestart } from '~main/server/restart'

import {
  createLocalYiruProfile,
  getYiruProfileListState,
  seedNewYiruProfileTelemetryConsent,
  setActiveYiruProfile
} from '../../../yiru-profiles/profile-index-store'
import { findYiruProfileProjectsByPath } from '../../../yiru-profiles/profile-project-presence'
import { transferYiruProfileProject } from '../../../yiru-profiles/profile-project-transfer'
import { isMultiProfileUiEnabled } from '../../../yiru-profiles/profile-ui-scope'
import { getRuntimeHostPathsProvider } from '../paths-provider'

export function createBunShellStateHandlers(
  store: Store,
  userDataPath: string,
  restartDaemon: DaemonRestart,
  publishShellEvent: (event: ShellEvent) => void
) {
  const keybindings = new KeybindingService({
    getLegacyOverrides: () => store.getSettings().keybindings,
    homePath: getRuntimeHostPathsProvider().homePath()
  })

  return {
    cache: {
      getGitHub: runtimeImplementation.shell.cache.getGitHub.handler(() => store.getGitHubCache()),
      setGitHub: runtimeImplementation.shell.cache.setGitHub.handler(({ input }) => {
        store.setGitHubCache(input.cache)
      })
    },
    keybindings: {
      get: runtimeImplementation.shell.keybindings.get.handler(() => keybindings.getSnapshot()),
      ensureFile: runtimeImplementation.shell.keybindings.ensureFile.handler(() => {
        const snapshot = keybindings.ensureFile()
        publishShellEvent({ snapshot, type: 'keybindingsChanged' })
        return snapshot
      }),
      setAction: runtimeImplementation.shell.keybindings.setAction.handler(({ input }) => {
        if (!isKeybindingActionId(input.actionId)) {
          throw new Error('invalid_keybinding_action')
        }
        const snapshot = keybindings.setActionBindings(input.actionId, input.bindings)
        publishShellEvent({ snapshot, type: 'keybindingsChanged' })
        return snapshot
      }),
      reload: runtimeImplementation.shell.keybindings.reload.handler(() => {
        const snapshot = keybindings.reload()
        publishShellEvent({ snapshot, type: 'keybindingsChanged' })
        return snapshot
      }),
      openFile: runtimeImplementation.shell.keybindings.openFile.handler(() => {
        const snapshot = keybindings.ensureFile()
        openHostPath(snapshot.path, false)
        return snapshot
      }),
      revealFile: runtimeImplementation.shell.keybindings.revealFile.handler(() => {
        const snapshot = keybindings.ensureFile()
        openHostPath(snapshot.path, true)
        return snapshot
      })
    },
    onboarding: {
      get: runtimeImplementation.shell.onboarding.get.handler(() => store.getOnboarding()),
      update: runtimeImplementation.shell.onboarding.update.handler(({ input }) =>
        store.updateOnboarding(sanitizeOnboardingUpdate(input))
      )
    },
    session: {
      get: runtimeImplementation.shell.session.get.handler(({ input }) =>
        store.getWorkspaceSession(input?.hostId)
      ),
      set: runtimeImplementation.shell.session.set.handler(({ input }) => {
        store.setWorkspaceSession(input.session, input.hostId)
      }),
      patch: runtimeImplementation.shell.session.patch.handler(({ input }) => {
        store.patchWorkspaceSession(input.patch, input.hostId)
      }),
      flush: runtimeImplementation.shell.session.flush.handler(() => store.flushOrThrow())
    },
    settings: {
      get: runtimeImplementation.shell.settings.get.handler(() => store.getSettings()),
      set: runtimeImplementation.shell.settings.set.handler(({ input }) => {
        return store.updateSettings(input, { notifyListeners: true })
      }),
      updatePRBotAuthorOverride:
        runtimeImplementation.shell.settings.updatePRBotAuthorOverride.handler(({ input }) => {
          const current = store.getSettings().prBotAuthorOverrides
          const next = applyPRBotAuthorOverride(current, input.author, input.isBot)
          return store.updateSettings({ prBotAuthorOverrides: next }, { notifyListeners: true })
        })
    },
    yiruProfiles: createProfileHandlers(store, userDataPath, restartDaemon)
  }
}

function createProfileHandlers(store: Store, userDataPath: string, restartDaemon: DaemonRestart) {
  return {
    list: runtimeImplementation.shell.yiruProfiles.list.handler(() => ({
      ...getYiruProfileListState(userDataPath),
      multiProfileUi: isMultiProfileUiEnabled()
    })),
    createLocal: runtimeImplementation.shell.yiruProfiles.createLocal.handler(({ input }) => {
      const args = optionalProfileCreateArgs(input)
      const result = createLocalYiruProfile(args, userDataPath)
      seedNewYiruProfileTelemetryConsent(
        result.profile.id,
        store.getSettings().telemetry,
        userDataPath
      )
      return result
    }),
    switchProfile: runtimeImplementation.shell.yiruProfiles.switchProfile.handler(({ input }) => {
      const args = profileSwitchArgs(input)
      const current = getYiruProfileListState(userDataPath)
      if (args.profileId === current.activeProfileId) {
        return { status: 'already-active' as const }
      }
      store.flushOrThrow()
      setActiveYiruProfile(args.profileId, userDataPath)
      restartDaemon()
      return { status: 'relaunching' as const }
    }),
    transferProject: runtimeImplementation.shell.yiruProfiles.transferProject.handler(
      ({ input }) => {
        const args = profileTransferArgs(input)
        store.flushOrThrow()
        const result = transferYiruProfileProject(args, userDataPath)
        const activeProfileId = getYiruProfileListState(userDataPath).activeProfileId
        if (
          result.status === 'transferred' &&
          args.mode === 'move' &&
          args.sourceProfileId === activeProfileId
        ) {
          store.freezeWrites()
          setActiveYiruProfile(args.targetProfileId, userDataPath)
          restartDaemon()
          return { ...result, willRelaunch: true }
        }
        return result
      }
    ),
    findProjectProfiles: runtimeImplementation.shell.yiruProfiles.findProjectProfiles.handler(
      ({ input }) => findYiruProfileProjectsByPath(profileProjectPathArgs(input), userDataPath)
    )
  }
}

function optionalProfileCreateArgs(value: unknown): CreateLocalYiruProfileArgs | undefined {
  if (value === undefined) {
    return undefined
  }
  const input = requireRecord(value, 'invalid_yiru_profile_create')
  const name = Reflect.get(input, 'name')
  if (name !== undefined && typeof name !== 'string') {
    throw new Error('invalid_yiru_profile_create')
  }
  return typeof name === 'string' ? { name } : {}
}

function profileSwitchArgs(value: unknown): SwitchYiruProfileArgs {
  const input = requireRecord(value, 'invalid_yiru_profile_id')
  const profileId = Reflect.get(input, 'profileId')
  if (typeof profileId !== 'string' || !profileId.trim()) {
    throw new Error('invalid_yiru_profile_id')
  }
  return { profileId: profileId.trim() }
}

function profileTransferArgs(value: unknown): TransferYiruProfileProjectArgs {
  const input = requireRecord(value, 'invalid_yiru_profile_project_transfer')
  const sourceProfileId = readRequiredString(input, 'sourceProfileId')
  const targetProfileId = readRequiredString(input, 'targetProfileId')
  const repoId = readRequiredString(input, 'repoId')
  const mode = Reflect.get(input, 'mode')
  if (mode !== 'move' && mode !== 'copy') {
    throw new Error('invalid_yiru_profile_project_transfer')
  }
  return { mode, repoId, sourceProfileId, targetProfileId }
}

function profileProjectPathArgs(value: unknown): FindYiruProfileProjectsByPathArgs {
  const input = requireRecord(value, 'invalid_yiru_profile_project_path')
  const path = readRequiredString(input, 'path')
  const rawHostId = Reflect.get(input, 'executionHostId')
  const executionHostId = typeof rawHostId === 'string' ? normalizeExecutionHostId(rawHostId) : null
  if (rawHostId !== undefined && rawHostId !== null && !executionHostId) {
    throw new Error('invalid_yiru_profile_project_path')
  }
  return {
    path,
    connectionId: readOptionalString(input, 'connectionId'),
    executionHostId,
    excludeProfileId: readOptionalString(input, 'excludeProfileId')
  }
}

function requireRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(code)
  }
  return value as Record<string, unknown>
}

function readRequiredString(input: Record<string, unknown>, key: string): string {
  const value = Reflect.get(input, key)
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('invalid_yiru_profile_project_transfer')
  }
  return value.trim()
}

function readOptionalString(input: Record<string, unknown>, key: string): string | null {
  const value = Reflect.get(input, key)
  return typeof value === 'string' ? value.trim() || null : null
}

function openHostPath(path: string, reveal: boolean): void {
  const command =
    process.platform === 'darwin'
      ? ['open', ...(reveal ? ['-R'] : []), path]
      : process.platform === 'win32'
        ? ['explorer.exe', ...(reveal ? [`/select,${path}`] : [path])]
        : ['xdg-open', reveal ? dirname(path) : path]
  const child = spawn(command[0] ?? '', command.slice(1), {
    detached: true,
    stdio: 'ignore'
  })
  child.unref()
}
