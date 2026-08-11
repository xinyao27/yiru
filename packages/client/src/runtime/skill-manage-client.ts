import { useAppStore } from '~renderer/store'
import type {
  SkillFreshnessInventory,
  SkillManageScope,
  SkillUpdateRun,
  SkillUpdateStartResult
} from '~shared/skill-freshness'
import type {
  SkillDirectoryListing,
  SkillDiscoveryResult,
  SkillDiscoveryTarget,
  SkillFileReadResult
} from '~shared/skills'

import { callRuntimeOrpc, createRuntimeOrpcClient, type RuntimeClientTarget } from './orpc-client'
import { getActiveRuntimeTarget } from './rpc-client'

function isWebRuntimeClient(): boolean {
  return (globalThis as { __YIRU_WEB_CLIENT__?: boolean }).__YIRU_WEB_CLIENT__ === true
}

// Why: the manage rail had no web coverage at all — a pure `unsupported` stub
// — so there is nothing web-specific to preserve. Both platforms resolve the
// same way: local when no runtime environment is paired, that environment's
// host otherwise (the web shim keeps `activeRuntimeEnvironmentId` synced to
// whichever host it is connected to, so this is never actually undefined there).
function activeSkillManageTarget(): RuntimeClientTarget {
  return getActiveRuntimeTarget(useAppStore.getState().settings)
}

export function discoverSkills(target?: SkillDiscoveryTarget): Promise<SkillDiscoveryResult> {
  const runtimeTarget = isWebRuntimeClient()
    ? activeSkillManageTarget()
    : { kind: 'local' as const }
  return callRuntimeOrpc(runtimeTarget, (client) => client.skills.discover, target)
}

export function getSkillFreshnessInventory(): Promise<SkillFreshnessInventory> {
  return callRuntimeOrpc(
    activeSkillManageTarget(),
    (client) => client.skills.manage.freshnessInventory,
    undefined
  )
}

export function startSkillManageUpdateRun(names: string[]): Promise<SkillUpdateStartResult> {
  return callRuntimeOrpc(
    activeSkillManageTarget(),
    (client) => client.skills.manage.startUpdateRun,
    {
      names
    }
  )
}

export function startSkillManageInstallRun(request: {
  source: string
  skillNames?: string[]
  scope: SkillManageScope
}): Promise<SkillUpdateStartResult> {
  return callRuntimeOrpc(
    activeSkillManageTarget(),
    (client) => client.skills.manage.startInstallRun,
    request
  )
}

export function startSkillManageRemoveRun(request: {
  names: string[]
  scope: SkillManageScope
}): Promise<SkillUpdateStartResult> {
  return callRuntimeOrpc(
    activeSkillManageTarget(),
    (client) => client.skills.manage.startRemoveRun,
    request
  )
}

export function listSkillManageFiles(directoryPath: string): Promise<SkillDirectoryListing> {
  return callRuntimeOrpc(
    activeSkillManageTarget(),
    (client) => client.skills.manage.listSkillFiles,
    {
      directoryPath
    }
  )
}

export function readSkillManageDirFile(request: {
  directoryPath: string
  relativePath: string
}): Promise<SkillFileReadResult> {
  return callRuntimeOrpc(
    activeSkillManageTarget(),
    (client) => client.skills.manage.readSkillDirFile,
    request
  )
}

export function cancelSkillManageUpdateRun(): Promise<SkillUpdateRun> {
  return callRuntimeOrpc(
    activeSkillManageTarget(),
    (client) => client.skills.manage.cancelUpdateRun,
    undefined
  )
}

export function acknowledgeSkillManageUpdateRun(): Promise<SkillUpdateRun> {
  return callRuntimeOrpc(
    activeSkillManageTarget(),
    (client) => client.skills.manage.acknowledgeUpdateRun,
    undefined
  )
}

export function getSkillManageUpdateRun(): Promise<SkillUpdateRun> {
  return callRuntimeOrpc(
    activeSkillManageTarget(),
    (client) => client.skills.manage.getUpdateRun,
    undefined
  )
}

// Why: the run is one host-wide operation, so one subscription per renderer
// lifetime is enough — mirrors the upstream-open step of the web adapter's
// `createRuntimeStreamFanOut`, minus the multi-listener fan-out that helper
// needs and this module-level store (its one subscriber) does not.
export function subscribeSkillManageUpdateRun(onRun: (run: SkillUpdateRun) => void): () => void {
  const controller = new AbortController()
  void (async () => {
    let connection: Awaited<ReturnType<typeof createRuntimeOrpcClient>> | null = null
    try {
      connection = await createRuntimeOrpcClient(activeSkillManageTarget(), {
        signal: controller.signal
      })
      const stream = await connection.client.skills.manage.events.subscribe(undefined, {
        signal: controller.signal
      })
      for await (const event of stream) {
        if (controller.signal.aborted) {
          return
        }
        if (event.type === 'run') {
          onRun(event.run)
        }
      }
    } catch {
      // Why: an aborted subscription (unmount, or a dropped transport that a
      // reconnect will replace) must not surface as an unhandled rejection.
    } finally {
      connection?.close()
    }
  })()
  return () => controller.abort()
}
