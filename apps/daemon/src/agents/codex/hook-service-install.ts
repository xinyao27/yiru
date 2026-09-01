import { LOCAL_EXECUTION_HOST_ID } from '@yiru/runtime-protocol/model/workspace'
import type { AgentHookInstallStatus } from '@yiru/runtime-protocol/workbench/agent/hook-types'

import {
  buildManagedCommandHook,
  createManagedCommandMatcher,
  MANAGED_HOOK_TIMEOUT_SECONDS,
  readHooksJson,
  removeManagedCommands,
  writeManagedScript,
  type HookDefinition
} from '../hooks/managed-hook-commands'
import { syncSystemConfigIntoManagedCodexHome } from './config-mirror'
import {
  getCodexExplicitHomeHookSourcePath,
  upsertHookTrustEntries,
  type CodexTrustEntry
} from './config-toml-trust'
import { getYiruManagedCodexHomePath, getSystemCodexHomePath } from './home-paths'
import {
  CODEX_EVENTS,
  getConfigPath,
  writeCodexHooksJson,
  getCodexConfigTomlPath,
  CODEX_EVENT_LABEL,
  getManagedScriptPath,
  getManagedCommand
} from './hook-foundation'
import { getCodexManagedScriptFileName } from './hook-identity'
import {
  cleanupLegacySystemManagedHooks,
  cleanupLegacyCodexProfileHooks
} from './hook-legacy-cleanup'
import {
  removeStaleRuntimeHookTrustEntries,
  getRuntimeHooksWithSystemUserHooks
} from './hook-runtime-mirror'
import {
  moveMirroredRuntimeUserTrustAfterManagedStatusHook,
  applyMirroredRuntimeUserHookTrustStates
} from './hook-runtime-trust'
import { getManagedScript } from './hook-script'
import { CodexHookStatusService } from './hook-service-status'
import { grantManagedCodexHookTrust } from './hook-trust-grant'
import {
  promoteCodexRuntimeHookApprovalsToSystem,
  snapshotCodexRuntimeHookTrustProvenance
} from './hook-trust-promotion'

export class CodexHookInstallService extends CodexHookStatusService {
  // Why: runtimeHomePath defaults to the shared managed mirror, but a managed
  // account launching against its own self-contained CODEX_HOME passes that
  // per-account home so hooks.json/config.toml/trust land where codex reads.
  install(runtimeHomePath: string = getYiruManagedCodexHomePath()): AgentHookInstallStatus {
    const configPath = getConfigPath(runtimeHomePath)
    const scriptPath = getManagedScriptPath()
    // Why: must run before this install rewrites hooks.json/config.toml —
    // approvals the user made inside Yiru-launched Codex are keyed to the
    // previous launch's runtime layout, and stale-trust cleanup below would
    // delete them once the system config stops backing them.
    promoteCodexRuntimeHookApprovalsToSystem(runtimeHomePath)
    const config = readHooksJson(configPath)
    if (!config) {
      return {
        agent: 'codex',
        state: 'error',
        configPath,
        managedHooksPresent: false,
        detail: 'Could not parse Codex hooks.json'
      }
    }

    // Why: match by script filename (not exact command string) so a fresh
    // install sweeps stale entries left by older builds or a different
    // userData path from an older build. Without this, repeated installs
    // accumulate duplicate hook entries pointing at defunct scripts.
    const isManagedCommand = createManagedCommandMatcher(getCodexManagedScriptFileName())
    const command = getManagedCommand(scriptPath)
    const hookPlan = getRuntimeHooksWithSystemUserHooks(config.hooks, isManagedCommand, configPath)
    const nextHooks = hookPlan.hooks
    const managedEvents = new Set<string>(CODEX_EVENTS)

    // Why: sweep managed entries out of events we no longer subscribe to
    // (e.g., PreToolUse from a prior install). Without this, users who
    // already had PreToolUse registered would keep firing stale hooks on
    // every auto-approved tool call after the app upgrade.
    for (const [eventName, definitions] of Object.entries(nextHooks)) {
      if (managedEvents.has(eventName)) {
        continue
      }
      if (!Array.isArray(definitions)) {
        // Why: a malformed hooks.json entry (non-array value for an event name)
        // would make removeManagedCommands throw. Skip instead — we aren't
        // going to sweep something we can't parse, and the install() for
        // managed events below still runs.
        continue
      }
      const cleaned = removeManagedCommands(definitions, isManagedCommand)
      if (cleaned.length === 0) {
        delete nextHooks[eventName]
      } else {
        nextHooks[eventName] = cleaned
      }
    }

    // Why: Codex 0.129+ requires a per-hook trust entry in config.toml or the
    // hook sits in the "review required" pile. We compute the trust hash for
    // each managed entry as we install it and persist it alongside hooks.json
    // so the user does not have to /hooks-approve after every install.
    const mirroredUserTrustEntries = moveMirroredRuntimeUserTrustAfterManagedStatusHook(
      hookPlan.trustEntries
    )
    const mirroredTrustEntries: CodexTrustEntry[] = mirroredUserTrustEntries.map(
      ({ entry }) => entry
    )
    const managedTrustEntries: CodexTrustEntry[] = []
    const trustSourcePath = getCodexExplicitHomeHookSourcePath(configPath)
    for (const eventName of CODEX_EVENTS) {
      const current = Array.isArray(nextHooks[eventName]) ? nextHooks[eventName] : []
      const cleaned = removeManagedCommands(current, isManagedCommand)
      const definition: HookDefinition = {
        hooks: [buildManagedCommandHook(command)]
      }
      nextHooks[eventName] = [definition, ...cleaned]
      // Why: the status hook must run before user hooks so a slow
      // PostToolUse/Stop hook cannot leave the sidebar stuck on the previous
      // state while Codex visibly reports that hooks are still running.
      // timeoutSec mirrors the hook's `timeout` so the trust hash matches the
      // entry actually written to hooks.json.
      managedTrustEntries.push({
        sourcePath: trustSourcePath,
        eventLabel: CODEX_EVENT_LABEL[eventName],
        groupIndex: 0,
        handlerIndex: 0,
        command,
        timeoutSec: MANAGED_HOOK_TIMEOUT_SECONDS
      })
    }
    const trustEntries: CodexTrustEntry[] = [...mirroredTrustEntries, ...managedTrustEntries]
    let recentGrantEntries: readonly CodexTrustEntry[] = []

    config.hooks = nextHooks
    writeManagedScript(scriptPath, getManagedScript())
    writeCodexHooksJson(configPath, nextHooks)
    // Why: trust entries write last so a half-write can't leave a hash
    // pointing at a hook that doesn't exist. Surface failures — without this,
    // getStatus would report green for a hook Codex won't actually fire.
    try {
      const tomlPath = getCodexConfigTomlPath(runtimeHomePath)
      syncSystemConfigIntoManagedCodexHome({
        runtimeHomePath,
        systemHomePath: getSystemCodexHomePath()
      })
      // Why: Codex is the only authority on its trust-hash algorithm, so the
      // managed entries are granted through codex app-server RPCs (verified by
      // re-list) whenever the installed CLI supports them; the granted entries
      // then carry Codex's verbatim hashes into stale cleanup so it cannot
      // delete what Codex just wrote. Mirrored user trust keeps its existing
      // verbatim-carry lane either way.
      const grant = grantManagedCodexHookTrust({
        runtimeHomePath,
        tomlPath,
        managedCommand: command,
        managedEntries: managedTrustEntries,
        host: { id: LOCAL_EXECUTION_HOST_ID, kind: 'native' }
      })
      if (grant.lane === 'rpc') {
        recentGrantEntries = grant.entries
        upsertHookTrustEntries(tomlPath, mirroredTrustEntries)
        removeStaleRuntimeHookTrustEntries(tomlPath, configPath, [
          ...mirroredTrustEntries,
          ...grant.entries
        ])
      } else {
        // Why: system user hook approvals are mirrored into runtime CODEX_HOME.
        // If the user later revokes approval in ~/.codex/config.toml, preserving
        // all old runtime [hooks.state.*] blocks would keep Yiru Codex trusted.
        // Upsert first so duplicate repair can preserve a disabled managed copy
        // before stale cleanup removes old managed hook keys.
        upsertHookTrustEntries(tomlPath, trustEntries)
        removeStaleRuntimeHookTrustEntries(tomlPath, configPath, trustEntries)
      }
      applyMirroredRuntimeUserHookTrustStates(tomlPath, mirroredUserTrustEntries)
    } catch (error) {
      return {
        agent: 'codex',
        state: 'error',
        configPath,
        managedHooksPresent: true,
        detail: `Hooks installed but trust entries could not be written: ${error instanceof Error ? error.message : String(error)}. Run /hooks in Codex to approve.`
      }
    }
    snapshotCodexRuntimeHookTrustProvenance(runtimeHomePath)
    try {
      cleanupLegacySystemManagedHooks()
      cleanupLegacyCodexProfileHooks()
    } catch (error) {
      console.warn('[codex-hook-service] failed to clean legacy Codex hooks', error)
    }
    return this.getStatusAfterInstall(recentGrantEntries, runtimeHomePath)
  }
}
