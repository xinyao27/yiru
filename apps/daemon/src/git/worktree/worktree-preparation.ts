import { cp, lstat, mkdir, readdir } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

import { parse } from 'yaml'

import type { Host } from '../../hosts/contract'
import { quotePosix } from '../../hosts/posix-shell'
import { runGit } from '../runner/command'

const INCLUDE_FILE_NAME = '.worktreeinclude'
const CONFIG_FILE_NAME = 'yiru.yaml'
const DEFAULT_INCLUDED_FILES = ['.env', '.env.local'] as const
const MAX_COPY_BYTES = 100 * 1024 * 1024
const MAX_COPY_ENTRIES = 10_000
const SETUP_TIMEOUT_MS = 10 * 60 * 1_000

export type WorktreePreparationProgress =
  | { kind: 'git-complete' }
  | { kind: 'files-copied'; count: number }
  | { kind: 'setup-started'; command: string }
  | { kind: 'setup-complete'; configured: boolean; exitCode: number | null }

export async function prepareWorktree(
  sourcePath: string,
  worktreePath: string,
  shouldRunSetup: boolean,
  report: (progress: WorktreePreparationProgress) => void,
  host: Host
): Promise<void> {
  const count =
    host.kind === 'local'
      ? await copyIncludedPaths(sourcePath, worktreePath, host)
      : await copyRemoteIncludedPaths(sourcePath, worktreePath, host)
  report({ count, kind: 'files-copied' })
  const setup = await readSetupCommand(worktreePath, host)
  if (!setup || !shouldRunSetup) {
    report({ configured: setup !== null, exitCode: null, kind: 'setup-complete' })
    return
  }
  report({ command: setup, kind: 'setup-started' })
  try {
    const result = await host.exec({
      args: ['-lc', setup],
      command: 'sh',
      cwd: worktreePath,
      timeoutMs: SETUP_TIMEOUT_MS
    })
    report({ configured: true, exitCode: result.exitCode, kind: 'setup-complete' })
  } catch {
    report({ configured: true, exitCode: -1, kind: 'setup-complete' })
  }
}

async function copyIncludedPaths(
  sourcePath: string,
  worktreePath: string,
  host: Host
): Promise<number> {
  const candidates = new Set<string>(DEFAULT_INCLUDED_FILES)
  const includeFile = Bun.file(join(sourcePath, INCLUDE_FILE_NAME))
  if (await includeFile.exists()) {
    for (const line of (await includeFile.text()).split(/\r?\n/)) {
      const entry = line.trim()
      if (entry && !entry.startsWith('#')) {
        candidates.add(entry)
      }
    }
  }
  let copied = 0
  let totalBytes = 0
  let totalEntries = 0
  for (const entry of candidates) {
    const safePath = resolveContainedPath(sourcePath, entry)
    if (!safePath || !(await isGitIgnored(sourcePath, entry, host))) {
      continue
    }
    const size = await measurePath(safePath)
    if (
      !size ||
      totalBytes + size.bytes > MAX_COPY_BYTES ||
      totalEntries + size.entries > MAX_COPY_ENTRIES
    ) {
      continue
    }
    const destination = join(worktreePath, relative(sourcePath, safePath))
    await mkdir(dirname(destination), { recursive: true })
    await cp(safePath, destination, { recursive: size.isDirectory, preserveTimestamps: true })
    totalBytes += size.bytes
    totalEntries += size.entries
    copied++
  }
  return copied
}

async function copyRemoteIncludedPaths(
  sourcePath: string,
  worktreePath: string,
  host: Host
): Promise<number> {
  const candidates = new Set<string>(DEFAULT_INCLUDED_FILES)
  const includeText = await host.readText(host.join(sourcePath, INCLUDE_FILE_NAME), 64 * 1_024)
  for (const line of includeText?.split(/\r?\n/) ?? []) {
    const entry = line.trim()
    if (entry && !entry.startsWith('#')) {
      candidates.add(entry)
    }
  }
  let copied = 0
  let totalBytes = 0
  let totalEntries = 0
  for (const entry of candidates) {
    const relativePath = safeRemoteRelativePath(entry)
    if (!relativePath || !(await isGitIgnored(sourcePath, relativePath, host))) {
      continue
    }
    const source = host.join(sourcePath, relativePath)
    const size = await measureRemotePath(source, host)
    if (
      !size ||
      totalBytes + size.bytes > MAX_COPY_BYTES ||
      totalEntries + size.entries > MAX_COPY_ENTRIES
    ) {
      continue
    }
    const destination = host.join(worktreePath, relativePath)
    const mkdir = await host.exec({
      args: ['-p', '--', host.dirname(destination)],
      command: 'mkdir'
    })
    if (mkdir.exitCode !== 0) {
      continue
    }
    const copy = await host.exec({ args: ['-R', '-p', '--', source, destination], command: 'cp' })
    if (copy.exitCode !== 0) {
      continue
    }
    totalBytes += size.bytes
    totalEntries += size.entries
    copied++
  }
  return copied
}

async function isGitIgnored(repoPath: string, entry: string, host: Host): Promise<boolean> {
  try {
    await runGit(repoPath, ['check-ignore', '--quiet', '--', entry], undefined, host)
    return true
  } catch {
    return false
  }
}

function safeRemoteRelativePath(entry: string): string | null {
  if (!entry || entry.startsWith('/') || entry.includes('*') || entry.includes('?')) {
    return null
  }
  const parts = entry.split('/').filter((part) => part && part !== '.')
  return parts.length > 0 && parts.every((part) => part !== '..') ? parts.join('/') : null
}

async function measureRemotePath(
  path: string,
  host: Host
): Promise<{ bytes: number; entries: number } | null> {
  const script = [
    `test ! -L ${quotePosix(path)}`,
    `test -z "$(find ${quotePosix(path)} -xdev -type l -print -quit)"`,
    `bytes=$(du -sk -- ${quotePosix(path)} | awk '{print $1 * 1024}')`,
    `entries=$(find ${quotePosix(path)} -xdev -print | head -n ${MAX_COPY_ENTRIES + 1} | wc -l)`,
    'printf "%s %s" "$bytes" "$entries"'
  ].join(' && ')
  const result = await host.exec({ args: ['-lc', script], command: 'sh' })
  const [rawBytes, rawEntries] = result.stdout.trim().split(/\s+/)
  const bytes = Number(rawBytes)
  const entries = Number(rawEntries)
  return result.exitCode === 0 && Number.isSafeInteger(bytes) && Number.isSafeInteger(entries)
    ? { bytes, entries }
    : null
}

function resolveContainedPath(root: string, entry: string): string | null {
  if (!entry || isAbsolute(entry) || entry.includes('*') || entry.includes('?')) {
    return null
  }
  const resolved = resolve(root, entry)
  const fromRoot = relative(root, resolved)
  return fromRoot && !fromRoot.startsWith('..') && !isAbsolute(fromRoot) ? resolved : null
}

async function measurePath(
  path: string
): Promise<{ bytes: number; entries: number; isDirectory: boolean } | null> {
  try {
    const root = await lstat(path)
    if (root.isSymbolicLink()) {
      return null
    }
    let bytes = root.isFile() ? root.size : 0
    let entries = 1
    const pending = root.isDirectory() ? [path] : []
    while (pending.length > 0) {
      const directory = pending.pop()
      if (!directory) {
        break
      }
      for (const child of await readdir(directory, { withFileTypes: true })) {
        if (child.isSymbolicLink()) {
          return null
        }
        entries++
        if (entries > MAX_COPY_ENTRIES) {
          return null
        }
        const childPath = join(directory, child.name)
        if (child.isDirectory()) {
          pending.push(childPath)
        } else {
          bytes += (await lstat(childPath)).size
          if (bytes > MAX_COPY_BYTES) {
            return null
          }
        }
      }
    }
    return { bytes, entries, isDirectory: root.isDirectory() }
  } catch {
    return null
  }
}

async function readSetupCommand(worktreePath: string, host: Host): Promise<string | null> {
  const text = await host.readText(host.join(worktreePath, CONFIG_FILE_NAME), 1024 * 1024)
  if (text === null) {
    return null
  }
  try {
    const value: unknown = parse(text)
    if (typeof value !== 'object' || value === null) {
      return null
    }
    const scripts = Reflect.get(value, 'scripts')
    if (typeof scripts !== 'object' || scripts === null) {
      return null
    }
    const setup = Reflect.get(scripts, 'setup')
    return typeof setup === 'string' && setup.trim() ? setup.trim() : null
  } catch {
    return null
  }
}
