import { createHash } from 'node:crypto'

import type { DiscoveredSkill, SkillPlacement } from '@yiru/runtime-protocol/workbench/skills'

import { compareSkills, stablePathId } from './skill-discovery-sources'
import { skillTopologyPriority } from './skill-installation-topology'

export type SkillPlacementCandidate = {
  placement: SkillPlacement
  /** Directory slug — what the `skills` CLI matches on. */
  folderName: string
  /** Frontmatter display name, already defaulted to the slug. */
  name: string
  description: string | null
  scopeKey: string
  contentDigest: string
}

/**
 * Identity of the skill text one placement holds.
 *
 * Why only SKILL.md: it is the file every scanner already reads and the one an
 * agent actually loads. Hashing whole packages would cost a full tree read per
 * placement — hundreds of them — to catch a stray `.DS_Store`.
 */
export function skillContentDigest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16)
}

/**
 * Which row a placement belongs to.
 *
 * Scope keeps a repository's copy separate from the global one. The slug is the
 * CLI-addressable identity, so it — not the frontmatter display name — decides
 * sameness. The content digest splits drifted copies apart: two homes holding
 * different `code-review` text are two skills that happen to share a name, and
 * merging them would silently hide whichever one lost the tie-break.
 */
function groupKey(candidate: SkillPlacementCandidate): string {
  return [
    candidate.scopeKey,
    candidate.placement.sourceKind,
    candidate.folderName,
    candidate.contentDigest
  ].join('\0')
}

/** Ranks the placement whose path the row's CLI actions should name first. */
function comparePlacements(left: SkillPlacement, right: SkillPlacement): number {
  return (
    skillTopologyPriority(right.topology) - skillTopologyPriority(left.topology) ||
    left.rootLabel.localeCompare(right.rootLabel, undefined, { sensitivity: 'base' }) ||
    left.directoryPath.localeCompare(right.directoryPath)
  )
}

function latestUpdatedAt(placements: readonly SkillPlacement[]): number | null {
  return placements.reduce<number | null>(
    (latest, placement) =>
      placement.updatedAt !== null && (latest === null || placement.updatedAt > latest)
        ? placement.updatedAt
        : latest,
    null
  )
}

function buildSkill(key: string, candidates: readonly SkillPlacementCandidate[]): DiscoveredSkill {
  const placements = [...candidates].map((candidate) => candidate.placement).sort(comparePlacements)
  // Why: the flat path fields drive reveal, file listing, and the CLI verbs, so
  // they must name the placement those act on rather than whichever root the
  // scan happened to reach first.
  const primary = candidates.reduce((best, candidate) =>
    comparePlacements(candidate.placement, best.placement) < 0 ? candidate : best
  )
  return {
    id: stablePathId(key),
    name: primary.name,
    folderName: primary.folderName,
    // Every placement in a row holds identical SKILL.md bytes by construction,
    // so the primary's summary speaks for all of them.
    description: primary.description,
    providers: [...new Set(placements.flatMap((placement) => placement.providers))],
    sourceKind: primary.placement.sourceKind,
    sourceLabel: primary.placement.sourceLabel,
    rootPath: primary.placement.rootPath,
    placements,
    directoryPath: primary.placement.directoryPath,
    skillFilePath: primary.placement.skillFilePath,
    installed: true,
    fileCount: primary.placement.fileCount,
    updatedAt: latestUpdatedAt(placements)
  }
}

/** Collapses every scanned directory into one row per distinct skill. */
export function groupSkillPlacements(
  candidates: readonly SkillPlacementCandidate[]
): DiscoveredSkill[] {
  const groups = new Map<string, SkillPlacementCandidate[]>()
  for (const candidate of candidates) {
    const key = groupKey(candidate)
    const group = groups.get(key)
    if (!group) {
      groups.set(key, [candidate])
      continue
    }
    // Why: two roots can name the same directory, and the second sighting is
    // the same placement rather than another agent that can see the skill.
    if (!group.some((entry) => entry.placement.id === candidate.placement.id)) {
      group.push(candidate)
    }
  }
  return [...groups].map(([key, group]) => buildSkill(key, group)).sort(compareSkills)
}
