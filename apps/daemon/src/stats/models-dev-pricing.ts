import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import {
  mergeModelsDevCatalog,
  parseModelsDevCatalog,
  type ModelsDevCatalog,
  type ModelsDevPricing
} from './models-dev-catalog'

export type { ModelsDevPricing } from './models-dev-catalog'

type ModelsDevCachePayload = {
  version: number
  fetchedAt: number
  catalog: unknown
}

const MODELS_DEV_URL = 'https://models.dev/api.json'
const MODELS_DEV_CACHE_VERSION = 1
const MODELS_DEV_CACHE_TTL_MS = 24 * 60 * 60_000
const MODELS_DEV_RETRY_MS = 15 * 60_000

let loadedCachePath: string | null = null
let cachedCatalog: ModelsDevCatalog = []
let refreshInFlight: Promise<boolean> | null = null
let lastRefreshAttemptAt = 0

export function findModelsDevPricing(
  providerID: string,
  modelID: string | null
): ModelsDevPricing | null {
  if (!modelID) {
    return null
  }
  const provider = getCachedCatalog().find((entry) => entry.id === providerID.trim().toLowerCase())
  if (!provider) {
    return null
  }
  const candidates = modelCandidates(modelID)
  for (const candidate of candidates) {
    const model = provider.models.find((entry) => entry.id.toLowerCase() === candidate)
    if (model) {
      return model.pricing
    }
  }
  return null
}

export async function refreshModelsDevPricing(force = false): Promise<boolean> {
  const cachePath = getCachePath()
  const cached = getCachedCatalog()
  if (!force && cached.length > 0 && isCacheFresh(cachePath)) {
    return false
  }
  if (!force && Date.now() - lastRefreshAttemptAt < MODELS_DEV_RETRY_MS) {
    return false
  }
  if (refreshInFlight) {
    return refreshInFlight
  }
  lastRefreshAttemptAt = Date.now()
  refreshInFlight = fetchModelsDevCatalog()
    .then((catalog) => {
      if (!isPlausibleCatalog(catalog)) {
        return false
      }
      const mergedCatalog = mergeModelsDevCatalog(catalog, cached)
      const didChange = JSON.stringify(mergedCatalog) !== JSON.stringify(getCachedCatalog())
      cachedCatalog = mergedCatalog
      loadedCachePath = cachePath
      saveCache(cachePath, mergedCatalog)
      return didChange
    })
    .catch((error: unknown) => {
      console.error('[stats] Failed to refresh models.dev pricing:', error)
      return false
    })
    .finally(() => {
      refreshInFlight = null
    })
  return refreshInFlight
}

function getCachedCatalog(): ModelsDevCatalog {
  const cachePath = getCachePath()
  if (loadedCachePath === cachePath) {
    return cachedCatalog
  }
  loadedCachePath = cachePath
  cachedCatalog = readCache(cachePath)
  return cachedCatalog
}

async function fetchModelsDevCatalog(): Promise<ModelsDevCatalog> {
  const response = await fetch(MODELS_DEV_URL, {
    signal: AbortSignal.timeout(20_000)
  })
  if (!response.ok) {
    throw new Error(`models.dev request failed (${response.status})`)
  }
  return parseModelsDevCatalog(await response.json())
}

function isCacheFresh(cachePath: string): boolean {
  try {
    const payload = recordValue(JSON.parse(readFileSync(cachePath, 'utf8')) as unknown)
    const fetchedAt = finiteNumber(payload?.fetchedAt)
    return fetchedAt !== null && Date.now() - fetchedAt < MODELS_DEV_CACHE_TTL_MS
  } catch {
    return false
  }
}

function readCache(cachePath: string): ModelsDevCatalog {
  try {
    const payload = recordValue(JSON.parse(readFileSync(cachePath, 'utf8')) as unknown)
    if (payload?.version !== MODELS_DEV_CACHE_VERSION) {
      return []
    }
    return parseModelsDevCatalog(payload.catalog)
  } catch {
    return []
  }
}

function saveCache(cachePath: string, catalog: ModelsDevCatalog): void {
  try {
    mkdirSync(dirname(cachePath), { recursive: true })
    const temporaryPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`
    const payload: ModelsDevCachePayload = {
      version: MODELS_DEV_CACHE_VERSION,
      fetchedAt: Date.now(),
      catalog
    }
    writeFileSync(temporaryPath, JSON.stringify(payload), 'utf8')
    renameSync(temporaryPath, cachePath)
  } catch {
    // Pricing remains usable from the in-memory response or bundled tables.
  }
}

function getCachePath(): string {
  const root =
    process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Caches')
      : process.platform === 'win32'
        ? (process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'))
        : (process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'))
  return join(root, 'Yiru', 'model-pricing', 'models-dev-v1.json')
}

function isPlausibleCatalog(catalog: ModelsDevCatalog): boolean {
  return ['anthropic', 'openai'].every((providerID) =>
    catalog.some((provider) => provider.id === providerID && provider.models.length > 0)
  )
}

function modelCandidates(modelID: string): string[] {
  const candidates: string[] = []
  const append = (value: string): void => {
    const normalized = value.trim().toLowerCase()
    if (normalized && !candidates.includes(normalized)) {
      candidates.push(normalized)
    }
  }
  append(modelID)
  let index = 0
  while (index < candidates.length) {
    const candidate = candidates[index]
    if (candidate.startsWith('openai/') || candidate.startsWith('openai-codex/')) {
      append(candidate.slice(candidate.indexOf('/') + 1))
    }
    if (candidate.startsWith('anthropic.') || candidate.startsWith('anthropic/')) {
      append(
        candidate.slice(
          candidate.includes('.') ? candidate.indexOf('.') + 1 : candidate.indexOf('/') + 1
        )
      )
    }
    if (candidate.startsWith('openai:') || candidate.startsWith('openai-codex:')) {
      append(candidate.slice(candidate.indexOf(':') + 1))
    }
    const atIndex = candidate.indexOf('@')
    if (atIndex > 0 && /^\d{8}$/.test(candidate.slice(atIndex + 1))) {
      append(candidate.slice(0, atIndex))
      append(`${candidate.slice(0, atIndex)}-${candidate.slice(atIndex + 1)}`)
    }
    const dated = candidate.match(/^(.*)-20\d{2}-?\d{2}-?\d{2}$/)
    if (dated?.[1]) {
      append(dated[1])
    }
    const versioned = candidate.replace(/-v\d+:\d+$/, '')
    append(versioned)
    if (candidate.startsWith('claude-') && !candidate.includes('@')) {
      append(`${candidate}@default`)
    }
    index++
  }
  return candidates
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null
}

function finiteNumber(value: unknown): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}
