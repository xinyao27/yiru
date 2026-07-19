import { execFile } from 'node:child_process'

import type {
  TailnetControl,
  TailnetFlowAddress,
  TailnetPrincipal,
  TailnetSnapshot
} from './tailnet-control'
import { TailnetControlError } from './tailnet-control'
import { locateTailscaleCli } from './tailscale-cli-locator'
import {
  normalizeTailnetIp,
  projectTailnetPrincipal,
  projectTailnetSnapshot
} from './tailscale-json-projection'

const TAILSCALE_COMMAND_TIMEOUT_MS = 3_000
const TAILSCALE_COMMAND_MAX_OUTPUT_BYTES = 2 * 1024 * 1024
const SOURCE_IDENTITY_CACHE_MS = 5_000
const SOURCE_FAILURE_COOLDOWN_MS = 1_000

type CachedPrincipal = {
  principal: TailnetPrincipal | null
  expiresAt: number
}

export type TailscaleCommandAdapterOptions = {
  cliPath?: string | null
  now?: () => number
}

export class TailscaleCommandAdapter implements TailnetControl {
  private readonly cliPath: string | null
  private readonly now: () => number
  private readonly identityCache = new Map<string, CachedPrincipal>()
  private readonly identityLookups = new Map<string, Promise<TailnetPrincipal | null>>()
  private readonly commandSlots = new CommandSlots(4)

  constructor(options: TailscaleCommandAdapterOptions = {}) {
    this.cliPath = options.cliPath === undefined ? locateTailscaleCli() : options.cliPath
    this.now = options.now ?? Date.now
  }

  async readSnapshot(): Promise<TailnetSnapshot> {
    const value = await this.runJson(['status', '--json'])
    return projectTailnetSnapshot(value, this.now())
  }

  async identifySource(address: TailnetFlowAddress): Promise<TailnetPrincipal | null> {
    const sourceAddress = normalizeTailnetIp(address.host)
    if (!sourceAddress) {
      return null
    }
    const cached = this.identityCache.get(sourceAddress)
    if (cached && cached.expiresAt > this.now()) {
      return cached.principal ? { ...cached.principal } : null
    }
    const inFlight = this.identityLookups.get(sourceAddress)
    if (inFlight) {
      return inFlight
    }
    const lookup = this.lookupSource(sourceAddress).finally(() => {
      this.identityLookups.delete(sourceAddress)
    })
    this.identityLookups.set(sourceAddress, lookup)
    return lookup
  }

  private async lookupSource(sourceAddress: string): Promise<TailnetPrincipal | null> {
    try {
      const value = await this.runJson(['whois', '--json', sourceAddress])
      const principal = projectTailnetPrincipal(value, sourceAddress)
      this.identityCache.set(sourceAddress, {
        principal,
        expiresAt: this.now() + (principal ? SOURCE_IDENTITY_CACHE_MS : SOURCE_FAILURE_COOLDOWN_MS)
      })
      return principal
    } catch (error) {
      if (error instanceof TailnetControlError && error.code === 'unsupported-output') {
        this.identityCache.set(sourceAddress, {
          principal: null,
          expiresAt: this.now() + SOURCE_FAILURE_COOLDOWN_MS
        })
        return null
      }
      throw error
    }
  }

  private async runJson(args: readonly string[]): Promise<unknown> {
    if (!this.cliPath) {
      throw new TailnetControlError('unavailable')
    }
    const stdout = await this.commandSlots.run(() => executeTailscale(this.cliPath!, args))
    try {
      return JSON.parse(stdout)
    } catch (error) {
      throw new TailnetControlError('unsupported-output', { cause: error })
    }
  }
}

function executeTailscale(cliPath: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      cliPath,
      [...args],
      {
        encoding: 'utf-8',
        timeout: TAILSCALE_COMMAND_TIMEOUT_MS,
        maxBuffer: TAILSCALE_COMMAND_MAX_OUTPUT_BYTES,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(projectCommandError(error, stderr))
          return
        }
        resolve(stdout)
      }
    )
  })
}

function projectCommandError(
  error: Error & { code?: string | number | null; killed?: boolean },
  stderr: string
): Error {
  if (error.killed || /timed?\s*out/i.test(error.message)) {
    return new TailnetControlError('timed-out', { cause: error })
  }
  if (error.code === 'EACCES' || /permission denied|access is denied/i.test(stderr)) {
    return new TailnetControlError('permission-denied', { cause: error })
  }
  if (error.code === 'ENOENT') {
    return new TailnetControlError('unavailable', { cause: error })
  }
  if (/not running|failed to connect to local tailscaled|no tailscale/i.test(stderr)) {
    return new TailnetControlError('not-running', { cause: error })
  }
  return new TailnetControlError('unsupported-output', { cause: error })
}

class CommandSlots {
  private active = 0
  private readonly waiters: (() => void)[] = []

  constructor(private readonly limit: number) {}

  async run<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    await this.acquire()
    try {
      return await operation()
    } finally {
      this.release()
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++
      return Promise.resolve()
    }
    return new Promise((resolve) => this.waiters.push(resolve))
  }

  private release(): void {
    const next = this.waiters.shift()
    if (next) {
      next()
      return
    }
    this.active--
  }
}
