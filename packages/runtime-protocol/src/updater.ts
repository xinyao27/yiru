import { z } from 'zod'

export type ChangelogRelease = {
  title: string
  description: string
  mediaUrl?: string
  releaseNotesUrl: string
}

export type ChangelogData = {
  release: ChangelogRelease
  releasesBehind: number | null
}

export type UpdateCheckOptions = {
  includePrerelease?: boolean
  includePerfPrerelease?: boolean
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking'; userInitiated?: boolean }
  | {
      state: 'available'
      version: string
      activeNudgeId?: string
      releaseUrl?: string
      changelog: ChangelogData | null
    }
  | { state: 'not-available'; userInitiated?: boolean }
  | { state: 'downloading'; percent: number; version: string; activeNudgeId?: string }
  | { state: 'downloaded'; version: string; releaseUrl?: string; activeNudgeId?: string }
  | { state: 'error'; message: string; userInitiated?: boolean; activeNudgeId?: string }

export type RemoteServerUpdateInstallMode =
  | 'interactive'
  | 'supervised-headless-serve'
  | 'unsupported-headless-serve'

export type RemoteServerUpdateSupport = {
  installMode: RemoteServerUpdateInstallMode
  automatic: boolean
  reason:
    | 'available'
    | 'manual-service-update-required'
    | 'unpackaged-build'
    | 'updater-unavailable'
}

export type RemoteServerUpdaterSnapshot = {
  appVersion: string
  runtimeId: string
  support: RemoteServerUpdateSupport
  status: UpdateStatus
}

export type RemoteServerUpdateInstallResult = {
  accepted: true
  fromVersion: string
  targetVersion: string
  runtimeId: string
}

export const UpdaterCheckInputSchema = z.object({
  includePrerelease: z.boolean().optional(),
  includePerfPrerelease: z.boolean().optional()
})

export type UpdaterCheckInput = z.output<typeof UpdaterCheckInputSchema>

type RuntimeUpdaterLegacyContract<TName extends string, TParams, TResult> = Readonly<{
  name: TName
  params: TParams
  mobile: false
  resultType?: TResult
}>

export const UPDATER_GET_STATUS_CONTRACT: RuntimeUpdaterLegacyContract<
  'updater.getStatus',
  null,
  RemoteServerUpdaterSnapshot
> = { name: 'updater.getStatus', params: null, mobile: false }

export const UPDATER_CHECK_CONTRACT: RuntimeUpdaterLegacyContract<
  'updater.check',
  typeof UpdaterCheckInputSchema,
  RemoteServerUpdaterSnapshot
> = { name: 'updater.check', params: UpdaterCheckInputSchema, mobile: false }

export const UPDATER_DOWNLOAD_CONTRACT: RuntimeUpdaterLegacyContract<
  'updater.download',
  null,
  RemoteServerUpdaterSnapshot
> = { name: 'updater.download', params: null, mobile: false }

export const UPDATER_INSTALL_CONTRACT: RuntimeUpdaterLegacyContract<
  'updater.install',
  null,
  RemoteServerUpdateInstallResult
> = { name: 'updater.install', params: null, mobile: false }
