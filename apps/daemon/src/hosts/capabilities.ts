import type { RuntimeHostCapability } from '@yiru/runtime-protocol/contract'
import type { ExecutionHostId } from '@yiru/runtime-protocol/model/workspace'

import type { Host } from './contract'
import { WslCapabilityState } from './wsl-capability-state'

const CAPABILITY_TTL_MS = 60_000

type CacheEntry = {
  capabilities: RuntimeHostCapability[]
  expiresAt: number
}

export class HostCapabilityCache {
  private readonly entries = new Map<string, CacheEntry>()
  private readonly homeByHostId = new Map<ExecutionHostId, string>()
  private readonly wsl = new WslCapabilityState()

  async probe(host: Host): Promise<RuntimeHostCapability[]> {
    const cached = this.entries.get(host.id)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.capabilities
    }
    const [fs, git, pty] = await Promise.all([
      probeFileSystem(host),
      probeCommand(host, 'git', 'git', ['--version']),
      probePty(host)
    ])
    const capabilities = [fs, git, pty]
    this.entries.set(host.id, {
      capabilities,
      expiresAt: Date.now() + CAPABILITY_TTL_MS
    })
    return capabilities
  }

  invalidate(hostId: ExecutionHostId): void {
    this.entries.delete(hostId)
    this.homeByHostId.delete(hostId)
  }

  async homeDirectory(host: Host): Promise<string | null> {
    const cached = this.homeByHostId.get(host.id)
    if (cached) {
      return cached
    }
    const home = await host.homeDirectory()
    if (home) {
      this.homeByHostId.set(host.id, home)
    }
    return home
  }

  listWslDistros(): string[] {
    return this.wsl.listDistros()
  }

  listWslDistrosAsync(): Promise<string[]> {
    return this.wsl.listDistrosAsync()
  }

  hasCachedWslDistros(): boolean {
    return this.wsl.hasCachedDistros()
  }

  getCachedWslDistros(): string[] | null {
    return this.wsl.getCachedDistros()
  }

  getDefaultWslDistro(): string | null {
    return this.wsl.listDistros()[0] ?? null
  }

  getWslHome(distro: string): string | null {
    return this.wsl.home(distro)
  }

  getWslHomeAsync(distro: string): Promise<string | null> {
    return this.wsl.homeAsync(distro)
  }

  isWslAvailable(): boolean {
    return this.wsl.available()
  }

  hasCachedWslAvailability(): boolean {
    return this.wsl.hasCachedAvailability()
  }

  getCachedWslAvailability(): boolean | null {
    return this.wsl.getCachedAvailability()
  }
}

export const hostCapabilityCache = new HostCapabilityCache()

export const listWslDistros = (): string[] => hostCapabilityCache.listWslDistros()
export const listWslDistrosAsync = (): Promise<string[]> =>
  hostCapabilityCache.listWslDistrosAsync()
export const hasCachedWslDistros = (): boolean => hostCapabilityCache.hasCachedWslDistros()
export const getCachedWslDistros = (): string[] | null => hostCapabilityCache.getCachedWslDistros()
export const getDefaultWslDistro = (): string | null => hostCapabilityCache.getDefaultWslDistro()
export const getWslHome = (distro: string): string | null => hostCapabilityCache.getWslHome(distro)
export const getWslHomeAsync = (distro: string): Promise<string | null> =>
  hostCapabilityCache.getWslHomeAsync(distro)
export const isWslAvailable = (): boolean => hostCapabilityCache.isWslAvailable()
export const hasCachedWslAvailability = (): boolean =>
  hostCapabilityCache.hasCachedWslAvailability()
export const getCachedWslAvailability = (): boolean | null =>
  hostCapabilityCache.getCachedWslAvailability()

function probeFileSystem(host: Host): Promise<RuntimeHostCapability> {
  return host.platform === 'win32'
    ? probeCommand(host, 'fs', 'powershell.exe', [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '[Console]::Out.Write((Get-Location).Path)'
      ])
    : probeCommand(host, 'fs', 'pwd', ['-P'])
}

function probePty(host: Host): Promise<RuntimeHostCapability> {
  return host.platform === 'win32'
    ? probeCommand(host, 'pty', 'powershell.exe', [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "[Console]::Out.Write('yiru-pty-ready')"
      ])
    : probeCommand(host, 'pty', 'sh', ['-lc', 'printf yiru-pty-ready'])
}

async function probeCommand(
  host: Host,
  name: RuntimeHostCapability['name'],
  command: string,
  args: string[]
): Promise<RuntimeHostCapability> {
  try {
    const result = await host.exec({ args, command, timeoutMs: 15_000 })
    return {
      available: result.exitCode === 0,
      detail: (result.exitCode === 0 ? result.stdout : result.stderr).trim().slice(0, 512) || null,
      name
    }
  } catch (error) {
    return {
      available: false,
      detail: error instanceof Error ? error.message : String(error),
      name
    }
  }
}
