import { lstat, open, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, relative, resolve, sep } from 'node:path'

import { summarizeSkillMarkdown } from '~shared/skill-metadata'
import type { SkillDiscoveryResult, SkillDiscoverySource, SkillPlacement } from '~shared/skills'
import type { Repo } from '~shared/types'

import { discoverClaudePluginSkillSources } from './claude-plugin-skill-sources'
import {
  buildSkillDiscoverySources,
  sourceKindForSkill,
  sourceLabelForSkill,
  stablePathId,
  type SkillScanRoot
} from './skill-discovery-sources'
import {
  classifySkillPlacementTopology,
  hasSymlinkedAncestor,
  writableDestination
} from './skill-installation-topology'
import {
  groupSkillPlacements,
  skillContentDigest,
  type SkillPlacementCandidate
} from './skill-placement-grouping'
import { countFiles, findSkillFiles, pathExists } from './skill-tree-scan'

export { buildSkillDiscoverySources } from './skill-discovery-sources'

const MAX_MARKDOWN_BYTES = 256 * 1024

async function readSkillFileHead(skillFilePath: string): Promise<{
  bytes: Buffer
  updatedAt: number
} | null> {
  try {
    const fileStat = await stat(skillFilePath)
    const file = await open(skillFilePath, 'r')
    try {
      const buffer = Buffer.alloc(Math.min(fileStat.size, MAX_MARKDOWN_BYTES))
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
      return { bytes: buffer.subarray(0, bytesRead), updatedAt: fileStat.mtimeMs }
    } finally {
      await file.close()
    }
  } catch {
    return null
  }
}

/** What the topology rules need to know about one directory on this host. */
async function probeDirectory(directoryPath: string): Promise<{
  resolvedPath: string | null
  isLinked: boolean
  writable: boolean
}> {
  const [entry, resolvedPath] = await Promise.all([
    lstat(directoryPath).catch(() => null),
    realpath(directoryPath).catch(() => null)
  ])
  return {
    resolvedPath,
    isLinked: entry?.isSymbolicLink() ?? false,
    writable: resolvedPath !== null && (await writableDestination(resolvedPath))
  }
}

async function scanRoot(
  root: SkillScanRoot,
  context: { canonicalRootPath: string; homeDir: string }
): Promise<SkillPlacementCandidate[]> {
  const maxDepth = root.sourceKind === 'plugin' ? 9 : 4
  const [skillFiles, rootIsLinked] = await Promise.all([
    findSkillFiles(root.path, maxDepth),
    // Why: only home roots live under the boundary this walk stops at, and only
    // they reach the branch that reads the answer.
    root.sourceKind === 'home'
      ? hasSymlinkedAncestor(root.path, context.homeDir)
      : Promise.resolve(false)
  ])
  const candidates = await Promise.all(
    skillFiles.map(async (skillFilePath): Promise<SkillPlacementCandidate | null> => {
      const head = await readSkillFileHead(skillFilePath)
      if (!head) {
        return null
      }
      const directoryPath = dirname(skillFilePath)
      const summary = summarizeSkillMarkdown(head.bytes.toString('utf8'))
      const folderName = basename(directoryPath)
      const sourceKind = sourceKindForSkill(root, skillFilePath, { relative, sep })
      const [directory, fileCount] = await Promise.all([
        probeDirectory(directoryPath),
        countFiles(directoryPath)
      ])
      const placement: SkillPlacement = {
        id: stablePathId(directoryPath),
        rootId: root.id,
        rootPath: root.path,
        rootLabel: root.label,
        owner: root.owner,
        // Copy: `root.providers` is shared across every skill and source from
        // this root, so a later union must not mutate the aliased array.
        providers: [...root.providers],
        sourceKind,
        sourceLabel: sourceLabelForSkill(root, sourceKind),
        directoryPath,
        skillFilePath,
        linkTargetPath:
          directory.resolvedPath && directory.resolvedPath !== directoryPath
            ? directory.resolvedPath
            : null,
        topology: directory.resolvedPath
          ? classifySkillPlacementTopology({
              rootId: root.id,
              sourceKind: root.sourceKind,
              directoryIsLinked: directory.isLinked,
              rootIsLinked,
              resolvedParentPath: dirname(directory.resolvedPath),
              canonicalRootPath: context.canonicalRootPath,
              writable: directory.writable
            })
          : 'broken-link',
        fileCount,
        updatedAt: head.updatedAt
      }
      return {
        placement,
        folderName,
        name: summary.name ?? folderName,
        description: summary.description,
        scopeKey: root.scopeKey,
        contentDigest: skillContentDigest(head.bytes)
      }
    })
  )
  return candidates.filter((candidate): candidate is SkillPlacementCandidate => candidate !== null)
}

export async function discoverSkills(args: {
  repos?: Repo[]
  homeDir?: string
  cwd?: string
  includeCwd?: boolean
}): Promise<SkillDiscoveryResult> {
  const homeDir = args.homeDir ?? homedir()
  const roots = [
    ...buildSkillDiscoverySources({ ...args, homeDir }),
    // Why: plugin discovery is native-chat data keyed to an explicit workspace.
    // Untargeted scans (Settings) keep their pre-picker inventory and cost.
    ...(args.cwd && args.includeCwd !== false
      ? await discoverClaudePluginSkillSources({ homeDir, cwd: args.cwd })
      : [])
  ]
  // Why: a provider alias is a link that lands in the shared agent-skills home,
  // so the topology rules need that home's real path, not the configured one.
  const agentsRootPath = roots.find((root) => root.id === 'home-agents')?.path ?? ''
  const canonicalRootPath = await realpath(agentsRootPath).catch(() => resolve(agentsRootPath))
  const sources: SkillDiscoverySource[] = []
  const candidateGroups = await Promise.all(
    roots.map(async (root) => {
      const exists = await pathExists(root.path)
      // Why: `scopeKey` is a scanner-side grouping input, so the source contract
      // the renderer receives is built field by field rather than spread.
      sources.push({
        id: root.id,
        label: root.label,
        path: root.path,
        sourceKind: root.sourceKind,
        providers: [...root.providers],
        owner: root.owner,
        exists,
        skippedReason: exists ? undefined : 'missing'
      })
      return exists ? scanRoot(root, { canonicalRootPath, homeDir }) : []
    })
  )
  return {
    skills: groupSkillPlacements(candidateGroups.flat()),
    sources: sources.sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
    ),
    scannedAt: Date.now()
  }
}
