import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { RuntimeUpdateStatus } from '@yiru/runtime-protocol/contract'

import { getDaemonVersion } from '../runtime/paths'

const RELEASE_ENDPOINT = 'https://api.github.com/repos/xinyao27/yiru/releases/latest'
const CACHE_TTL_MS = 6 * 60 * 60_000

type GitHubRelease = {
  html_url?: unknown
  tag_name?: unknown
}

export class DaemonUpdateService {
  private cached: RuntimeUpdateStatus | null = null

  async check(force = false): Promise<RuntimeUpdateStatus> {
    if (!force && this.cached && Date.now() - this.cached.checkedAt < CACHE_TTL_MS) {
      return this.cached
    }
    const currentVersion = getDaemonVersion()
    const response = await fetch(RELEASE_ENDPOINT, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'yiru-daemon' },
      signal: AbortSignal.timeout(8_000)
    })
    if (!response.ok) {
      throw new Error(`daemon_update_check_failed:${response.status}`)
    }
    const release: GitHubRelease = await response.json()
    const tag = typeof release.tag_name === 'string' ? release.tag_name : ''
    const latestVersion = /^v\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(tag) ? tag.slice(1) : null
    const releaseUrl = typeof release.html_url === 'string' ? release.html_url : null
    this.cached = {
      checkedAt: Date.now(),
      currentVersion,
      installCommand: updateCommand(),
      latestVersion,
      releaseUrl,
      updateAvailable: latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : false
    }
    return this.cached
  }
}

function updateCommand(): string {
  const executable = process.execPath
  if (process.platform === 'win32' || existsSync(join(dirname(executable), 'yiru.version'))) {
    return 'npm install --global @yiru/cli@latest'
  }
  if (executable.includes('/Cellar/yiru/') || executable.includes('/homebrew/')) {
    return 'brew upgrade yiru'
  }
  return 'yiru update'
}

function compareVersions(left: string, right: string): number {
  const leftParts = numericVersion(left)
  const rightParts = numericVersion(right)
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (difference !== 0) {
      return difference
    }
  }
  return 0
}

function numericVersion(value: string): number[] {
  return value
    .replace(/^v/, '')
    .split(/[.+-]/, 3)
    .map((part) => Number(part) || 0)
}
