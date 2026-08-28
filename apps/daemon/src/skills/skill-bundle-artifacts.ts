import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import type {
  SkillBundleManifest,
  SkillKnownSnapshot,
  SkillReleaseMapping,
  SkillSnapshotRegistry
} from '@yiru/runtime-protocol/workbench/skill-freshness'
import { z, type ZodType } from 'zod'

import { getRuntimeHostPathsProvider } from '../runtime/host/paths-provider'

export type SkillBundleArtifacts = {
  manifest: SkillBundleManifest
  registry: SkillSnapshotRegistry
  releaseMapping: SkillReleaseMapping
  knownSnapshots: Record<string, SkillKnownSnapshot[]>
  releasedAppVersions: Record<string, Record<number, string>>
}

export type SkillBundleArtifactSources = {
  manifest: string
  registry: string
  releaseMapping: string
}

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const snapshotShape = {
  releaseRevision: z.number().int().positive(),
  packageDigest: sha256Schema,
  gitTreeSha: z.string().regex(/^[a-f0-9]{40}$/),
  files: z
    .array(
      z
        .object({
          path: z.string().min(1),
          size: z.number().int().nonnegative(),
          executable: z.boolean(),
          classification: z.enum(['text', 'binary']),
          exactSha256: sha256Schema,
          textNormalizedSha256: sha256Schema.nullable(),
          identitySha256: sha256Schema
        })
        .strict()
    )
    .min(1)
}
const knownSnapshotSchema = z.object(snapshotShape).strict()
const manifestSchema = z
  .object({
    schemaVersion: z.literal(2),
    skills: z.array(
      z
        .object({
          name: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
          sourcePath: z.string().min(1),
          ...snapshotShape
        })
        .strict()
    )
  })
  .strict()
const registrySchema = z
  .object({
    schemaVersion: z.literal(1),
    skills: z.record(z.string().min(1), z.array(knownSnapshotSchema).min(1))
  })
  .strict()
const releaseMappingSchema = z
  .object({
    schemaVersion: z.literal(1),
    releases: z.array(
      z
        .object({
          appVersion: z.string().min(1),
          skills: z.record(z.string().min(1), z.number().int().positive())
        })
        .strict()
    )
  })
  .strict()

function parseArtifact<T>(schema: ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new Error(`Invalid ${label}: ${result.error.issues[0]?.message ?? 'schema mismatch'}`)
  }
  return result.data
}

const artifactsByResourceRoot = new Map<string, Promise<SkillBundleArtifacts>>()
let configuredArtifactSources: SkillBundleArtifactSources | null = null

export function configureSkillBundleArtifactSources(
  sources: SkillBundleArtifactSources | null
): void {
  configuredArtifactSources = sources
  artifactsByResourceRoot.clear()
}

// Why: the artifacts ship with the binary and never change within a run, while
// focus-triggered rescans would otherwise re-read and re-parse them every time.
export function loadSkillBundleArtifacts(
  resourceRoot = resolveSkillBundleResourceRoot()
): Promise<SkillBundleArtifacts> {
  const cached = artifactsByResourceRoot.get(resourceRoot)
  if (cached) {
    return cached
  }
  const loading = readSkillBundleArtifacts(resourceRoot)
  artifactsByResourceRoot.set(resourceRoot, loading)
  loading.catch(() => {
    artifactsByResourceRoot.delete(resourceRoot)
  })
  return loading
}

function resolveSkillBundleResourceRoot(): string {
  const pathsProvider = getRuntimeHostPathsProvider()
  return pathsProvider.isPackaged()
    ? (pathsProvider.resourcesPath() ?? resolve(pathsProvider.appPath(), 'resources'))
    : resolve(pathsProvider.appPath(), 'resources')
}

async function readSkillBundleArtifacts(resourceRoot: string): Promise<SkillBundleArtifacts> {
  const bundleRoot = join(resourceRoot, 'skills')
  const [manifestValue, registryValue, releaseMappingValue] = configuredArtifactSources
    ? [
        JSON.parse(configuredArtifactSources.manifest),
        JSON.parse(configuredArtifactSources.registry),
        JSON.parse(configuredArtifactSources.releaseMapping)
      ]
    : await Promise.all([
        readFile(join(bundleRoot, 'current-manifest.json'), 'utf8').then(JSON.parse),
        readFile(join(bundleRoot, 'snapshot-registry.json'), 'utf8').then(JSON.parse),
        readFile(join(bundleRoot, 'release-mapping.json'), 'utf8').then(JSON.parse)
      ])
  const manifest: SkillBundleManifest = parseArtifact(
    manifestSchema,
    manifestValue,
    'skill bundle manifest'
  )
  const registry: SkillSnapshotRegistry = parseArtifact(
    registrySchema,
    registryValue,
    'skill snapshot registry'
  )
  const releaseMapping: SkillReleaseMapping = parseArtifact(
    releaseMappingSchema,
    releaseMappingValue,
    'skill release mapping'
  )
  for (const current of manifest.skills) {
    if (
      !registry.skills[current.name]?.some(
        (snapshot) =>
          snapshot.releaseRevision === current.releaseRevision &&
          snapshot.packageDigest === current.packageDigest
      )
    ) {
      throw new Error(`Inconsistent current skill snapshot: ${current.name}`)
    }
  }

  // Why: historical provenance only — the current revision's label is the
  // running build's version, supplied at the inventory boundary, not stored here.
  const releasedAppVersions: Record<string, Record<number, string>> = {}
  for (const release of releaseMapping.releases) {
    for (const [name, revision] of Object.entries(release.skills)) {
      if (!registry.skills[name]?.some((snapshot) => snapshot.releaseRevision === revision)) {
        throw new Error(`Unknown released skill revision: ${name}@${revision}`)
      }
      releasedAppVersions[name] ??= {}
      releasedAppVersions[name][revision] ??= release.appVersion
    }
  }

  return {
    manifest,
    registry,
    releaseMapping,
    // Why: newer-known classification needs every identity packaged with this
    // build, while release mapping remains the provenance record for shipped revisions.
    knownSnapshots: registry.skills,
    releasedAppVersions
  }
}
