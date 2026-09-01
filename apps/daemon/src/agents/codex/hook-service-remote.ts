import type { AgentHookInstallStatus } from '@yiru/runtime-protocol/workbench/agent/hook-types'

import {
  buildManagedCommandHook,
  createManagedCommandMatcher,
  MANAGED_HOOK_TIMEOUT_SECONDS,
  removeManagedCommands,
  wrapPosixHookCommand,
  type HookDefinition
} from '../hooks/managed-hook-commands'
import type { RemoteFileOperations } from '../hooks/remote-file-operations'
import {
  readHooksJsonRemote,
  readTextFileRemote,
  writeHooksJsonRemote,
  writeManagedScriptRemote,
  writeTextFileRemoteAtomic
} from '../hooks/remote-hook-storage'
import { upsertHookTrustEntriesInContent, type CodexTrustEntry } from './config-toml-trust'
import { CODEX_EVENTS, CODEX_EVENT_LABEL } from './hook-foundation'
import { getManagedScript } from './hook-script'
import { CodexHookInstallService } from './hook-service-install'

export class CodexHookRemoteService extends CodexHookInstallService {
  async installRemote(
    remoteFiles: RemoteFileOperations,
    remoteHome: string,
    options?: {
      /** Explicit CODEX_HOME dir (flat layout: hooks.json/config.toml at its
       *  root). WSL sessions read Yiru's managed runtime home, not ~/.codex —
       *  installing to the default location leaves those sessions hookless. */
      codexHomeDir?: string
      /** Skip the trust write when config.toml doesn't exist yet. The WSL
       *  runtime home's config.toml is seeded only-if-absent by the launch
       *  path; creating it here first would silently cancel that seed. A
       *  later (idempotent) reinstall upserts trust once the seed lands. */
      deferTrustUntilConfigToml?: boolean
    }
  ): Promise<AgentHookInstallStatus> {
    const codexHomeBase =
      options?.codexHomeDir?.replace(/\/$/, '') ?? `${remoteHome.replace(/\/$/, '')}/.codex`
    const remoteConfigPath = `${codexHomeBase}/hooks.json`
    const remoteTomlPath = `${codexHomeBase}/config.toml`
    const remoteScriptPath = `${remoteHome.replace(/\/$/, '')}/.yiru/agent-hooks/codex-hook.sh`
    try {
      const config = await readHooksJsonRemote(remoteFiles, remoteConfigPath)
      if (!config) {
        return {
          agent: 'codex',
          state: 'error',
          configPath: remoteConfigPath,
          managedHooksPresent: false,
          detail: 'Could not parse remote Codex hooks.json'
        }
      }

      const command = wrapPosixHookCommand(remoteScriptPath)
      const nextHooks = { ...config.hooks }
      const managedEvents = new Set<string>(CODEX_EVENTS)
      const isManagedCommand = createManagedCommandMatcher('codex-hook.sh')

      for (const [eventName, definitions] of Object.entries(nextHooks)) {
        if (managedEvents.has(eventName) || !Array.isArray(definitions)) {
          continue
        }
        const cleaned = removeManagedCommands(definitions, isManagedCommand)
        if (cleaned.length === 0) {
          delete nextHooks[eventName]
        } else {
          nextHooks[eventName] = cleaned
        }
      }

      const trustEntries: CodexTrustEntry[] = []
      for (const eventName of CODEX_EVENTS) {
        const current = Array.isArray(nextHooks[eventName]) ? nextHooks[eventName] : []
        const cleaned = removeManagedCommands(current, isManagedCommand)
        const definition: HookDefinition = {
          hooks: [buildManagedCommandHook(command)]
        }
        nextHooks[eventName] = [...cleaned, definition]
        trustEntries.push({
          sourcePath: remoteConfigPath,
          eventLabel: CODEX_EVENT_LABEL[eventName],
          groupIndex: cleaned.length,
          handlerIndex: 0,
          command,
          timeoutSec: MANAGED_HOOK_TIMEOUT_SECONDS
        })
      }

      config.hooks = nextHooks
      // Why: script/settings first, trust TOML last. A partial trust write
      // leaves Codex asking for approval rather than executing a missing script.
      // Why: SSH remotes use POSIX `.sh` hook paths even when Yiru itself is
      // running on Windows; never derive remote script syntax from local OS.
      await writeManagedScriptRemote(remoteFiles, remoteScriptPath, getManagedScript('posix'))
      // Why: SSH installs edit the user's remote ~/.codex/hooks.json directly.
      // Preserve non-Yiru top-level metadata while replacing the hooks tree.
      await writeHooksJsonRemote(remoteFiles, remoteConfigPath, { ...config, hooks: nextHooks })
      try {
        const existingTomlRaw = await readTextFileRemote(remoteFiles, remoteTomlPath)
        if (existingTomlRaw === null && options?.deferTrustUntilConfigToml === true) {
          return {
            agent: 'codex',
            state: 'installed',
            configPath: remoteConfigPath,
            managedHooksPresent: true,
            detail: 'Trust entries deferred until config.toml is seeded by the launch path'
          }
        }
        const existingToml = existingTomlRaw ?? ''
        const updatedToml = upsertHookTrustEntriesInContent(existingToml, trustEntries)
        if (updatedToml !== existingToml) {
          await writeTextFileRemoteAtomic(remoteFiles, remoteTomlPath, updatedToml)
        }
      } catch (error) {
        return {
          agent: 'codex',
          state: 'error',
          configPath: remoteConfigPath,
          managedHooksPresent: true,
          detail: `Hooks installed but trust entries could not be written: ${
            error instanceof Error ? error.message : String(error)
          }. Run /hooks in Codex on the remote host to approve.`
        }
      }

      return {
        agent: 'codex',
        state: 'installed',
        configPath: remoteConfigPath,
        managedHooksPresent: true,
        detail: null
      }
    } catch (err) {
      return {
        agent: 'codex',
        state: 'error',
        configPath: remoteConfigPath,
        managedHooksPresent: false,
        detail: err instanceof Error ? err.message : String(err)
      }
    }
  }
}
