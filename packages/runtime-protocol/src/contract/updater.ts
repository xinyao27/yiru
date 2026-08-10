import { type, type ContractRouter } from '@orpc/contract'

import {
  UpdaterCheckInputSchema,
  type RemoteServerUpdateInstallResult,
  type RemoteServerUpdaterSnapshot
} from '../updater.js'
import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

const UPDATER_ACCESS = { scope: 'host', tier: 'host' } as const

export const updaterContract = {
  getStatus: withAccess(UPDATER_ACCESS)
    .input(type<void>())
    .output(type<RemoteServerUpdaterSnapshot>()),
  check: withAccess(UPDATER_ACCESS)
    .input(UpdaterCheckInputSchema)
    .output(type<RemoteServerUpdaterSnapshot>()),
  download: withAccess(UPDATER_ACCESS)
    .input(type<void>())
    .output(type<RemoteServerUpdaterSnapshot>()),
  install: withAccess(UPDATER_ACCESS)
    .input(type<void>())
    .output(type<RemoteServerUpdateInstallResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export {
  UPDATER_CHECK_CONTRACT,
  UPDATER_DOWNLOAD_CONTRACT,
  UPDATER_GET_STATUS_CONTRACT,
  UPDATER_INSTALL_CONTRACT,
  UpdaterCheckInputSchema
} from '../updater.js'
export type {
  ChangelogData,
  ChangelogRelease,
  RemoteServerUpdateInstallMode,
  RemoteServerUpdateInstallResult,
  RemoteServerUpdaterSnapshot,
  RemoteServerUpdateSupport,
  UpdateCheckOptions,
  UpdaterCheckInput,
  UpdateStatus
} from '../updater.js'
