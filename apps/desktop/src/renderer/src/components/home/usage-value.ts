import { useEffect, useMemo } from 'react'

import { useAppStore } from '@/store'

export type ModelUsageValue = {
  key: string
  label: string
  tokens: number
  valueUsd: number | null
}

export type UsageValue = {
  isScanning: boolean
  models: ModelUsageValue[]
  usdPerToken: number | null
}

type ModelUsageAccumulator = {
  key: string
  label: string
  tokens: number
  knownValueUsd: number
  hasKnownValue: boolean
}

type LocalModelTokens = {
  model: string
  tokens: number
}

const EMPTY_LOCAL_MODEL_TOKENS: readonly LocalModelTokens[] = []

export function useUsageValue(localModelTokens?: readonly LocalModelTokens[]): UsageValue {
  const claudeScanState = useAppStore((state) => state.claudeUsageScanState)
  const claudeModels = useAppStore((state) => state.claudeUsageModelBreakdown)
  const codexScanState = useAppStore((state) => state.codexUsageScanState)
  const codexModels = useAppStore((state) => state.codexUsageModelBreakdown)
  const openCodeScanState = useAppStore((state) => state.openCodeUsageScanState)
  const openCodeModels = useAppStore((state) => state.openCodeUsageModelBreakdown)
  const fetchClaudeUsage = useAppStore((state) => state.fetchClaudeUsage)
  const fetchCodexUsage = useAppStore((state) => state.fetchCodexUsage)
  const fetchOpenCodeUsage = useAppStore((state) => state.fetchOpenCodeUsage)
  const enableClaudeUsage = useAppStore((state) => state.enableClaudeUsage)
  const enableCodexUsage = useAppStore((state) => state.enableCodexUsage)
  const enableOpenCodeUsage = useAppStore((state) => state.enableOpenCodeUsage)

  useEffect(() => {
    if (claudeScanState === null) {
      void fetchClaudeUsage()
    } else if (!claudeScanState.enabled) {
      void enableClaudeUsage()
    }
    if (codexScanState === null) {
      void fetchCodexUsage()
    } else if (!codexScanState.enabled) {
      void enableCodexUsage()
    }
    if (openCodeScanState === null) {
      void fetchOpenCodeUsage()
    } else if (!openCodeScanState.enabled) {
      void enableOpenCodeUsage()
    }
  }, [
    claudeScanState,
    codexScanState,
    enableClaudeUsage,
    enableCodexUsage,
    enableOpenCodeUsage,
    fetchClaudeUsage,
    fetchCodexUsage,
    fetchOpenCodeUsage,
    openCodeScanState
  ])

  const trackedModels = useMemo(
    () =>
      mergeModelUsage([
        ...claudeModels.map((model) => ({
          key: model.key,
          label: model.label,
          tokens:
            model.inputTokens + model.outputTokens + model.cacheReadTokens + model.cacheWriteTokens,
          valueUsd: model.estimatedCostUsd
        })),
        ...codexModels.map((model) => ({
          key: model.key,
          label: model.label,
          tokens: model.totalTokens,
          valueUsd: model.estimatedCostUsd
        })),
        ...openCodeModels.map((model) => ({
          key: model.key,
          label: model.label,
          tokens: model.totalTokens,
          valueUsd: model.estimatedCostUsd
        }))
      ]),
    [claudeModels, codexModels, openCodeModels]
  )
  const fallbackModels = localModelTokens ?? EMPTY_LOCAL_MODEL_TOKENS
  const models = useMemo(
    () => alignLocalModelUsage(fallbackModels, trackedModels),
    [fallbackModels, trackedModels]
  )
  const knownValueModels = trackedModels.filter(
    (model) => model.valueUsd !== null && model.tokens > 0
  )
  const knownTokens = knownValueModels.reduce((sum, model) => sum + model.tokens, 0)
  const knownValueUsd = knownValueModels.reduce((sum, model) => sum + (model.valueUsd ?? 0), 0)

  return {
    isScanning:
      claudeScanState?.isScanning === true ||
      codexScanState?.isScanning === true ||
      openCodeScanState?.isScanning === true,
    models,
    usdPerToken: knownTokens > 0 ? knownValueUsd / knownTokens : null
  }
}

function alignLocalModelUsage(
  localModels: readonly LocalModelTokens[],
  trackedModels: ModelUsageValue[]
): ModelUsageValue[] {
  if (localModels.length === 0) {
    return trackedModels
  }
  const trackedByModel = new Map(
    trackedModels.map((model) => [normalizedModelKey(model.label, model.key), model])
  )
  return mergeModelUsage(
    localModels.map((model) => {
      const key = normalizedModelKey(model.model, model.model)
      const tracked = trackedByModel.get(key)
      const trackedRate =
        tracked !== undefined && tracked.valueUsd !== null && tracked.tokens > 0
          ? tracked.valueUsd / tracked.tokens
          : null
      return {
        key,
        label: model.model,
        tokens: model.tokens,
        valueUsd: trackedRate === null ? null : model.tokens * trackedRate
      }
    })
  )
}

function mergeModelUsage(models: ModelUsageValue[]): ModelUsageValue[] {
  const byModel = new Map<string, ModelUsageAccumulator>()
  for (const model of models) {
    const key = normalizedModelKey(model.label, model.key)
    const current = byModel.get(key) ?? {
      key,
      label: model.label,
      tokens: 0,
      knownValueUsd: 0,
      hasKnownValue: false
    }
    current.tokens += model.tokens
    if (model.valueUsd !== null) {
      current.knownValueUsd += model.valueUsd
      current.hasKnownValue = true
    }
    byModel.set(key, current)
  }
  return [...byModel.values()]
    .map((model) => ({
      key: model.key,
      label: model.label,
      tokens: model.tokens,
      valueUsd: model.hasKnownValue ? model.knownValueUsd : null
    }))
    .sort((left, right) => right.tokens - left.tokens)
}

function normalizedModelKey(label: string, fallback: string): string {
  return label.trim().toLowerCase() || fallback
}
