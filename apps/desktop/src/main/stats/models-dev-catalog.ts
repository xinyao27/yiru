export type ModelsDevPricing = {
  input: number
  output: number
  cacheRead: number | null
  cacheWrite: number | null
  thresholdTokens: number | null
  inputAboveThreshold: number | null
  outputAboveThreshold: number | null
  cacheReadAboveThreshold: number | null
  cacheWriteAboveThreshold: number | null
}

type ModelsDevModel = {
  id: string
  pricing: ModelsDevPricing
}

type ModelsDevProvider = {
  id: string
  models: ModelsDevModel[]
}

export type ModelsDevCatalog = ModelsDevProvider[]

export function mergeModelsDevCatalog(
  catalog: ModelsDevCatalog,
  fallback: ModelsDevCatalog
): ModelsDevCatalog {
  const merged = catalog.map((provider) => ({
    ...provider,
    models: [...provider.models]
  }))
  for (const fallbackProvider of fallback) {
    const provider = merged.find((entry) => entry.id === fallbackProvider.id)
    if (!provider) {
      merged.push({ ...fallbackProvider, models: [...fallbackProvider.models] })
      continue
    }
    for (const fallbackModel of fallbackProvider.models) {
      if (
        !provider.models.some((model) => model.id.toLowerCase() === fallbackModel.id.toLowerCase())
      ) {
        provider.models.push(fallbackModel)
      }
    }
  }
  return merged
}

export function parseModelsDevCatalog(value: unknown): ModelsDevCatalog {
  if (Array.isArray(value)) {
    return parseNormalizedCatalog(value)
  }
  const root = recordValue(value)
  if (!root) {
    return []
  }
  const providers = recordValue(root.providers) ?? root
  return Object.entries(providers).flatMap(([providerKey, providerValue]) => {
    const provider = recordValue(providerValue)
    const models = recordValue(provider?.models)
    const providerID = normalizeProviderID(stringValue(provider?.id) ?? providerKey)
    if (!models || !providerID) {
      return []
    }
    return [
      {
        id: providerID,
        models: Object.entries(models).flatMap(([modelKey, modelValue]) => {
          const model = recordValue(modelValue)
          const cost = recordValue(model?.cost)
          const input = finiteNumber(cost?.input)
          const output = finiteNumber(cost?.output)
          const modelID = stringValue(model?.id) ?? modelKey
          if (!cost || !modelID || input === null || output === null || input < 0 || output < 0) {
            return []
          }
          const longContext = recordValue(cost.context_over_200k)
          return [
            {
              id: modelID,
              pricing: {
                input,
                output,
                cacheRead: nonNegativeNumber(cost.cache_read),
                cacheWrite: nonNegativeNumber(cost.cache_write),
                thresholdTokens: longContext ? 200_000 : null,
                inputAboveThreshold: nonNegativeNumber(longContext?.input),
                outputAboveThreshold: nonNegativeNumber(longContext?.output),
                cacheReadAboveThreshold: nonNegativeNumber(longContext?.cache_read),
                cacheWriteAboveThreshold: nonNegativeNumber(longContext?.cache_write)
              }
            }
          ]
        })
      }
    ]
  })
}

function parseNormalizedCatalog(value: readonly unknown[]): ModelsDevCatalog {
  return value.flatMap((providerValue) => {
    const provider = recordValue(providerValue)
    const models = Array.isArray(provider?.models) ? provider.models : []
    const providerID = normalizeProviderID(stringValue(provider?.id) ?? '')
    if (!providerID) {
      return []
    }
    return [
      {
        id: providerID,
        models: models.flatMap((modelValue) => {
          const model = recordValue(modelValue)
          const pricing = recordValue(model?.pricing)
          const modelID = stringValue(model?.id)
          const input = nonNegativeNumber(pricing?.input)
          const output = nonNegativeNumber(pricing?.output)
          if (!modelID || !pricing || input === null || output === null) {
            return []
          }
          return [
            {
              id: modelID,
              pricing: {
                input,
                output,
                cacheRead: nonNegativeNumber(pricing.cacheRead),
                cacheWrite: nonNegativeNumber(pricing.cacheWrite),
                thresholdTokens: nonNegativeNumber(pricing.thresholdTokens),
                inputAboveThreshold: nonNegativeNumber(pricing.inputAboveThreshold),
                outputAboveThreshold: nonNegativeNumber(pricing.outputAboveThreshold),
                cacheReadAboveThreshold: nonNegativeNumber(pricing.cacheReadAboveThreshold),
                cacheWriteAboveThreshold: nonNegativeNumber(pricing.cacheWriteAboveThreshold)
              }
            }
          ]
        })
      }
    ]
  })
}

function normalizeProviderID(value: string): string {
  return value.trim().toLowerCase()
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function nonNegativeNumber(value: unknown): number | null {
  const parsed = finiteNumber(value)
  return parsed !== null && parsed >= 0 ? parsed : null
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
