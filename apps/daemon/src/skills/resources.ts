import { resolve } from 'node:path'

import { z, type ZodType } from 'zod'

export type SkillBundleArtifactSources = {
  manifest: string
  registry: string
  releaseMapping: string
}

export type BundledSkillGuide = {
  name: string
  description: string
  markdown: string
  fullMarkdown: string
  aliases: string[]
}

const guideSchema: ZodType<BundledSkillGuide> = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    markdown: z.string().min(1),
    fullMarkdown: z.string().min(1),
    aliases: z.array(z.string().min(1))
  })
  .strict()

const guideCollectionSchema = z
  .object({
    schemaVersion: z.literal(1),
    guides: z.array(guideSchema)
  })
  .strict()

export async function readSkillBundleArtifactSources(): Promise<SkillBundleArtifactSources> {
  const [manifest, registry, releaseMapping] = await Promise.all([
    readSkillResource('current-manifest.json'),
    readSkillResource('snapshot-registry.json'),
    readSkillResource('release-mapping.json')
  ])
  return { manifest, registry, releaseMapping }
}

export async function readBundledSkillGuides(): Promise<BundledSkillGuide[]> {
  const parsed: unknown = JSON.parse(await readSkillResource('skill-guides.json'))
  const result = guideCollectionSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`skill_guides_invalid:${result.error.issues[0]?.message ?? 'schema mismatch'}`)
  }
  return result.data.guides
}

async function readSkillResource(name: string): Promise<string> {
  const embedded = Bun.embeddedFiles.find(
    (file): file is Blob & { name: string } => 'name' in file && file.name === name
  )
  if (embedded) {
    return embedded.text()
  }
  return Bun.file(resolve(import.meta.dirname, '..', '..', 'dist', 'skill-resources', name)).text()
}
