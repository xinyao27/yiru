import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import type { AgentHookInstallStatus } from '@yiru/runtime-protocol/workbench/agent/hook-types'

import type { RemoteFileOperations } from '../hooks/remote-file-operations'
import { readTextFileRemote, writeTextFileRemoteAtomic } from '../hooks/remote-hook-storage'
import { AMP_PLUGIN_MARKER, getAmpPluginSource } from './plugin-source'

const AMP_PLUGIN_FILE = 'yiru-agent-status.ts'

type PluginFileState =
  | { kind: 'absent' }
  | { kind: 'managed'; complete: boolean }
  | { kind: 'unmanaged' }
  | { kind: 'error'; detail: string }

function getPluginPath(): string {
  return join(homedir(), '.config', 'amp', 'plugins', AMP_PLUGIN_FILE)
}

function getRemotePluginPath(remoteHome: string): string {
  const home = remoteHome.replace(/\/$/, '')
  return `${home}/.config/amp/plugins/${AMP_PLUGIN_FILE}`
}

function isManagedPlugin(content: string): boolean {
  return content.includes(AMP_PLUGIN_MARKER)
}

function isCompleteManagedPlugin(content: string): boolean {
  return (
    isManagedPlugin(content) &&
    content.includes('/hook/amp') &&
    content.includes("amp.on('session.start'") &&
    content.includes("amp.on('agent.start'") &&
    content.includes("amp.on('tool.call'") &&
    content.includes("amp.on('tool.result'") &&
    content.includes("amp.on('agent.end'")
  )
}

function readLocalPluginState(pluginPath: string): PluginFileState {
  if (!existsSync(pluginPath)) {
    return { kind: 'absent' }
  }
  try {
    const content = readFileSync(pluginPath, 'utf-8')
    if (!isManagedPlugin(content)) {
      return { kind: 'unmanaged' }
    }
    return { kind: 'managed', complete: isCompleteManagedPlugin(content) }
  } catch (error) {
    return { kind: 'error', detail: error instanceof Error ? error.message : String(error) }
  }
}

function statusFromState(pluginPath: string, state: PluginFileState): AgentHookInstallStatus {
  switch (state.kind) {
    case 'absent':
      return {
        agent: 'amp',
        state: 'not_installed',
        configPath: pluginPath,
        managedHooksPresent: false,
        detail: null
      }
    case 'managed':
      return {
        agent: 'amp',
        state: state.complete ? 'installed' : 'partial',
        configPath: pluginPath,
        managedHooksPresent: true,
        detail: state.complete ? null : 'Managed Amp plugin is missing required handlers'
      }
    case 'unmanaged':
      return {
        agent: 'amp',
        state: 'partial',
        configPath: pluginPath,
        managedHooksPresent: false,
        detail: 'Amp Yiru status plugin exists but is not Yiru-managed'
      }
    case 'error':
      return {
        agent: 'amp',
        state: 'error',
        configPath: pluginPath,
        managedHooksPresent: false,
        detail: state.detail
      }
  }
}

function writeTextFileAtomic(filePath: string, content: string): void {
  const directory = dirname(filePath)
  mkdirSync(directory, { recursive: true })
  if (existsSync(filePath)) {
    try {
      if (readFileSync(filePath, 'utf-8') === content) {
        return
      }
    } catch {
      // Fall through to the atomic write path.
    }
  }

  const temporaryPath = join(directory, `.${Date.now()}-${randomUUID()}.tmp`)
  try {
    writeFileSync(temporaryPath, content, 'utf-8')
    renameSync(temporaryPath, filePath)
  } finally {
    if (existsSync(temporaryPath)) {
      try {
        unlinkSync(temporaryPath)
      } catch {
        // Best effort cleanup after an atomic-write failure.
      }
    }
  }
}

export class AmpHookService {
  getStatus(): AgentHookInstallStatus {
    const pluginPath = getPluginPath()
    return statusFromState(pluginPath, readLocalPluginState(pluginPath))
  }

  install(): AgentHookInstallStatus {
    const pluginPath = getPluginPath()
    const state = readLocalPluginState(pluginPath)
    if (state.kind === 'unmanaged' || state.kind === 'error') {
      return statusFromState(pluginPath, state)
    }
    writeTextFileAtomic(pluginPath, getAmpPluginSource())
    return this.getStatus()
  }

  async installRemote(
    remoteFiles: RemoteFileOperations,
    remoteHome: string
  ): Promise<AgentHookInstallStatus> {
    const remotePluginPath = getRemotePluginPath(remoteHome)
    try {
      const existing = await readTextFileRemote(remoteFiles, remotePluginPath)
      if (existing !== null && !isManagedPlugin(existing)) {
        return statusFromState(remotePluginPath, { kind: 'unmanaged' })
      }
      await writeTextFileRemoteAtomic(remoteFiles, remotePluginPath, getAmpPluginSource())
      return {
        agent: 'amp',
        state: 'installed',
        configPath: remotePluginPath,
        managedHooksPresent: true,
        detail: null
      }
    } catch (error) {
      return {
        agent: 'amp',
        state: 'error',
        configPath: remotePluginPath,
        managedHooksPresent: false,
        detail: error instanceof Error ? error.message : String(error)
      }
    }
  }

  remove(): AgentHookInstallStatus {
    const pluginPath = getPluginPath()
    const state = readLocalPluginState(pluginPath)
    if (state.kind === 'managed') {
      unlinkSync(pluginPath)
      return this.getStatus()
    }
    return statusFromState(pluginPath, state)
  }
}

export const ampHookService = new AmpHookService()
