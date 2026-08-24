import { existsSync } from 'node:fs'

import type { AgentHookInstallStatus } from '~shared/agent/hook-types'

import {
  createManagedCommandMatcher,
  readHooksJson,
  removeManagedCommands
} from '../agent-hooks/managed-hook-commands'
import { syncSystemConfigIntoManagedCodexHome } from './config-mirror'
import { upsertHookTrustEntries } from './config-toml-trust'
import { getYiruManagedCodexHomePath, getSystemCodexHomePath } from './home-paths'
import { getConfigPath, writeCodexHooksJson, getCodexConfigTomlPath } from './hook-foundation'
import { getCodexManagedScriptFileName } from './hook-identity'
import {
  cleanupLegacyManagedHookRepresentations,
  removeRuntimeManagedHookTrustEntries
} from './hook-legacy-cleanup'
import {
  removeStaleRuntimeHookTrustEntries,
  getRuntimeHooksWithSystemUserHooks
} from './hook-runtime-mirror'
import { applyMirroredRuntimeUserHookTrustStates } from './hook-runtime-trust'
import { CodexHookRemoteService } from './hook-service-remote'
import {
  promoteCodexRuntimeHookApprovalsToSystem,
  snapshotCodexRuntimeHookTrustProvenance
} from './hook-trust-promotion'

export class CodexHookService extends CodexHookRemoteService {
  refreshRuntimeUserHooks(
    runtimeHomePath: string = getYiruManagedCodexHomePath()
  ): AgentHookInstallStatus {
    const configPath = getConfigPath(runtimeHomePath)
    // Why: same as install() — capture in-Yiru approvals before this refresh
    // rewrites the runtime files they are keyed against.
    promoteCodexRuntimeHookApprovalsToSystem(runtimeHomePath)
    const config = readHooksJson(configPath)
    if (!config) {
      // Why: disabled launch prep used to call remove(); preserve its legacy
      // cleanup behavior even when runtime hooks.json is malformed.
      cleanupLegacyManagedHookRepresentations()
      return {
        agent: 'codex',
        state: 'error',
        configPath,
        managedHooksPresent: false,
        detail: 'Could not parse Codex hooks.json'
      }
    }

    const isManagedCommand = createManagedCommandMatcher(getCodexManagedScriptFileName())
    const hookPlan = getRuntimeHooksWithSystemUserHooks(config.hooks, isManagedCommand, configPath)
    config.hooks = hookPlan.hooks
    writeCodexHooksJson(configPath, hookPlan.hooks)

    try {
      const tomlPath = getCodexConfigTomlPath(runtimeHomePath)
      const trustEntries = hookPlan.trustEntries.map(({ entry }) => entry)
      syncSystemConfigIntoManagedCodexHome({
        runtimeHomePath,
        systemHomePath: getSystemCodexHomePath()
      })
      // Why: this path is used when Yiru status hooks are disabled. The
      // runtime CODEX_HOME should keep user hooks, but not Yiru-managed trust.
      // Write current mirrored user trust first so stale cleanup compares
      // against current hashes while deleting old managed hook keys.
      upsertHookTrustEntries(tomlPath, trustEntries)
      removeStaleRuntimeHookTrustEntries(tomlPath, configPath, trustEntries)
      applyMirroredRuntimeUserHookTrustStates(tomlPath, hookPlan.trustEntries)
    } catch (error) {
      return {
        agent: 'codex',
        state: 'error',
        configPath,
        managedHooksPresent: false,
        detail: `User hooks refreshed but trust entries could not be written: ${error instanceof Error ? error.message : String(error)}. Run /hooks in Codex to approve.`
      }
    }
    snapshotCodexRuntimeHookTrustProvenance(runtimeHomePath)

    cleanupLegacyManagedHookRepresentations()
    return this.getStatus(runtimeHomePath)
  }

  remove(): AgentHookInstallStatus {
    const configPath = getConfigPath()
    const configExists = existsSync(configPath)
    const config = readHooksJson(configPath)
    if (!config) {
      // Why: a malformed runtime hooks.json should not strand old hooks in
      // ~/.codex or the legacy profile after the user disables Codex hooks.
      cleanupLegacyManagedHookRepresentations()
      return {
        agent: 'codex',
        state: 'error',
        configPath,
        managedHooksPresent: false,
        detail: 'Could not parse Codex hooks.json'
      }
    }

    const nextHooks = { ...config.hooks }
    // Why: same broad matcher as install(), so remove() also cleans up stale
    // entries from older builds even if the current scriptPath has moved.
    const isManagedCommand = createManagedCommandMatcher(getCodexManagedScriptFileName())
    for (const [eventName, definitions] of Object.entries(nextHooks)) {
      if (!Array.isArray(definitions)) {
        // Why: a malformed hooks.json entry (non-array value for an event name)
        // would make removeManagedCommands throw. Skip instead — we have no
        // managed commands to remove from something we can't parse.
        continue
      }
      const cleaned = removeManagedCommands(definitions, isManagedCommand)
      if (cleaned.length === 0) {
        delete nextHooks[eventName]
      } else {
        nextHooks[eventName] = cleaned
      }
    }
    if (configExists) {
      // Why: remove() can be the only repair path for a parseable runtime file
      // whose top-level plugin metadata makes Codex reject hooks.json.
      writeCodexHooksJson(configPath, nextHooks)
    }

    // Why: also drop our trust entries so config.toml doesn't accumulate dead
    // [hooks.state."..."] blocks across install/remove cycles. Best-effort —
    // a stale entry is harmless once hooks.json no longer references it.
    removeRuntimeManagedHookTrustEntries(configPath)

    cleanupLegacyManagedHookRepresentations()

    return this.getStatus()
  }
}
