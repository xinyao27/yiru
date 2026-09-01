import path from 'node:path'

import type {
  WorkspacePort,
  WorkspacePortOwner,
  WorkspacePortProbe
} from '@yiru/runtime-protocol/workbench/workspace/ports'

import type { AdvertisedUrlWatcher } from './advertised-url-watcher'
import { connectHostForBindHost } from './local-port-parsers'
import type { NormalizedWorkspacePortProbe, RawListeningPort } from './local-port-types'

const HTTP_PORTS = new Set([80, 3000, 3001, 4200, 5000, 5173, 5174, 8000, 8080, 8888])
const HTTPS_PORTS = new Set([443, 8443])

export function normalizeWorkspacePortProbes(
  worktrees: readonly WorkspacePortProbe[]
): NormalizedWorkspacePortProbe[] {
  return worktrees.map((worktree) => ({
    worktree,
    normalizedPath: normalizeComparablePath(worktree.path)
  }))
}

function attributePortToNormalizedWorkspaces(
  port: Pick<RawListeningPort, 'cwd' | 'commandLine'>,
  worktrees: readonly NormalizedWorkspacePortProbe[]
): WorkspacePortOwner | undefined {
  const cwd = port.cwd ? normalizeComparablePath(port.cwd) : null
  const commandLine = port.commandLine ? normalizeComparableText(port.commandLine) : null
  const cwdMatch = cwd
    ? pickDeepestMatching(worktrees, ({ normalizedPath }) =>
        isSameOrDescendant(cwd, normalizedPath)
      )
    : undefined
  if (cwdMatch) {
    return toOwner(cwdMatch.worktree, 'cwd')
  }
  if (!commandLine) {
    return undefined
  }
  const commandMatch = pickDeepestMatching(worktrees, ({ normalizedPath }) =>
    includesPathBoundary(commandLine, normalizedPath)
  )
  return commandMatch ? toOwner(commandMatch.worktree, 'command') : undefined
}

export function enrichWorkspacePort(
  port: RawListeningPort,
  worktrees: readonly NormalizedWorkspacePortProbe[],
  urlWatcher: Pick<AdvertisedUrlWatcher, 'lookup'>
): WorkspacePort {
  const owner = attributePortToNormalizedWorkspaces(port, worktrees)
  const base = {
    id: `${port.host}:${port.port}:${port.pid ?? 'unknown'}`,
    bindHost: port.host,
    connectHost: connectHostForBindHost(port.host),
    port: port.port,
    pid: port.pid,
    processName: port.processName,
    protocol: inferProtocol(port.port)
  }
  if (owner) {
    // Why: worktree scope prevents terminal URLs from being attributed to an
    // unrelated container or external listener.
    const advertised = urlWatcher.lookup(owner.worktreeId, port.port, port.pid)
    return {
      ...base,
      protocol: advertised?.protocol ?? base.protocol,
      kind: 'workspace',
      owner,
      ...(advertised ? { advertisedUrl: advertised.origin } : {})
    }
  }
  return isContainerProcess(port) ? { ...base, kind: 'container' } : { ...base, kind: 'external' }
}

export function reconcileAdvertisedWorkspaceUrls(
  ports: RawListeningPort[],
  worktrees: readonly NormalizedWorkspacePortProbe[],
  urlWatcher: Pick<AdvertisedUrlWatcher, 'reconcileScan'>
): void {
  const observationsByWorktree = new Map<string, { port: number; pid?: number }[]>()
  for (const worktree of worktrees) {
    observationsByWorktree.set(worktree.worktree.id, [])
  }
  for (const port of ports) {
    const owner = attributePortToNormalizedWorkspaces(port, worktrees)
    if (owner) {
      observationsByWorktree.get(owner.worktreeId)?.push({ port: port.port, pid: port.pid })
    }
  }
  for (const [worktreeId, observations] of observationsByWorktree) {
    // Why: scan reconciliation observes disappearance and PID reuse before a
    // lazy lookup could pin stale advertised metadata to a new listener.
    urlWatcher.reconcileScan([worktreeId], observations)
  }
}

export function compareWorkspacePorts(a: WorkspacePort, b: WorkspacePort): number {
  const aRank = a.kind === 'workspace' ? 0 : a.kind === 'container' ? 1 : 2
  const bRank = b.kind === 'workspace' ? 0 : b.kind === 'container' ? 1 : 2
  return aRank - bRank || a.port - b.port || a.connectHost.localeCompare(b.connectHost)
}

function inferProtocol(port: number): 'http' | 'https' | 'unknown' {
  if (HTTPS_PORTS.has(port)) {
    return 'https'
  }
  if (HTTP_PORTS.has(port)) {
    return 'http'
  }
  return 'unknown'
}

export function isContainerProcess(
  port: Pick<RawListeningPort, 'processName' | 'commandLine'>
): boolean {
  const haystack = `${port.processName ?? ''} ${port.commandLine ?? ''}`.toLowerCase()
  return /\b(com\.[\w.-]+\.backend|com\.container\w*|container\w*)\b/.test(haystack)
}

function toOwner(
  worktree: WorkspacePortProbe,
  confidence: WorkspacePortOwner['confidence']
): WorkspacePortOwner {
  return {
    worktreeId: worktree.id,
    repoId: worktree.repoId,
    displayName: worktree.displayName,
    path: worktree.path,
    confidence
  }
}

function pickDeepestMatching<T extends { normalizedPath: string }>(
  candidates: readonly T[],
  predicate: (candidate: T) => boolean
): T | undefined {
  let best: T | undefined
  for (const candidate of candidates) {
    if (
      predicate(candidate) &&
      (!best || candidate.normalizedPath.length > best.normalizedPath.length)
    ) {
      best = candidate
    }
  }
  return best
}

function isSameOrDescendant(candidate: string, parent: string): boolean {
  return candidate === parent || candidate.startsWith(`${parent}/`)
}

function includesPathBoundary(commandLine: string, normalizedPath: string): boolean {
  let index = commandLine.indexOf(normalizedPath)
  while (index !== -1) {
    const before = index === 0 ? '' : commandLine[index - 1]
    const after = commandLine[index + normalizedPath.length] ?? ''
    if ((before === '' || /\s|["'=]/.test(before)) && (after === '' || /[\s"'/:]/.test(after))) {
      return true
    }
    index = commandLine.indexOf(normalizedPath, index + normalizedPath.length)
  }
  return false
}

function normalizeComparablePath(input: string): string {
  // Why: a POSIX worktree may be evaluated on Windows; path.resolve would
  // reinterpret its leading slash as a drive-relative host path.
  return normalizeComparableText(
    input.startsWith('/') ? path.posix.resolve(input) : path.resolve(input)
  )
}

function normalizeComparableText(input: string): string {
  const normalized = input.replace(/\\/g, '/').replace(/\/+/g, '/')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}
