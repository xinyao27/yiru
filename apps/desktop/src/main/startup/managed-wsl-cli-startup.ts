import { app } from 'electron'

import { reconcileManagedWslCliRegistrations } from '../cli/wsl-cli-registration-reconciliation'
import { getCanonicalUserDataPath } from '../persistence'
import { createWslCliReconciliationStartupBarrier } from './wsl-cli-reconciliation-startup-barrier'

export type WslCliReconciliationStatus = 'pending' | 'settled' | 'failed'

export class ManagedWslCliStartup {
  #reconciliation: Promise<void> = Promise.resolve()
  #startupBarrier: Promise<void> = Promise.resolve()
  #status: WslCliReconciliationStatus = 'settled'

  start(): void {
    this.#status = 'pending'
    this.#reconciliation = reconcileManagedWslCliRegistrations({
      isPackaged: app.isPackaged,
      userDataPath: getCanonicalUserDataPath(),
      appVersion: app.getVersion()
    })
      .then((results) => {
        for (const result of results) {
          if (result.outcome === 'failed') {
            console.warn(
              `[wsl-cli] ${result.distro} managed registration reconciliation failed: ${result.error}`
            )
          } else if (result.outcome === 'repaired') {
            console.log(`[wsl-cli] Repaired managed registration in ${result.distro}.`)
          }
        }
        this.#status = 'settled'
      })
      .catch((error) => {
        this.#status = 'failed'
        console.warn(
          '[wsl-cli] Managed registration reconciliation discovery failed:',
          error instanceof Error ? error.message : String(error)
        )
      })
    this.#startupBarrier = createWslCliReconciliationStartupBarrier(this.#reconciliation)
  }

  getStatus(): WslCliReconciliationStatus {
    return this.#status
  }

  waitForReconciliation(): Promise<void> {
    return this.#reconciliation
  }

  waitForStartupBarrier(): Promise<void> {
    return this.#startupBarrier
  }
}
