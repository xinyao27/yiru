import { randomUUID } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import type {
  AgentHookInstallState,
  AgentHookInstallStatus
} from '@yiru/runtime-protocol/workbench/agent/hook-types'

import type { RemoteFileOperations } from '../hooks/remote-file-operations'
import { readTextFileRemote, writeTextFileRemoteAtomic } from '../hooks/remote-hook-storage'
import {
  disableHermesPlugin,
  enableHermesPlugin,
  getHermesPluginEnablement,
  parseHermesConfig,
  serializeHermesConfig,
  type HermesConfig,
  updateHermesConfigContent
} from './hook-config'
import {
  getHermesPluginInitSource,
  getHermesPluginManifest,
  HERMES_PLUGIN_MARKER,
  HERMES_PLUGIN_NAME
} from './hook-plugin-content'

function getHermesHome(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.HERMES_HOME?.trim()
  return explicit ? explicit : join(homedir(), '.hermes')
}

function getConfigPath(): string {
  return join(getHermesHome(), 'config.yaml')
}

function getPluginDir(): string {
  return join(getHermesHome(), 'plugins', HERMES_PLUGIN_NAME)
}

function getManifestPath(pluginDir = getPluginDir()): string {
  return join(pluginDir, 'plugin.yaml')
}

function getInitPath(pluginDir = getPluginDir()): string {
  return join(pluginDir, '__init__.py')
}

function readConfigFile(configPath: string): ReturnType<typeof parseHermesConfig> {
  if (!existsSync(configPath)) {
    return { ok: true, config: {} }
  }
  return parseHermesConfig(readFileSync(configPath, 'utf-8'))
}

function writeConfigFile(configPath: string, config: HermesConfig): void {
  const dir = dirname(configPath)
  mkdirSync(dir, { recursive: true })
  const serialized = serializeHermesConfig(config)
  if (existsSync(configPath)) {
    try {
      if (readFileSync(configPath, 'utf-8') === serialized) {
        return
      }
    } catch {
      // Fall through to the atomic write path.
    }
  }

  const tmpPath = join(dir, `.${Date.now()}-${randomUUID()}.tmp`)
  try {
    writeFileSync(tmpPath, serialized, 'utf-8')
    if (existsSync(configPath)) {
      copyFileSync(configPath, `${configPath}.bak`)
    }
    renameSync(tmpPath, configPath)
  } finally {
    if (existsSync(tmpPath)) {
      try {
        unlinkSync(tmpPath)
      } catch {
        // best effort
      }
    }
  }
}

function getPluginFilesState(pluginDir = getPluginDir()): {
  present: boolean
  managed: boolean
  detail: string | null
} {
  const manifestPath = getManifestPath(pluginDir)
  const initPath = getInitPath(pluginDir)
  if (!existsSync(manifestPath) || !existsSync(initPath)) {
    return { present: false, managed: false, detail: 'Managed Hermes plugin files are missing' }
  }
  try {
    const manifest = readFileSync(manifestPath, 'utf-8')
    const init = readFileSync(initPath, 'utf-8')
    const managed = manifest.includes(HERMES_PLUGIN_MARKER) && init.includes(HERMES_PLUGIN_MARKER)
    return {
      present: true,
      managed,
      detail: managed ? null : 'Hermes yiru-status plugin exists but is not Yiru-managed'
    }
  } catch (error) {
    return {
      present: true,
      managed: false,
      detail: error instanceof Error ? error.message : String(error)
    }
  }
}

function buildStatus(configPath: string, config: HermesConfig): AgentHookInstallStatus {
  const pluginFiles = getPluginFilesState()
  const enablement = getHermesPluginEnablement(config)
  const details = [
    pluginFiles.detail,
    enablement.detail,
    !enablement.enabled ? 'yiru-status is not enabled in Hermes config.yaml' : null,
    enablement.disabled ? 'yiru-status is disabled in Hermes config.yaml' : null
  ].filter((detail): detail is string => Boolean(detail))

  let state: AgentHookInstallState
  if (!pluginFiles.present && !enablement.enabled) {
    state = 'not_installed'
  } else if (
    pluginFiles.present &&
    pluginFiles.managed &&
    enablement.enabled &&
    !enablement.disabled
  ) {
    state = 'installed'
  } else {
    state = 'partial'
  }

  return {
    agent: 'hermes',
    state,
    configPath,
    managedHooksPresent: pluginFiles.present && pluginFiles.managed,
    detail: state === 'installed' || state === 'not_installed' ? null : details.join('; ')
  }
}

function writePluginFiles(pluginDir = getPluginDir()): void {
  mkdirSync(pluginDir, { recursive: true })
  writeFileSync(getManifestPath(pluginDir), getHermesPluginManifest(), 'utf-8')
  writeFileSync(getInitPath(pluginDir), getHermesPluginInitSource(), 'utf-8')
}

function stripTrailingSlash(path: string): string {
  return path.replace(/\/+$/, '')
}

export class HermesHookService {
  getStatus(): AgentHookInstallStatus {
    const configPath = getConfigPath()
    const parsed = readConfigFile(configPath)
    if (!parsed.ok) {
      return {
        agent: 'hermes',
        state: 'error',
        configPath,
        managedHooksPresent: getPluginFilesState().managed,
        detail: `Could not parse Hermes config.yaml: ${parsed.detail}`
      }
    }
    return buildStatus(configPath, parsed.config)
  }

  install(): AgentHookInstallStatus {
    const configPath = getConfigPath()
    const parsed = readConfigFile(configPath)
    if (!parsed.ok) {
      return {
        agent: 'hermes',
        state: 'error',
        configPath,
        managedHooksPresent: getPluginFilesState().managed,
        detail: `Could not parse Hermes config.yaml: ${parsed.detail}`
      }
    }

    writePluginFiles()
    writeConfigFile(configPath, enableHermesPlugin(parsed.config))
    return this.getStatus()
  }

  async installRemote(
    remoteFiles: RemoteFileOperations,
    remoteHome: string
  ): Promise<AgentHookInstallStatus> {
    const remoteRoot = stripTrailingSlash(remoteHome)
    const remoteConfigPath = `${remoteRoot}/.hermes/config.yaml`
    const remotePluginDir = `${remoteRoot}/.hermes/plugins/${HERMES_PLUGIN_NAME}`
    try {
      const existing = await readTextFileRemote(remoteFiles, remoteConfigPath)
      const next = updateHermesConfigContent(existing, enableHermesPlugin)
      if (next.content === null) {
        return {
          agent: 'hermes',
          state: 'error',
          configPath: remoteConfigPath,
          managedHooksPresent: false,
          detail: `Could not parse remote Hermes config.yaml: ${next.detail ?? 'unknown error'}`
        }
      }
      await writeTextFileRemoteAtomic(
        remoteFiles,
        `${remotePluginDir}/plugin.yaml`,
        getHermesPluginManifest()
      )
      await writeTextFileRemoteAtomic(
        remoteFiles,
        `${remotePluginDir}/__init__.py`,
        getHermesPluginInitSource()
      )
      await writeTextFileRemoteAtomic(remoteFiles, remoteConfigPath, next.content)
      return {
        agent: 'hermes',
        state: 'installed',
        configPath: remoteConfigPath,
        managedHooksPresent: true,
        detail: null
      }
    } catch (error) {
      return {
        agent: 'hermes',
        state: 'error',
        configPath: remoteConfigPath,
        managedHooksPresent: false,
        detail: error instanceof Error ? error.message : String(error)
      }
    }
  }

  remove(): AgentHookInstallStatus {
    const configPath = getConfigPath()
    const parsed = readConfigFile(configPath)
    if (!parsed.ok) {
      return {
        agent: 'hermes',
        state: 'error',
        configPath,
        managedHooksPresent: getPluginFilesState().managed,
        detail: `Could not parse Hermes config.yaml: ${parsed.detail}`
      }
    }
    const pluginDir = getPluginDir()
    if (getPluginFilesState(pluginDir).managed) {
      rmSync(pluginDir, { recursive: true, force: true })
    }
    writeConfigFile(configPath, disableHermesPlugin(parsed.config))
    return this.getStatus()
  }
}

export const hermesHookService = new HermesHookService()
