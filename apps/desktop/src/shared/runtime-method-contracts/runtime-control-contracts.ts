import { z } from 'zod'

import type {
  RemoteServerUpdateInstallResult,
  RemoteServerUpdaterSnapshot
} from '../remote-server-update'
import { defineRuntimeMethodContract } from '../runtime-method-contract'
import type { RuntimeStatus } from '../runtime-types'

export const STATUS_GET_CONTRACT = defineRuntimeMethodContract<RuntimeStatus>()({
  name: 'status.get',
  params: null,
  mobile: true
})

// Why: these methods can restart the owning process, so only authenticated
// runtime-scoped pairings may invoke them; mobile tokens remain status-only.
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
