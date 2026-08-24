import { app, type BrowserWindow } from 'electron'

import {
  createCoworkingOwnerComposition,
  type CoworkingOwnerComposition
} from '../coworking/owner/composition'
import { registerCoworkingSharingController } from '../coworking/sharing'
import { CoworkingUnavailableOwnerService } from '../coworking/unavailable-owner-service'
import { triggerStartupNotificationRegistration } from '../notifications/notifications'
import { getCanonicalUserDataPath, type Store } from '../persistence'
import type { RateLimitService } from '../rate-limits/service'
import type { YiruRuntimeRpcServer } from '../runtime/rpc'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'
import { connectWebConnectIfPaired } from '../web-connect/desktop-integration'

export type WindowedRuntime = {
  coworkingOwner: CoworkingOwnerComposition | null
  unregisterCoworkingSharingController: () => void
}

export async function startWindowedRuntime(options: {
  store: Store
  runtime: YiruRuntimeService
  runtimeRpc: YiruRuntimeRpcServer
  rateLimits: RateLimitService
  profileId: string
  openMainWindow: () => BrowserWindow
}): Promise<WindowedRuntime> {
  let coworkingOwner: CoworkingOwnerComposition | null = null
  let unregisterCoworkingSharingController: () => void
  try {
    coworkingOwner = createCoworkingOwnerComposition({
      store: options.store,
      runtime: options.runtime,
      runtimeRpc: options.runtimeRpc,
      rateLimits: options.rateLimits,
      userDataPath: getCanonicalUserDataPath(),
      profileId: options.profileId,
      ownerRuntimeId: options.runtime.getRuntimeId(),
      yiruVersion: app.getVersion(),
      isPackaged: app.isPackaged,
      executablePath: process.execPath,
      osFamily:
        process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux'
    })
    options.runtimeRpc.setGrantJournal(coworkingOwner.grantJournal)
    unregisterCoworkingSharingController = registerCoworkingSharingController(
      options.runtime,
      coworkingOwner.service
    )
  } catch (error) {
    console.error('[coworking] Failed to compose Desktop sharing:', error)
    unregisterCoworkingSharingController = registerCoworkingSharingController(
      options.runtime,
      new CoworkingUnavailableOwnerService(options.runtimeRpc)
    )
  }

  const [window] = await Promise.all([
    Promise.resolve(options.openMainWindow()),
    options.runtimeRpc
      .start()
      .then(() => connectWebConnectIfPaired())
      .catch((error) => {
        console.error('[runtime] Failed to start local RPC transport:', error)
      }),
    coworkingOwner?.start()
  ])
  window.once('show', () => {
    const onboarding = options.store.getOnboarding()
    if (onboarding.closedAt !== null) {
      triggerStartupNotificationRegistration(options.store)
    }
  })
  return { coworkingOwner, unregisterCoworkingSharingController }
}
