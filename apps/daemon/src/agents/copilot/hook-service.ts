import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type {
  AgentHookInstallState,
  AgentHookInstallStatus
} from '@yiru/runtime-protocol/workbench/agent/hook-types'

import {
  createManagedCommandMatcher,
  getSharedManagedScriptPath,
  readHooksJson,
  removeManagedCommands,
  wrapPosixHookCommand,
  wrapWindowsHookCommand,
  writeHooksJson,
  writeManagedScript,
  type HookDefinition
} from '../hooks/managed-hook-commands'
import type { RemoteFileOperations } from '../hooks/remote-file-operations'
import {
  readHooksJsonRemote,
  writeHooksJsonRemote,
  writeManagedScriptRemote
} from '../hooks/remote-hook-storage'
import {
  definitionHasCurrentCommand,
  definitionHasStaleManagedCommand,
  managedHookDefinitionsChanged
} from './managed-hook-definitions'
import { getCopilotManagedScript } from './managed-script'

// Why: Copilot's user-level hook files can use VS Code-compatible PascalCase
// names, which match the event vocabulary already normalized by Yiru's hook
// server and avoid wrapper-side event remapping.
const COPILOT_EVENTS = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  // Why: GitHub's current reference documents subagentStart with only the
  // camelCase payload shape. The wrapper passes the event name separately, so
  // Yiru can normalize it without depending on a PascalCase payload.
  'subagentStart',
  'SubagentStop',
  'PreCompact',
  'Stop',
  'ErrorOccurred',
  'PermissionRequest',
  'Notification'
] as const

function getCopilotHome(): string {
  const fromEnv = process.env.COPILOT_HOME?.trim()
  return fromEnv ? fromEnv : join(homedir(), '.copilot')
}

function getConfigPath(): string {
  return join(getCopilotHome(), 'hooks', 'yiru.json')
}

function getManagedScriptFileName(): string {
  return process.platform === 'win32' ? 'copilot-hook.ps1' : 'copilot-hook.sh'
}

function getManagedScriptPath(): string {
  return getSharedManagedScriptPath(getManagedScriptFileName())
}

function getManagedCommand(scriptPath: string, eventName: string): string {
  if (process.platform !== 'win32') {
    return wrapPosixHookCommand(scriptPath, { YIRU_COPILOT_HOOK_EVENT: eventName })
  }
  return wrapWindowsHookCommand(scriptPath, { YIRU_COPILOT_HOOK_EVENT: eventName })
}

function getManagedHookDefinition(command: string): HookDefinition {
  return process.platform === 'win32'
    ? { type: 'command', powershell: command, timeoutSec: 5 }
    : { type: 'command', bash: command, timeoutSec: 5 }
}

function getRemoteManagedHookDefinition(command: string): HookDefinition {
  return { type: 'command', bash: command, timeoutSec: 5 }
}

export class CopilotHookService {
  getStatus(): AgentHookInstallStatus {
    const configPath = getConfigPath()
    const scriptPath = getManagedScriptPath()
    const config = readHooksJson(configPath)
    if (!config) {
      return {
        agent: 'copilot',
        state: 'error',
        configPath,
        managedHooksPresent: false,
        detail: 'Could not parse Copilot hooks/yiru.json'
      }
    }

    const isManagedCommand = createManagedCommandMatcher(getManagedScriptFileName())
    const missing: string[] = []
    let presentCount = 0
    let staleManagedPresent = false
    const managedEvents = new Set<string>(COPILOT_EVENTS)
    for (const eventName of COPILOT_EVENTS) {
      const command = getManagedCommand(scriptPath, eventName)
      const definitions = Array.isArray(config.hooks?.[eventName]) ? config.hooks![eventName]! : []
      const hasCurrentCommand = definitions.some((definition) =>
        definitionHasCurrentCommand(definition, command)
      )
      if (hasCurrentCommand) {
        presentCount += 1
      } else {
        missing.push(eventName)
      }
    }
    for (const [eventName, definitions] of Object.entries(config.hooks ?? {})) {
      if (!Array.isArray(definitions)) {
        continue
      }
      const currentCommand = managedEvents.has(eventName)
        ? getManagedCommand(scriptPath, eventName)
        : null
      staleManagedPresent =
        staleManagedPresent ||
        definitions.some((definition) =>
          definitionHasStaleManagedCommand(definition, currentCommand, isManagedCommand)
        )
    }

    const managedHooksPresent = presentCount > 0 || staleManagedPresent
    let state: AgentHookInstallState
    let detail: string | null
    if (config.disableAllHooks === true && managedHooksPresent) {
      state = 'partial'
      detail = 'Managed Copilot hook file is disabled'
    } else if (staleManagedPresent) {
      state = 'partial'
      detail = 'Managed Copilot hook file contains stale entries'
    } else if (missing.length === 0) {
      state = 'installed'
      detail = null
    } else if (presentCount === 0 && !staleManagedPresent) {
      state = 'not_installed'
      detail = null
    } else {
      state = 'partial'
      detail = `Managed hook missing for events: ${missing.join(', ')}`
    }
    return { agent: 'copilot', state, configPath, managedHooksPresent, detail }
  }

  install(): AgentHookInstallStatus {
    const configPath = getConfigPath()
    const scriptPath = getManagedScriptPath()
    const config = readHooksJson(configPath)
    if (!config) {
      return {
        agent: 'copilot',
        state: 'error',
        configPath,
        managedHooksPresent: false,
        detail: 'Could not parse Copilot hooks/yiru.json'
      }
    }

    const nextHooks = { ...config.hooks }
    const managedEvents = new Set<string>(COPILOT_EVENTS)
    const isManagedCommand = createManagedCommandMatcher(getManagedScriptFileName())

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

    for (const eventName of COPILOT_EVENTS) {
      const current = Array.isArray(nextHooks[eventName]) ? nextHooks[eventName] : []
      const cleaned = removeManagedCommands(current, isManagedCommand)
      nextHooks[eventName] = [
        ...cleaned,
        getManagedHookDefinition(getManagedCommand(scriptPath, eventName))
      ]
    }

    config.version = 1
    delete config.disableAllHooks
    config.hooks = nextHooks
    writeManagedScript(scriptPath, getCopilotManagedScript())
    writeHooksJson(configPath, config)
    return this.getStatus()
  }

  async installRemote(
    remoteFiles: RemoteFileOperations,
    remoteHome: string
  ): Promise<AgentHookInstallStatus> {
    const home = remoteHome.replace(/\/$/, '')
    const remoteConfigPath = `${home}/.copilot/hooks/yiru.json`
    const remoteScriptPath = `${home}/.yiru/agent-hooks/copilot-hook.sh`

    try {
      const config = await readHooksJsonRemote(remoteFiles, remoteConfigPath)
      if (!config) {
        return {
          agent: 'copilot',
          state: 'error',
          configPath: remoteConfigPath,
          managedHooksPresent: false,
          detail: 'Could not parse remote Copilot hooks/yiru.json'
        }
      }

      const nextHooks = { ...config.hooks }
      const managedEvents = new Set<string>(COPILOT_EVENTS)
      const isManagedCommand = createManagedCommandMatcher('copilot-hook.sh')

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

      for (const eventName of COPILOT_EVENTS) {
        const current = Array.isArray(nextHooks[eventName]) ? nextHooks[eventName] : []
        const cleaned = removeManagedCommands(current, isManagedCommand)
        nextHooks[eventName] = [
          ...cleaned,
          getRemoteManagedHookDefinition(
            wrapPosixHookCommand(remoteScriptPath, { YIRU_COPILOT_HOOK_EVENT: eventName })
          )
        ]
      }

      config.version = 1
      delete config.disableAllHooks
      config.hooks = nextHooks
      // Why: SSH remotes use POSIX scripts regardless of Yiru's local OS. Write
      // the script before hooks/yiru.json so a partial install cannot point
      // Copilot at a missing managed command.
      await writeManagedScriptRemote(
        remoteFiles,
        remoteScriptPath,
        getCopilotManagedScript('posix')
      )
      await writeHooksJsonRemote(remoteFiles, remoteConfigPath, config)

      return {
        agent: 'copilot',
        state: 'installed',
        configPath: remoteConfigPath,
        managedHooksPresent: true,
        detail: null
      }
    } catch (err) {
      return {
        agent: 'copilot',
        state: 'error',
        configPath: remoteConfigPath,
        managedHooksPresent: false,
        detail: err instanceof Error ? err.message : String(err)
      }
    }
  }

  remove(): AgentHookInstallStatus {
    const configPath = getConfigPath()
    if (!existsSync(configPath)) {
      return this.getStatus()
    }
    const config = readHooksJson(configPath)
    if (!config) {
      return {
        agent: 'copilot',
        state: 'error',
        configPath,
        managedHooksPresent: false,
        detail: 'Could not parse Copilot hooks/yiru.json'
      }
    }

    const nextHooks = { ...config.hooks }
    const isManagedCommand = createManagedCommandMatcher(getManagedScriptFileName())
    let changed = false
    for (const [eventName, definitions] of Object.entries(nextHooks)) {
      if (!Array.isArray(definitions)) {
        continue
      }
      const cleaned = removeManagedCommands(definitions, isManagedCommand)
      changed = changed || managedHookDefinitionsChanged(definitions, cleaned)
      if (cleaned.length === 0) {
        delete nextHooks[eventName]
      } else {
        nextHooks[eventName] = cleaned
      }
    }
    if (!changed) {
      return this.getStatus()
    }
    config.hooks = nextHooks
    writeHooksJson(configPath, config)
    return this.getStatus()
  }
}

export const copilotHookService = new CopilotHookService()
