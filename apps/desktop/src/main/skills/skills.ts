import { app, BrowserWindow, ipcMain } from 'electron'

import type {
  SkillFreshnessInventory,
  SkillUpdateRun,
  SkillUpdateStartResult
} from '../../shared/skill-freshness'
import {
  SkillDiscoveryTargetSchema,
  type SkillDiscoveryResult,
  type SkillDiscoveryTarget
} from '../../shared/skills'
import type { Store } from '../persistence'
import { discoverSkillsOnTarget, resolveSkillDiscoveryTarget } from './skill-discovery-target'
import { inventorySkillFreshness } from './skill-freshness-inventory'
import { skillUpdateFailedNames } from './skill-update-outcome'
import { readGloballyUpdatableSkillLocks } from './skill-update-registration'
import { SkillUpdateRunner } from './skill-update-run'

export function registerSkillsHandlers(store: Store): void {
  const scanInventory = (): Promise<SkillFreshnessInventory> =>
    inventorySkillFreshness({
      currentAppVersion: app.getVersion(),
      repos: store.getRepos()
    })

  const runner = new SkillUpdateRunner({
    rescanOutdatedNames: async (names) => {
      const [inventory, globalSkillLocks] = await Promise.all([
        scanInventory(),
        readGloballyUpdatableSkillLocks()
      ])
      return skillUpdateFailedNames(names, inventory.installations, globalSkillLocks)
    },
    onState: (run: SkillUpdateRun) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send('skills:updateRun', run)
        }
      }
    }
  })

  ipcMain.handle(
    'skills:discover',
    async (_event, target?: SkillDiscoveryTarget): Promise<SkillDiscoveryResult> => {
      const parsedTarget = target ? SkillDiscoveryTargetSchema.parse(target) : undefined
      return discoverSkillsOnTarget(resolveSkillDiscoveryTarget(parsedTarget), store.getRepos())
    }
  )

  ipcMain.handle('skills:freshnessInventory', async (): Promise<SkillFreshnessInventory> => {
    return scanInventory()
  })

  ipcMain.handle(
    'skills:startUpdateRun',
    async (_event, names: string[]): Promise<SkillUpdateStartResult> =>
      runner.start(Array.isArray(names) ? names : [])
  )

  ipcMain.handle('skills:cancelUpdateRun', async (): Promise<void> => {
    runner.cancel()
  })

  ipcMain.handle('skills:acknowledgeUpdateRun', async (): Promise<void> => {
    runner.acknowledge()
  })

  ipcMain.handle('skills:getUpdateRun', async (): Promise<SkillUpdateRun> => {
    return runner.getState()
  })
}
