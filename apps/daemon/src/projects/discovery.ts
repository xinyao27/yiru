import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import type { RuntimeProjectDirectoryEntry } from '@yiru/runtime-protocol/contract'

import type { Host } from '../hosts/contract'
import { quotePosix } from '../hosts/posix-shell'

const DISCOVERY_PATTERNS = [
  '*/.git',
  'code/*/.git',
  'projects/*/.git',
  'src/*/.git',
  'work/*/.git',
  'workspace/*/.git'
]
const MAX_DISCOVERED_PROJECTS = 80

export async function discoverProjectPaths(
  host: Host,
  registeredPaths: string[],
  query = ''
): Promise<string[]> {
  if (host.kind !== 'local') {
    return discoverRemoteProjectPaths(host, registeredPaths, query)
  }
  const candidates = new Set(registeredPaths)
  const home = await requiredHostHome(host)
  for (const pattern of DISCOVERY_PATTERNS) {
    const glob = new Bun.Glob(pattern)
    for await (const gitDirectory of glob.scan({
      absolute: true,
      cwd: home,
      dot: true,
      onlyFiles: false
    })) {
      candidates.add(resolve(dirname(gitDirectory)))
      if (candidates.size >= MAX_DISCOVERED_PROJECTS) {
        break
      }
    }
  }
  const normalizedQuery = query.trim().toLowerCase()
  return [...candidates]
    .filter((path) => existsSync(path) && path.toLowerCase().includes(normalizedQuery))
    .sort((left, right) => left.localeCompare(right))
    .slice(0, MAX_DISCOVERED_PROJECTS)
}

export async function browseHostDirectory(
  host: Host,
  requestedPath?: string
): Promise<{
  directory: string
  entries: RuntimeProjectDirectoryEntry[]
  parent: string | null
}> {
  const initialPath = requestedPath ?? (await requiredHostHome(host))
  const directory = await host.canonicalDirectory(initialPath)
  const paths =
    host.kind === 'local'
      ? await listLocalDirectories(directory)
      : await listRemoteDirectories(host, directory)
  const entries = await Promise.all(
    paths.slice(0, 200).map(async (path) => ({
      isGitProject: await host.fileExists(host.join(path, '.git')),
      name: host.basename(path),
      path
    }))
  )
  const parentPath = host.dirname(directory)
  return {
    directory,
    entries: entries.sort((left, right) => left.name.localeCompare(right.name)),
    parent: parentPath === directory ? null : parentPath
  }
}

async function discoverRemoteProjectPaths(
  host: Host,
  registeredPaths: string[],
  query: string
): Promise<string[]> {
  const home = await requiredHostHome(host)
  const script = `find ${quotePosix(home)} -mindepth 2 -maxdepth 4 -type d -name .git -print | head -n ${MAX_DISCOVERED_PROJECTS}`
  const result = await host.exec({ args: ['-lc', script], command: 'sh', timeoutMs: 20_000 })
  const candidates = new Set(registeredPaths)
  if (result.exitCode === 0) {
    for (const gitDirectory of result.stdout.split(/\r?\n/).filter(Boolean)) {
      candidates.add(host.dirname(gitDirectory))
    }
  }
  const normalizedQuery = query.trim().toLowerCase()
  return [...candidates]
    .filter((path) => path.toLowerCase().includes(normalizedQuery))
    .sort((left, right) => left.localeCompare(right))
    .slice(0, MAX_DISCOVERED_PROJECTS)
}

async function requiredHostHome(host: Host): Promise<string> {
  const home = await host.homeDirectory()
  if (!home) {
    throw new Error('host_home_unavailable')
  }
  return home
}

async function listLocalDirectories(directory: string): Promise<string[]> {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(directory, entry.name))
}

async function listRemoteDirectories(host: Host, directory: string): Promise<string[]> {
  const script = `find ${quotePosix(directory)} -mindepth 1 -maxdepth 1 -type d -print0 | head -c 1048576`
  const result = await host.exec({ args: ['-lc', script], command: 'sh' })
  if (result.exitCode !== 0) {
    throw new Error('host_directory_list_failed')
  }
  return result.stdout.split('\0').filter(Boolean).slice(0, 200)
}
