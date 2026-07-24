/**
 * Leak-diagnosis counts for renderer_memory_highwater breadcrumbs.
 *
 * Why a contributor registry: crash diagnostics stays a leaf module, so
 * subsystems push counts in rather than importing their state and creating cycles.
 */

export type RendererMemoryProfileCounts = Record<string, number>

type RendererMemoryProfileContributor = () => RendererMemoryProfileCounts

const contributors = new Map<string, RendererMemoryProfileContributor>()

// Why: detailed breadcrumbs run near OOM; every dimension of contributor work
// and output must remain bounded even when an extension misbehaves.
const MAX_COUNTS_PER_CONTRIBUTOR = 32
const MAX_PROFILE_COUNTS = 64
const MAX_PROFILE_CONTRIBUTORS = 64
const MAX_CONTRIBUTOR_NAME_LENGTH = 64
const MAX_COUNT_KEY_LENGTH = 80

export function registerRendererMemoryProfileContributor(
  name: string,
  contributor: RendererMemoryProfileContributor
): () => void {
  if (
    name.length === 0 ||
    name.length > MAX_CONTRIBUTOR_NAME_LENGTH ||
    (!contributors.has(name) && contributors.size >= MAX_PROFILE_CONTRIBUTORS)
  ) {
    return () => undefined
  }
  contributors.set(name, contributor)
  return () => {
    if (contributors.get(name) === contributor) {
      contributors.delete(name)
    }
  }
}

export function collectRendererMemoryProfileCounts(): RendererMemoryProfileCounts {
  const counts: RendererMemoryProfileCounts = {}
  let collected = 0
  let visited = 0
  for (const [name, contributor] of contributors) {
    if (collected >= MAX_PROFILE_COUNTS || visited >= MAX_PROFILE_CONTRIBUTORS) {
      break
    }
    visited += 1
    try {
      const contribution = contributor()
      let inspected = 0
      for (const key in contribution) {
        if (inspected >= MAX_COUNTS_PER_CONTRIBUTOR || collected >= MAX_PROFILE_COUNTS) {
          break
        }
        inspected += 1
        if (
          !Object.hasOwn(contribution, key) ||
          key.length === 0 ||
          key.length > MAX_COUNT_KEY_LENGTH
        ) {
          continue
        }
        const value = contribution[key]
        if (typeof value === 'number' && Number.isFinite(value)) {
          counts[`${name}.${key}`] = value
          collected += 1
        }
      }
    } catch {
      if (collected < MAX_PROFILE_COUNTS) {
        counts[`${name}.error`] = 1
        collected += 1
      }
    }
  }
  return counts
}

/** Sizes of the largest top-level state collections, without retaining values. */
export function summarizeStateCollectionSizes(
  state: unknown,
  limit: number
): RendererMemoryProfileCounts {
  if (typeof state !== 'object' || state === null) {
    return {}
  }
  const sizes: [string, number][] = []
  for (const [key, value] of Object.entries(state)) {
    const size = collectionSize(value)
    if (size !== null && size > 0) {
      sizes.push([key, size])
    }
  }
  sizes.sort((left, right) => right[1] - left[1])
  return Object.fromEntries(sizes.slice(0, limit))
}

function collectionSize(value: unknown): number | null {
  if (Array.isArray(value)) {
    return value.length
  }
  if (value instanceof Map || value instanceof Set) {
    return value.size
  }
  if (typeof value !== 'object' || value === null) {
    return null
  }
  let size = 0
  // Why: Object.keys allocates an array proportional to the leaking collection.
  for (const key in value) {
    if (Object.hasOwn(value, key)) {
      size += 1
    }
  }
  return size
}
