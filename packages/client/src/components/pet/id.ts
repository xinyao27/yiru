export const DEFAULT_PET_ID = 'claude-the-mage'
export const OPENCODE_PET_ID = 'opencode-the-rogue'
export const GREMLIN_PET_ID = 'gremlin-the-trickster'

export type BundledPetId = typeof DEFAULT_PET_ID | typeof OPENCODE_PET_ID | typeof GREMLIN_PET_ID

const BUNDLED_PET_IDS: ReadonlySet<string> = new Set([
  DEFAULT_PET_ID,
  OPENCODE_PET_ID,
  GREMLIN_PET_ID
])

export function isBundledPetId(id: string | undefined): id is BundledPetId {
  return typeof id === 'string' && BUNDLED_PET_IDS.has(id)
}
