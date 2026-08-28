import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { access, lstat, realpath, stat } from 'node:fs/promises'
import { dirname, normalize, resolve } from 'node:path'

import type {
  SkillInstallationTopology,
  SkillSourceKind
} from '@yiru/runtime-protocol/workbench/skills'

import type { SkillScanRoot } from './skill-discovery-sources'

export type ClassifiedSkillTopology = {
  topology: SkillInstallationTopology
  resolvedPath: string | null
  identity: string | null
  errorCategory: string | null
}

export function skillPlacementId(unresolvedPath: string, name: string): string {
  return createHash('sha256')
    .update(normalizedSkillIdentityPath(unresolvedPath))
    .update('\0')
    .update(name)
    .digest('hex')
    .slice(0, 24)
}

export function normalizedSkillIdentityPath(value: string): string {
  const normalized = normalize(value)
  return process.platform === 'win32' ? normalized.toLocaleLowerCase('en-US') : normalized
}

export function skillPhysicalIdentity(
  resolvedPath: string,
  fileStat: NonNullable<Awaited<ReturnType<typeof stat>>>
): string {
  const inodeIdentity = fileStat.dev || fileStat.ino ? `${fileStat.dev}:${fileStat.ino}` : null
  return inodeIdentity ?? normalizedSkillIdentityPath(resolvedPath)
}

export function skillTopologyPriority(topology: SkillInstallationTopology): number {
  switch (topology) {
    case 'canonical-copy':
      return 3
    case 'independent-copy':
      return 2
    case 'provider-alias':
      return 1
    case 'external-link':
    case 'broken-link':
    case 'read-only':
    case 'repo-scope':
    case 'plugin-cache':
    case 'unknown':
      return 0
  }
}

export type SkillPlacementTopologyInput = {
  rootId: string
  /** The scan root's kind, so a `.system` bundled subtree keeps home rules. */
  sourceKind: SkillSourceKind
  /** The skill directory entry is itself a symlink. */
  directoryIsLinked: boolean
  /** The scan root (or a parent) is a link, so everything under it is aliased. */
  rootIsLinked: boolean
  /** Parent of the directory the entry actually resolves to. */
  resolvedParentPath: string
  /** The shared `~/.agents/skills` home that provider aliases point into. */
  canonicalRootPath: string
  writable: boolean
}

/**
 * The single rule set for what a skill directory is.
 *
 * Why it is pure: the native scanner learns these inputs from `node:fs` and the
 * WSL scanner from a bash probe, and the two must not drift into disagreeing
 * about what counts as a provider alias.
 */
export function classifySkillPlacementTopology(
  input: SkillPlacementTopologyInput
): SkillInstallationTopology {
  if (input.sourceKind === 'repo') {
    return 'repo-scope'
  }
  if (input.sourceKind === 'plugin') {
    return 'plugin-cache'
  }
  const isCanonicalTarget =
    normalizedSkillIdentityPath(input.resolvedParentPath) ===
    normalizedSkillIdentityPath(input.canonicalRootPath)
  let topology: SkillInstallationTopology
  if (input.directoryIsLinked) {
    topology = isCanonicalTarget ? 'provider-alias' : 'external-link'
  } else if (input.rootIsLinked) {
    topology = 'external-link'
  } else {
    topology = input.rootId === 'home-agents' ? 'canonical-copy' : 'independent-copy'
  }
  // Why: an external link is owned elsewhere, so its writability says nothing
  // about whether this host can manage the placement.
  return topology !== 'external-link' && !input.writable ? 'read-only' : topology
}

export async function writableDestination(path: string): Promise<boolean> {
  try {
    await Promise.all([
      access(path, constants.R_OK | constants.W_OK),
      access(dirname(path), constants.W_OK)
    ])
    return true
  } catch {
    return false
  }
}

export async function hasSymlinkedAncestor(path: string, boundary: string): Promise<boolean> {
  let current = resolve(path)
  const stop = resolve(boundary)
  for (;;) {
    const entry = await lstat(current).catch(() => null)
    if (!entry || entry.isSymbolicLink()) {
      return true
    }
    const parent = dirname(current)
    if (current === stop) {
      return false
    }
    if (parent === current) {
      return true
    }
    current = parent
  }
}

export async function classifyHomeSkillTopology(
  root: SkillScanRoot,
  unresolvedPath: string,
  canonicalRootPath: string
): Promise<ClassifiedSkillTopology> {
  let logicalStat: Awaited<ReturnType<typeof lstat>>
  try {
    logicalStat = await lstat(unresolvedPath)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {
        topology: 'broken-link',
        resolvedPath: null,
        identity: null,
        errorCategory: 'missing'
      }
    }
    throw error
  }
  const linked = logicalStat.isSymbolicLink()
  let resolvedPath: string
  let resolvedStat: Awaited<ReturnType<typeof stat>>
  try {
    resolvedPath = await realpath(unresolvedPath)
    resolvedStat = await stat(resolvedPath)
  } catch {
    return {
      topology: 'broken-link',
      resolvedPath: null,
      identity: null,
      errorCategory: 'dangling-link'
    }
  }
  if (!resolvedStat.isDirectory()) {
    return {
      topology: 'broken-link',
      resolvedPath,
      identity: null,
      errorCategory: 'not-directory'
    }
  }

  const identity = skillPhysicalIdentity(resolvedPath, resolvedStat)
  const canonicalRoot = await realpath(canonicalRootPath).catch(() => resolve(canonicalRootPath))
  const homeBoundary = dirname(dirname(canonicalRootPath))
  const topology = classifySkillPlacementTopology({
    rootId: root.id,
    sourceKind: root.sourceKind,
    directoryIsLinked: linked,
    rootIsLinked: await hasSymlinkedAncestor(root.path, homeBoundary),
    resolvedParentPath: dirname(resolvedPath),
    canonicalRootPath: canonicalRoot,
    writable: await writableDestination(resolvedPath)
  })
  return { topology, resolvedPath, identity, errorCategory: null }
}

export async function classifyUnsupportedSkillTopology(
  directoryPath: string,
  sourceKind: 'repo' | 'plugin'
): Promise<ClassifiedSkillTopology> {
  try {
    const resolvedPath = await realpath(directoryPath)
    const resolvedStat = await stat(resolvedPath)
    if (!resolvedStat.isDirectory()) {
      throw new Error('not-directory')
    }
    return {
      topology: sourceKind === 'repo' ? 'repo-scope' : 'plugin-cache',
      resolvedPath,
      identity: skillPhysicalIdentity(resolvedPath, resolvedStat),
      errorCategory: null
    }
  } catch (error) {
    return {
      topology: sourceKind === 'repo' ? 'repo-scope' : 'plugin-cache',
      resolvedPath: null,
      identity: null,
      errorCategory: error instanceof Error ? error.message : 'read-failed'
    }
  }
}
