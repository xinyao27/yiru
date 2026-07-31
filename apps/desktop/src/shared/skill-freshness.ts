import type { SkillProvider, SkillSourceKind } from './skills'

export type SkillBundleFileIdentity = {
  path: string
  size: number
  executable: boolean
  classification: 'text' | 'binary'
  exactSha256: string
  textNormalizedSha256: string | null
  identitySha256: string
}

export type SkillKnownSnapshot = {
  releaseRevision: number
  packageDigest: string
  gitTreeSha: string
  files: SkillBundleFileIdentity[]
}

export type SkillCurrentBundleEntry = SkillKnownSnapshot & {
  name: string
  sourcePath: string
}

// Why: schema 2 removed the stamped app version so the committed artifact is a
// pure function of skills/ content; the running build supplies its own version.
export type SkillBundleManifest = {
  schemaVersion: 2
  skills: SkillCurrentBundleEntry[]
}

export type SkillSnapshotRegistry = {
  schemaVersion: 1
  skills: Record<string, SkillKnownSnapshot[]>
}

export type SkillReleaseMapping = {
  schemaVersion: 1
  releases: { appVersion: string; skills: Record<string, number> }[]
}

export type SkillFreshnessStatus =
  | 'current'
  | 'outdated'
  | 'newer-known'
  | 'unrecognized'
  | 'inaccessible'

export type SkillInstallationTopology =
  | 'canonical-copy'
  | 'provider-alias'
  | 'independent-copy'
  | 'external-link'
  | 'broken-link'
  | 'read-only'
  | 'repo-scope'
  | 'plugin-cache'

// Why: eligibility and the explanation copy must agree on which placements the
// validated npx rail can converge; a drifted copy would blame a phantom sibling.
export const SUPPORTED_GLOBAL_SKILL_TOPOLOGIES: ReadonlySet<SkillInstallationTopology> = new Set([
  'canonical-copy',
  'provider-alias'
])

export type SkillFreshnessInstallation = {
  id: string
  name: string
  rootId: string
  providers: SkillProvider[]
  sourceKind: SkillSourceKind
  sourceLabel: string
  unresolvedPath: string
  resolvedPath: string | null
  physicalIdentity: string | null
  topology: SkillInstallationTopology
  status: SkillFreshnessStatus
  installedReleaseRevision: number | null
  installedAppVersion: string | null
  currentReleaseRevision: number
  currentPackageDigest: string
  currentAppVersion: string
  observedPackageDigest: string | null
  observedGitTreeSha?: string | null
  errorCategory: string | null
}

export type SkillFreshnessInventory = {
  schemaVersion: 1
  installations: SkillFreshnessInstallation[]
  eligibleUpdateNames: string[]
  scannedAt: number
}

export function canonicalizeSkillUpdateNames(names: readonly string[]): string[] | null {
  const canonicalNames = [...new Set(names)].sort((left, right) => left.localeCompare(right, 'en'))
  // Why: names become editable shell input. Official manifests use this
  // restricted package-name grammar so no entry can introduce shell syntax.
  if (canonicalNames.some((name) => !/^[a-z0-9][a-z0-9._-]*$/.test(name))) {
    return null
  }
  return canonicalNames.length > 0 ? canonicalNames : null
}

export function buildTargetedSkillUpdateCommand(names: readonly string[]): string | null {
  const canonicalNames = canonicalizeSkillUpdateNames(names)
  return canonicalNames ? `npx skills update ${canonicalNames.join(' ')} --global` : null
}

/** The three `skills` CLI verbs Yiru drives headlessly. */
export type SkillManageOperation = 'update' | 'install' | 'remove'

/** Which skill home the CLI writes to: `~/.agents`, or one project checkout. */
export type SkillManageScope = { kind: 'global' } | { kind: 'project'; repoPath: string }

const SKILL_INSTALL_SOURCE_MAX_LENGTH = 200
// Why: the source becomes an argv entry next to a resolved npx path that the
// Windows rail re-quotes into cmd.exe. Whitelisting the characters a real
// `owner/repo`, GitHub URL, or well-known domain needs keeps shell syntax out.
const SKILL_INSTALL_SOURCE_CHARS_RE = /^[A-Za-z0-9._/:-]+$/
const GITHUB_REPOSITORY_URL_RE =
  /^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9._-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*?)(?:\.git)?(?:\/.*)?$/
const OWNER_REPOSITORY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/
const WELL_KNOWN_DOMAIN_RE = /^[A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)+$/

/**
 * `owner/repo`, a GitHub repository URL, or a well-known `domain.com` source,
 * normalized to what `skills add` expects — or null when it is none of those.
 */
export function canonicalizeSkillInstallSource(input: string): string | null {
  const trimmed = input.trim()
  if (
    trimmed.length === 0 ||
    trimmed.length > SKILL_INSTALL_SOURCE_MAX_LENGTH ||
    !SKILL_INSTALL_SOURCE_CHARS_RE.test(trimmed)
  ) {
    return null
  }
  const githubRepository = GITHUB_REPOSITORY_URL_RE.exec(trimmed)
  if (githubRepository) {
    return `${githubRepository[1]}/${githubRepository[2]}`
  }
  if (OWNER_REPOSITORY_RE.test(trimmed)) {
    return trimmed
  }
  return WELL_KNOWN_DOMAIN_RE.test(trimmed) ? trimmed : null
}

export type SkillUpdateFailure =
  | { kind: 'unsafe-command-path'; command: string }
  | { kind: 'launch-failed'; detail: string }
  | { kind: 'command-exited'; exitCode: number | null }
  | { kind: 'incomplete' }

/** Identifies what a settled or live run was doing; `source` is set on installs,
 *  where the CLI target is a repository rather than a set of skill names. */
type SkillRunSubject = { operation: SkillManageOperation; names: string[]; source?: string }

export type SkillUpdateRun =
  | { state: 'idle' }
  | ({ state: 'running'; startedAt: number; output: string; stopping?: boolean } & SkillRunSubject)
  | ({ state: 'success'; finishedAt: number; output: string } & SkillRunSubject)
  | ({
      state: 'error'
      finishedAt: number
      output: string
      failedNames: string[]
    } & SkillRunSubject &
      SkillUpdateFailure)

export type SkillUpdateStartResult =
  | { started: true }
  | {
      started: false
      reason:
        | 'already-running'
        | 'invalid-names'
        | 'invalid-source'
        | 'invalid-scope'
        | 'unsafe-command-path'
    }
