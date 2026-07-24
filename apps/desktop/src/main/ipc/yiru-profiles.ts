import { normalizeExecutionHostId } from '@yiru/workbench-model/workspace'
import { app, ipcMain } from 'electron'

import type {
  CreateLocalYiruProfileArgs,
  CreateLocalYiruProfileResult,
  FindYiruProfileProjectsByPathArgs,
  FindYiruProfileProjectsByPathResult,
  YiruProfileListResult,
  SwitchYiruProfileArgs,
  SwitchYiruProfileResult,
  TransferYiruProfileProjectArgs,
  TransferYiruProfileProjectResult
} from '../../shared/yiru-profiles'
import type { Store } from '../persistence'
import {
  createLocalYiruProfile,
  getYiruProfileListState,
  seedNewYiruProfileTelemetryConsent,
  setActiveYiruProfile
} from '../yiru-profiles/profile-index-store'
import { findYiruProfileProjectsByPath } from '../yiru-profiles/profile-project-presence'
import { transferYiruProfileProject } from '../yiru-profiles/profile-project-transfer'
import { getProfileUserDataPath } from '../yiru-profiles/profile-storage-paths'
import { isMultiProfileUiEnabled } from '../yiru-profiles/profile-ui-scope'

type RegisterYiruProfileHandlersOptions = {
  onBeforeRelaunch?: () => void | Promise<void>
}

function profileIdFromArgs(args: unknown): string {
  if (
    !args ||
    typeof args !== 'object' ||
    typeof (args as SwitchYiruProfileArgs).profileId !== 'string'
  ) {
    throw new Error('invalid_yiru_profile_id')
  }
  const profileId = (args as SwitchYiruProfileArgs).profileId.trim()
  if (!profileId) {
    throw new Error('invalid_yiru_profile_id')
  }
  return profileId
}

function transferProjectArgsFromUnknown(args: unknown): TransferYiruProfileProjectArgs {
  if (!args || typeof args !== 'object') {
    throw new Error('invalid_yiru_profile_project_transfer')
  }
  const candidate = args as TransferYiruProfileProjectArgs
  const sourceProfileId = candidate.sourceProfileId?.trim()
  const targetProfileId = candidate.targetProfileId?.trim()
  const repoId = candidate.repoId?.trim()
  const mode = candidate.mode
  if (!sourceProfileId || !targetProfileId || !repoId || (mode !== 'move' && mode !== 'copy')) {
    throw new Error('invalid_yiru_profile_project_transfer')
  }
  return {
    sourceProfileId,
    targetProfileId,
    repoId,
    mode
  }
}

function findProjectsByPathArgsFromUnknown(args: unknown): FindYiruProfileProjectsByPathArgs {
  if (!args || typeof args !== 'object') {
    throw new Error('invalid_yiru_profile_project_path')
  }
  const candidate = args as FindYiruProfileProjectsByPathArgs
  const path = typeof candidate.path === 'string' ? candidate.path.trim() : ''
  if (!path) {
    throw new Error('invalid_yiru_profile_project_path')
  }
  let executionHostId: FindYiruProfileProjectsByPathArgs['executionHostId'] = null
  if (candidate.executionHostId !== null && candidate.executionHostId !== undefined) {
    if (typeof candidate.executionHostId !== 'string') {
      throw new Error('invalid_yiru_profile_project_path')
    }
    executionHostId = normalizeExecutionHostId(candidate.executionHostId)
    if (!executionHostId) {
      throw new Error('invalid_yiru_profile_project_path')
    }
  }
  return {
    path,
    connectionId:
      typeof candidate.connectionId === 'string' ? candidate.connectionId.trim() || null : null,
    executionHostId,
    excludeProfileId:
      typeof candidate.excludeProfileId === 'string'
        ? candidate.excludeProfileId.trim() || null
        : null
  }
}

async function runBeforeProfileRelaunch(
  onBeforeRelaunch?: () => void | Promise<void>
): Promise<void> {
  try {
    await onBeforeRelaunch?.()
  } catch (error) {
    console.warn(
      '[yiru-profiles] Pre-relaunch cleanup failed; continuing profile switch:',
      error instanceof Error ? error.name : typeof error
    )
  }
}

function scheduleProfileRelaunch(): void {
  setTimeout(() => {
    app.relaunch()
    // Why: app.quit() (not app.exit) so before-quit/will-quit still run —
    // renderer scrollback capture, PTY kill, stats flush, and daemon final
    // checkpoints must not be skipped on a profile switch.
    app.quit()
  }, 150)
}

export function registerYiruProfileHandlers(
  store: Store,
  options: RegisterYiruProfileHandlersOptions = {}
): void {
  ipcMain.handle(
    'yiruProfiles:list',
    (): YiruProfileListResult => ({
      ...getYiruProfileListState(),
      multiProfileUi: isMultiProfileUiEnabled()
    })
  )

  ipcMain.handle(
    'yiruProfiles:createLocal',
    (_event, args?: CreateLocalYiruProfileArgs): CreateLocalYiruProfileResult => {
      const result = createLocalYiruProfile(args)
      seedNewYiruProfileTelemetryConsent(result.profile.id, store.getSettings().telemetry)
      return result
    }
  )

  ipcMain.handle(
    'yiruProfiles:switch',
    async (_event, args: SwitchYiruProfileArgs): Promise<SwitchYiruProfileResult> => {
      const profileId = profileIdFromArgs(args)
      const current = getYiruProfileListState()
      if (profileId === current.activeProfileId) {
        return { status: 'already-active' }
      }

      // Why: the current profile must be persisted before the global index
      // points startup at the target profile.
      await runBeforeProfileRelaunch(options.onBeforeRelaunch)
      store.flush()
      setActiveYiruProfile(profileId)

      scheduleProfileRelaunch()

      return { status: 'relaunching' }
    }
  )

  ipcMain.handle(
    'yiruProfiles:transferProject',
    async (
      _event,
      rawArgs: TransferYiruProfileProjectArgs
    ): Promise<TransferYiruProfileProjectResult> => {
      const args = transferProjectArgsFromUnknown(rawArgs)
      const current = getYiruProfileListState()
      if (args.targetProfileId === current.activeProfileId) {
        throw new Error('active_target_yiru_profile_transfer_requires_relaunch')
      }
      if (args.mode === 'move' && args.sourceProfileId === current.activeProfileId) {
        // Why: transfer before any relaunch side effect so a duplicate-target
        // or validation failure cannot strand the app in a quitting state.
        // flush→transfer→freeze runs synchronously with no interleaving, and
        // the freeze keeps late sync saves from resurrecting the moved
        // project from stale memory before the relaunch.
        store.flush()
        const result = transferYiruProfileProject(args, getProfileUserDataPath())
        if (result.status === 'transferred') {
          store.freezeWrites()
          await runBeforeProfileRelaunch(options.onBeforeRelaunch)
          setActiveYiruProfile(args.targetProfileId)
          scheduleProfileRelaunch()
          return { ...result, willRelaunch: true }
        }
        return result
      }
      store.flush()
      return transferYiruProfileProject(args, getProfileUserDataPath())
    }
  )

  ipcMain.handle(
    'yiruProfiles:findProjectProfiles',
    (_event, rawArgs: FindYiruProfileProjectsByPathArgs): FindYiruProfileProjectsByPathResult =>
      findYiruProfileProjectsByPath(
        findProjectsByPathArgsFromUnknown(rawArgs),
        getProfileUserDataPath()
      )
  )
}
