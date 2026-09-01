import { execFile, execFileSync } from 'node:child_process'

import { parseWslUncPath } from '@yiru/runtime-protocol/model/platform'
import {
  LOCAL_EXECUTION_HOST_ID,
  toWslExecutionHostId,
  type ExecutionHostId
} from '@yiru/runtime-protocol/model/workspace'

import { toWindowsWslPath } from '../platform/wsl'

const WSL_DISTRO_LIST_FAILURE_TTL_MS = 15_000

export class WslCapabilityState {
  private readonly availabilityByHostId = new Map<ExecutionHostId, boolean>()
  private readonly distrosByHostId = new Map<ExecutionHostId, string[]>()
  private readonly homeByHostId = new Map<ExecutionHostId, string>()
  private readonly listFailedUntilByHostId = new Map<ExecutionHostId, number>()

  listDistros(): string[] {
    const cached = this.distrosByHostId.get(LOCAL_EXECUTION_HOST_ID)
    if (cached) {
      return cached
    }
    if (process.platform !== 'win32') {
      return this.rememberDistros([])
    }
    if ((this.listFailedUntilByHostId.get(LOCAL_EXECUTION_HOST_ID) ?? 0) > Date.now()) {
      return []
    }
    try {
      const output = execFileSync('wsl.exe', ['--list', '--quiet'], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000
      })
      return this.rememberDistros(normalizeWslListOutput(output).filter(isUserWslDistro))
    } catch {
      this.rememberListFailure()
      return []
    }
  }

  async listDistrosAsync(): Promise<string[]> {
    const cached = this.distrosByHostId.get(LOCAL_EXECUTION_HOST_ID)
    if (cached) {
      return cached
    }
    if (process.platform !== 'win32') {
      return this.rememberDistros([])
    }
    if ((this.listFailedUntilByHostId.get(LOCAL_EXECUTION_HOST_ID) ?? 0) > Date.now()) {
      return []
    }
    try {
      const output = await execFileUtf8('wsl.exe', ['--list', '--quiet'])
      return this.rememberDistros(normalizeWslListOutput(output).filter(isUserWslDistro))
    } catch {
      this.rememberListFailure()
      return []
    }
  }

  hasCachedDistros(): boolean {
    return this.distrosByHostId.has(LOCAL_EXECUTION_HOST_ID)
  }

  getCachedDistros(): string[] | null {
    return this.distrosByHostId.get(LOCAL_EXECUTION_HOST_ID) ?? null
  }

  home(distro: string): string | null {
    const hostId = toWslExecutionHostId(distro)
    const cached = this.homeByHostId.get(hostId)
    if (cached) {
      return cached
    }
    try {
      return this.rememberHome(hostId, distro, execWslHome(distro))
    } catch {
      return null
    }
  }

  async homeAsync(distro: string): Promise<string | null> {
    const hostId = toWslExecutionHostId(distro)
    const cached = this.homeByHostId.get(hostId)
    if (cached) {
      return cached
    }
    try {
      const home = (
        await execFileUtf8('wsl.exe', ['-d', distro, '--', 'bash', '-c', 'echo $HOME'])
      ).trim()
      return this.rememberHome(hostId, distro, home)
    } catch {
      return null
    }
  }

  available(): boolean {
    const cached = this.availabilityByHostId.get(LOCAL_EXECUTION_HOST_ID)
    if (cached !== undefined) {
      return cached
    }
    if (process.platform !== 'win32') {
      this.availabilityByHostId.set(LOCAL_EXECUTION_HOST_ID, false)
      return false
    }
    let available = false
    try {
      execFileSync('wsl.exe', ['--status'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000
      })
      available = true
    } catch {
      available = false
    }
    this.availabilityByHostId.set(LOCAL_EXECUTION_HOST_ID, available)
    return available
  }

  hasCachedAvailability(): boolean {
    return this.availabilityByHostId.has(LOCAL_EXECUTION_HOST_ID)
  }

  getCachedAvailability(): boolean | null {
    return this.availabilityByHostId.get(LOCAL_EXECUTION_HOST_ID) ?? null
  }

  private rememberDistros(distros: string[]): string[] {
    this.distrosByHostId.set(LOCAL_EXECUTION_HOST_ID, distros)
    return distros
  }

  private rememberHome(hostId: ExecutionHostId, distro: string, linuxHome: string): string | null {
    if (!linuxHome || !linuxHome.startsWith('/')) {
      return null
    }
    const home = toWindowsWslPath(linuxHome, distro)
    this.homeByHostId.set(hostId, home)
    return home
  }

  private rememberListFailure(): void {
    this.listFailedUntilByHostId.set(
      LOCAL_EXECUTION_HOST_ID,
      Date.now() + WSL_DISTRO_LIST_FAILURE_TTL_MS
    )
  }
}

export function wslUncDirectoryExists(uncPath: string): boolean | null {
  if (process.platform !== 'win32') {
    return null
  }
  const info = parseWslUncPath(uncPath)
  if (!info) {
    return null
  }
  try {
    execFileSync('wsl.exe', ['-d', info.distro, '--', 'test', '-d', info.linuxPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000
    })
    return true
  } catch (error) {
    // Why: command exit is definitive; spawn and timeout failures remain inconclusive.
    return typeof (error as { status?: unknown })?.status === 'number' ? false : null
  }
}

function execWslHome(distro: string): string {
  return execFileSync('wsl.exe', ['-d', distro, '--', 'bash', '-c', 'echo $HOME'], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 5000
  }).trim()
}

function normalizeWslListOutput(output: string): string[] {
  // Why: some Windows shells preserve the UTF-16-looking NUL bytes from wsl.exe.
  return output
    .replaceAll(String.fromCharCode(0), '')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^\*\s*/, ''))
    .filter(Boolean)
}

function isUserWslDistro(distro: string): boolean {
  return !distro.toLowerCase().startsWith('docker-desktop')
}

function execFileUtf8(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: 'utf-8', timeout: 5000 }, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }
      resolve(stdout)
    })
  })
}
