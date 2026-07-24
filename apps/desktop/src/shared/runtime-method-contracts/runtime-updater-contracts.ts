import { z } from 'zod'

import type {
  RemoteServerUpdateInstallResult,
  RemoteServerUpdaterSnapshot
} from '../remote-server-update'
import { defineRuntimeMethodContract } from '../runtime-method-contract'

// Why: updater validation depends on Zod, which must stay outside the sandbox
// preload's status-only contract dependency graph.
export const UPDATER_GET_STATUS_CONTRACT =
  defineRuntimeMethodContract<RemoteServerUpdaterSnapshot>()({
    name: 'updater.getStatus',
    params: null,
    mobile: false
  })

export const UPDATER_CHECK_CONTRACT = defineRuntimeMethodContract<RemoteServerUpdaterSnapshot>()({
  name: 'updater.check',
  params: z.object({
    includePrerelease: z.boolean().optional(),
    includePerfPrerelease: z.boolean().optional()
  }),
  mobile: false
})

export const UPDATER_DOWNLOAD_CONTRACT = defineRuntimeMethodContract<RemoteServerUpdaterSnapshot>()(
  {
    name: 'updater.download',
    params: null,
    mobile: false
  }
)

export const UPDATER_INSTALL_CONTRACT =
  defineRuntimeMethodContract<RemoteServerUpdateInstallResult>()({
    name: 'updater.install',
    params: null,
    mobile: false
  })
