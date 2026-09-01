import { homedir } from 'node:os'
import { join } from 'node:path'

import type {
  AgentHookInstallState,
  AgentHookInstallStatus
} from '@yiru/runtime-protocol/workbench/agent/hook-types'

import {
  getSharedManagedScriptPath,
  readHooksJson,
  wrapPosixHookCommand,
  wrapWindowsCmdHookCommand,
  writeHooksJson,
  writeManagedScript
} from '../hooks/managed-hook-commands'
import type { RemoteFileOperations } from '../hooks/remote-file-operations'
import {
  readHooksJsonRemote,
  writeHooksJsonRemote,
  writeManagedScriptRemote
} from '../hooks/remote-hook-storage'
import {
  antigravityBundleHasCommand,
  antigravityBundleHasStaleCommand,
  createAntigravityManagedCommandMatcher,
  getAntigravityHookBundle,
  getAntigravityHookDefinitions,
  installAntigravityHookConfig,
  removeAntigravityHookConfig
} from './hook-config'
import { ANTIGRAVITY_EVENTS, type AntigravityEvent } from './hook-events'
import { getAntigravityManagedScript, getAntigravityWindowsWrapperScript } from './managed-scripts'

function getConfigPath(): string {
  // Why: Antigravity defines global hooks in ~/.gemini/config/hooks.json.
  return join(homedir(), '.gemini', 'config', 'hooks.json')
}

function getManagedScriptFileName(): string {
  return process.platform === 'win32' ? 'antigravity-hook.cmd' : 'antigravity-hook.sh'
}

function getManagedScriptPath(): string {
  return getSharedManagedScriptPath(getManagedScriptFileName())
}

function getWindowsWrapperScriptPath(event: AntigravityEvent): string {
  return getSharedManagedScriptPath(event.windowsWrapperFileName)
}

function getManagedCommand(scriptPath: string, event: AntigravityEvent): string {
  return process.platform === 'win32'
    ? wrapWindowsCmdHookCommand(getWindowsWrapperScriptPath(event))
    : wrapPosixHookCommand(scriptPath, { YIRU_ANTIGRAVITY_EVENT: event.eventName })
}

export class AntigravityHookService {
  getStatus(): AgentHookInstallStatus {
    const configPath = getConfigPath()
    const scriptPath = getManagedScriptPath()
    const config = readHooksJson(configPath)
    if (!config) {
      return {
        agent: 'antigravity',
        state: 'error',
        configPath,
        managedHooksPresent: false,
        detail: 'Could not parse Antigravity hooks.json'
      }
    }

    const bundle = getAntigravityHookBundle(config)
    const isManagedCommand = createAntigravityManagedCommandMatcher()
    const currentCommands = new Set(
      ANTIGRAVITY_EVENTS.map((event) => getManagedCommand(scriptPath, event))
    )
    const staleManagedPresent = antigravityBundleHasStaleCommand(
      bundle,
      isManagedCommand,
      currentCommands
    )
    const missing: string[] = []
    let presentCount = 0
    for (const event of ANTIGRAVITY_EVENTS) {
      const definitions = getAntigravityHookDefinitions(bundle[event.eventName])
      if (antigravityBundleHasCommand(definitions, getManagedCommand(scriptPath, event))) {
        presentCount += 1
      } else {
        missing.push(event.eventName)
      }
    }

    const managedHooksPresent = presentCount > 0 || staleManagedPresent
    let state: AgentHookInstallState
    let detail: string | null
    if (missing.length === 0 && !staleManagedPresent) {
      state = 'installed'
      detail = null
    } else if (presentCount === 0 && !staleManagedPresent) {
      state = 'not_installed'
      detail = null
    } else {
      state = 'partial'
      detail =
        missing.length > 0
          ? `Managed hook missing for events: ${missing.join(', ')}`
          : 'Stale managed hook entries need cleanup'
    }
    return { agent: 'antigravity', state, configPath, managedHooksPresent, detail }
  }

  install(): AgentHookInstallStatus {
    const configPath = getConfigPath()
    const scriptPath = getManagedScriptPath()
    const config = readHooksJson(configPath)
    if (!config) {
      return {
        agent: 'antigravity',
        state: 'error',
        configPath,
        managedHooksPresent: false,
        detail: 'Could not parse Antigravity hooks.json'
      }
    }

    installAntigravityHookConfig(
      config,
      (event) => getManagedCommand(scriptPath, event),
      createAntigravityManagedCommandMatcher()
    )
    writeManagedScript(scriptPath, getAntigravityManagedScript())
    if (process.platform === 'win32') {
      // Why: event-specific wrappers avoid nested hooks.json quoting on Windows.
      for (const event of ANTIGRAVITY_EVENTS) {
        writeManagedScript(
          getWindowsWrapperScriptPath(event),
          getAntigravityWindowsWrapperScript(event.eventName)
        )
      }
    }
    writeHooksJson(configPath, config)
    return this.getStatus()
  }

  async installRemote(
    remoteFiles: RemoteFileOperations,
    remoteHome: string
  ): Promise<AgentHookInstallStatus> {
    const home = remoteHome.replace(/\/$/, '')
    const remoteConfigPath = `${home}/.gemini/config/hooks.json`
    const remoteScriptPath = `${home}/.yiru/agent-hooks/antigravity-hook.sh`
    try {
      const config = await readHooksJsonRemote(remoteFiles, remoteConfigPath)
      if (!config) {
        return {
          agent: 'antigravity',
          state: 'error',
          configPath: remoteConfigPath,
          managedHooksPresent: false,
          detail: 'Could not parse remote Antigravity hooks.json'
        }
      }

      installAntigravityHookConfig(
        config,
        (event) =>
          wrapPosixHookCommand(remoteScriptPath, { YIRU_ANTIGRAVITY_EVENT: event.eventName }),
        createAntigravityManagedCommandMatcher()
      )
      await writeManagedScriptRemote(
        remoteFiles,
        remoteScriptPath,
        getAntigravityManagedScript('posix')
      )
      await writeHooksJsonRemote(remoteFiles, remoteConfigPath, config)
      return {
        agent: 'antigravity',
        state: 'installed',
        configPath: remoteConfigPath,
        managedHooksPresent: true,
        detail: null
      }
    } catch (error) {
      return {
        agent: 'antigravity',
        state: 'error',
        configPath: remoteConfigPath,
        managedHooksPresent: false,
        detail: error instanceof Error ? error.message : String(error)
      }
    }
  }

  remove(): AgentHookInstallStatus {
    const configPath = getConfigPath()
    const config = readHooksJson(configPath)
    if (!config) {
      return {
        agent: 'antigravity',
        state: 'error',
        configPath,
        managedHooksPresent: false,
        detail: 'Could not parse Antigravity hooks.json'
      }
    }
    removeAntigravityHookConfig(config)
    writeHooksJson(configPath, config)
    return this.getStatus()
  }
}

export const antigravityHookService = new AntigravityHookService()
