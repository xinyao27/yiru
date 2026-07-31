import { app, BrowserWindow, ipcMain } from 'electron'
import { z } from 'zod'

import type {
  SkillFreshnessInventory,
  SkillManageScope,
  SkillUpdateRun,
  SkillUpdateStartResult
} from '../../shared/skill-freshness'
import {
  SkillDiscoveryTargetSchema,
  type SkillDiscoveryResult,
  type SkillDiscoveryTarget,
  type SkillDirectoryListing,
  type SkillFileReadResult
} from '../../shared/skills'
import type { Store } from '../persistence'
import { SkillCliRunner } from './skill-cli-run'
import { listSkillFiles, readSkillDirectoryFile } from './skill-directory-access'
import { discoverSkillsOnTarget, resolveSkillDiscoveryTarget } from './skill-discovery-target'
import { inventorySkillFreshness } from './skill-freshness-inventory'
import { resolveSkillRunFailedNames } from './skill-run-verdict'
import { readGloballyUpdatableSkillLocks } from './skill-update-registration'

const SkillManageScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('global') }),
  z.object({ kind: z.literal('project'), repoPath: z.string().min(1) })
])

const SkillInstallRequestSchema = z.object({
  source: z.string(),
  skillNames: z.array(z.string()).optional(),
  scope: SkillManageScopeSchema
})

const SkillRemoveRequestSchema = z.object({
  names: z.array(z.string()),
  scope: SkillManageScopeSchema
})

export function registerSkillsHandlers(store: Store): void {
  const scanInventory = (): Promise<SkillFreshnessInventory> =>
    inventorySkillFreshness({
      currentAppVersion: app.getVersion(),
      repos: store.getRepos()
    })

  const discoverLocalSkills = (): Promise<SkillDiscoveryResult> =>
    discoverSkillsOnTarget(resolveSkillDiscoveryTarget(undefined), store.getRepos())

  const runner = new SkillCliRunner({
    rescanFailedNames: (invocation) =>
      resolveSkillRunFailedNames(invocation, {
        inventory: scanInventory,
        globalSkillLocks: readGloballyUpdatableSkillLocks,
        globalDiscovery: discoverLocalSkills
      }),
    onState: (run: SkillUpdateRun) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send('skills:updateRun', run)
        }
      }
    }
  })

  // Why: the scope becomes the spawn cwd of a command that writes files, so a
  // project scope is only honoured for a path the user already stored as a repo.
  const resolveStoredScope = (scope: SkillManageScope): SkillManageScope | null => {
    if (scope.kind === 'global') {
      return scope
    }
    return store.getRepos().some((repo) => repo.path === scope.repoPath) ? scope : null
  }

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
      runner.start({ operation: 'update', names: Array.isArray(names) ? names : [] })
  )

  ipcMain.handle(
    'skills:startInstallRun',
    async (_event, request: unknown): Promise<SkillUpdateStartResult> => {
      const parsed = SkillInstallRequestSchema.safeParse(request)
      if (!parsed.success) {
        return { started: false, reason: 'invalid-source' }
      }
      const scope = resolveStoredScope(parsed.data.scope)
      if (!scope) {
        return { started: false, reason: 'invalid-scope' }
      }
      return runner.start({
        operation: 'install',
        source: parsed.data.source,
        skillNames: parsed.data.skillNames,
        scope
      })
    }
  )

  ipcMain.handle(
    'skills:startRemoveRun',
    async (_event, request: unknown): Promise<SkillUpdateStartResult> => {
      const parsed = SkillRemoveRequestSchema.safeParse(request)
      if (!parsed.success) {
        return { started: false, reason: 'invalid-names' }
      }
      const scope = resolveStoredScope(parsed.data.scope)
      if (!scope) {
        return { started: false, reason: 'invalid-scope' }
      }
      return runner.start({ operation: 'remove', names: parsed.data.names, scope })
    }
  )

  ipcMain.handle(
    'skills:listSkillFiles',
    async (_event, directoryPath: unknown): Promise<SkillDirectoryListing> =>
      listSkillFiles(directoryPath)
  )

  ipcMain.handle(
    'skills:readSkillDirFile',
    async (_event, request: unknown): Promise<SkillFileReadResult> =>
      readSkillDirectoryFile(request)
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
