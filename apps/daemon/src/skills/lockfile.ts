import { canonicalizeSkillInstallSource } from '@yiru/runtime-protocol/workbench/skill-freshness'
import type { DiscoveredSkill } from '@yiru/runtime-protocol/workbench/skills'

export type SkillLockIndex = {
  /** folderName → canonical `owner/repo` (or well-known domain). */
  byFolderName: ReadonlyMap<string, string>
}

const EMPTY_INDEX: SkillLockIndex = { byFolderName: new Map() }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Reads the `skills` CLI lockfile shape (global `.skill-lock.json` or a
 * project `skills-lock.json`) into folder-name → install source.
 *
 * Why only `source`: that is the identity `npx skills add` takes. Hashes and
 * paths are the CLI's own bookkeeping and are not a display key.
 */
export function parseSkillLockfile(value: unknown): Map<string, string> {
  if (!isRecord(value) || !isRecord(value.skills)) {
    return new Map()
  }
  const sources = new Map<string, string>()
  for (const [folderName, entry] of Object.entries(value.skills)) {
    if (!folderName || !isRecord(entry) || typeof entry.source !== 'string') {
      continue
    }
    const source = canonicalizeSkillInstallSource(entry.source)
    if (source) {
      sources.set(folderName, source)
    }
  }
  return sources
}

export function mergeSkillLockMaps(maps: readonly ReadonlyMap<string, string>[]): SkillLockIndex {
  const byFolderName = new Map<string, string>()
  for (const map of maps) {
    for (const [folderName, source] of map) {
      byFolderName.set(folderName, source)
    }
  }
  return { byFolderName }
}

export function emptySkillLockIndex(): SkillLockIndex {
  return EMPTY_INDEX
}

/**
 * Stamps each skill with the lockfile source for its folder name.
 *
 * Why folder name, not display name: the CLI lockfile keys on the install
 * directory, and a frontmatter title like `React Native` would miss.
 */
export function applySkillLockIndex(
  skills: readonly DiscoveredSkill[],
  index: SkillLockIndex
): DiscoveredSkill[] {
  if (index.byFolderName.size === 0) {
    return skills.map((skill) =>
      skill.installSource === undefined ? { ...skill, installSource: null } : skill
    )
  }
  return skills.map((skill) => {
    const installSource = index.byFolderName.get(skill.folderName) ?? null
    return skill.installSource === installSource ? skill : { ...skill, installSource }
  })
}
