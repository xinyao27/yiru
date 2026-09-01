import { shutdownComputerProvider } from '../computer/provider'
import { translate } from '../i18n/translate'
import type { startMobileServer } from '../mobile/server'
import { clearExtensionBootstrap } from '../native-messaging/bootstrap-file'
import type { NotificationService } from '../notifications/service'
import type { BunPtyProvider } from '../pty-provider/provider'
import type { RitualScheduler } from '../rituals/scheduler'
import { clearRuntimeMetadataIfOwned } from '../runtime/metadata'
import { getDaemonVersion } from '../runtime/paths'
import type { DaemonDatabase } from '../store/database'
import type { WorkbenchRuntimeBridge } from '../workbench/runtime'
import type { startExtensionServer } from './extension-server'

export type DaemonResources = {
  database: DaemonDatabase
  detachProjectCatalog: () => void
  detachWorkbenchEvents: () => void
  extensionServer: ReturnType<typeof startExtensionServer>
  mobileServer: ReturnType<typeof startMobileServer>
  notifications: NotificationService
  ritualScheduler: RitualScheduler
  runtimeId: string
  terminals: BunPtyProvider
  userDataPath: string
  workbenchRuntime: WorkbenchRuntimeBridge
}

export async function shutdownDaemon(resources: DaemonResources): Promise<void> {
  resources.ritualScheduler.dispose()
  shutdownComputerProvider()
  resources.detachProjectCatalog()
  resources.detachWorkbenchEvents()
  try {
    await resources.mobileServer.shutdown()
  } finally {
    try {
      await resources.extensionServer.shutdown()
    } finally {
      try {
        await resources.workbenchRuntime.shutdown()
      } finally {
        try {
          await resources.terminals.shutdownAll()
        } finally {
          try {
            await resources.notifications.drain()
          } finally {
            clearExtensionBootstrap(resources.userDataPath, process.pid)
            clearRuntimeMetadataIfOwned(resources.userDataPath, process.pid, resources.runtimeId)
            resources.database.close()
          }
        }
      }
    }
  }
}

export function printReadiness(readiness: {
  extensionEndpoint: string
  json: boolean
  mobileEndpoint: string
  pairingUrl: string | null
  runtimeId: string
}): void {
  if (readiness.json) {
    console.log(JSON.stringify({ status: 'ready', ...readiness }))
    return
  }
  console.log(`${translate('Yiru daemon ready')}: ${readiness.runtimeId}`)
  console.log(`${translate('Extension endpoint')}: ${readiness.extensionEndpoint}`)
  console.log(`${translate('Mobile endpoint')}: ${readiness.mobileEndpoint}`)
  if (readiness.pairingUrl) {
    console.log(`${translate('Mobile pairing')}: ${readiness.pairingUrl}`)
  }
}

export function notifySupervisorReady(runtimeId: string): void {
  if (!process.send || process.connected === false) {
    return
  }
  try {
    process.send({ type: 'yiru:serve-ready', version: getDaemonVersion(), runtimeId })
  } catch {}
}
