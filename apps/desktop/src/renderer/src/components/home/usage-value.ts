import type { ContributionPoint } from '@yiru/workbench-model/ui'
import { useEffect, useMemo } from 'react'

import { useAppStore } from '@/store'

export type ModelUsageValue = {
  key: string
  label: string
  tokens: number
  valueUsd: number | null
}

export type UsageValue = {
  dailyTokens: ContributionPoint[]
  dailyValues: ContributionPoint[]
  hasUnpricedUsage: boolean
  hasValue: boolean
  isReady: boolean
  isScanning: boolean
  models: ModelUsageValue[]
}

type ModelUsageAccumulator = {
  key: string
  label: string
  tokens: number
  knownValueUsd: number
  hasKnownValue: boolean
}

type DailyUsagePoint = {
  day: string
  tokens: number
  valueUsd: number | null
  unpricedTokens: number
}

export function useUsageValue(): UsageValue {
  const claudeScanState = useAppStore((state) => state.claudeUsageScanState)
  const claudeRange = useAppStore((state) => state.claudeUsageRange)
  const claudeSnapshotReady = useAppStore((state) => state.claudeUsageSnapshotReady)
  const claudeDaily = useAppStore((state) => state.claudeUsageDaily)
  const claudeModels = useAppStore((state) => state.claudeUsageModelBreakdown)
  const codexScanState = useAppStore((state) => state.codexUsageScanState)
  const codexRange = useAppStore((state) => state.codexUsageRange)
  const codexSnapshotReady = useAppStore((state) => state.codexUsageSnapshotReady)
  const codexDaily = useAppStore((state) => state.codexUsageDaily)
  const codexModels = useAppStore((state) => state.codexUsageModelBreakdown)
  const openCodeScanState = useAppStore((state) => state.openCodeUsageScanState)
  const openCodeRange = useAppStore((state) => state.openCodeUsageRange)
  const openCodeSnapshotReady = useAppStore((state) => state.openCodeUsageSnapshotReady)
  const openCodeDaily = useAppStore((state) => state.openCodeUsageDaily)
  const openCodeModels = useAppStore((state) => state.openCodeUsageModelBreakdown)

  useEffect(() => {
    void prepareUsageSnapshots()
  }, [])

  const models = useMemo(
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
          valueUsd: null
        }))
      ]),
    [claudeModels, codexModels, openCodeModels]
  )
  const dailyUsage = useMemo(
    () =>
      mergeDailyUsage([
        ...claudeDaily.map((point) => ({
          day: point.day,
          tokens:
            point.inputTokens + point.outputTokens + point.cacheReadTokens + point.cacheWriteTokens,
          valueUsd: point.estimatedCostUsd,
          unpricedTokens: point.unpricedTokens
        })),
        ...codexDaily.map((point) => ({
          day: point.day,
          tokens: point.totalTokens,
          valueUsd: point.estimatedCostUsd,
          unpricedTokens: point.unpricedTokens
        })),
        ...openCodeDaily.map((point) => ({
          day: point.day,
          tokens: point.totalTokens,
          valueUsd: null,
          unpricedTokens: point.totalTokens
        }))
      ]),
    [claudeDaily, codexDaily, openCodeDaily]
  )
  const hasValue =
    dailyUsage.some((point) => point.valueUsd !== null) ||
    models.some((model) => model.valueUsd !== null)
  const isReady =
    claudeRange === 'all' &&
    claudeSnapshotReady &&
    codexRange === 'all' &&
    codexSnapshotReady &&
    openCodeRange === 'all' &&
    openCodeSnapshotReady

  return useMemo(
    () => ({
      dailyTokens: dailyUsage.map((point) => ({ day: point.day, value: point.tokens })),
      dailyValues: dailyUsage.flatMap((point) =>
        point.valueUsd === null ? [] : [{ day: point.day, value: point.valueUsd }]
      ),
      hasUnpricedUsage:
        dailyUsage.some((point) => point.unpricedTokens > 0) ||
        models.some((model) => model.tokens > 0 && model.valueUsd === null),
      hasValue,
      isReady,
      isScanning:
        claudeScanState?.isScanning === true ||
        codexScanState?.isScanning === true ||
        openCodeScanState?.isScanning === true,
      models
    }),
    [
      claudeScanState?.isScanning,
      codexScanState?.isScanning,
      dailyUsage,
      hasValue,
      isReady,
      models,
      openCodeScanState?.isScanning
    ]
  )
}

async function prepareUsageSnapshots(): Promise<void> {
  await Promise.all([prepareClaudeUsage(), prepareCodexUsage(), prepareOpenCodeUsage()])
}

async function prepareClaudeUsage(): Promise<boolean> {
  let state = useAppStore.getState()
  if (state.claudeUsageRange !== 'all') {
    await state.setClaudeUsageRange('all')
  }
  state = useAppStore.getState()
  if (state.claudeUsageScanState?.enabled === false) {
    await state.enableClaudeUsage()
  }
  return (await useAppStore.getState().fetchClaudeUsage()) === true
}

async function prepareCodexUsage(): Promise<boolean> {
  let state = useAppStore.getState()
  if (state.codexUsageRange !== 'all') {
    await state.setCodexUsageRange('all')
  }
  state = useAppStore.getState()
  if (state.codexUsageScanState?.enabled === false) {
    await state.enableCodexUsage()
  }
  return (await useAppStore.getState().fetchCodexUsage()) === true
}

async function prepareOpenCodeUsage(): Promise<boolean> {
  let state = useAppStore.getState()
  if (state.openCodeUsageRange !== 'all') {
    await state.setOpenCodeUsageRange('all')
  }
  state = useAppStore.getState()
  if (state.openCodeUsageScanState?.enabled === false) {
    await state.enableOpenCodeUsage()
  }
  return (await useAppStore.getState().fetchOpenCodeUsage()) === true
}

function mergeDailyUsage(points: DailyUsagePoint[]): DailyUsagePoint[] {
  const byDay = new Map<string, DailyUsagePoint>()
  for (const point of points) {
    const current = byDay.get(point.day) ?? {
      day: point.day,
      tokens: 0,
      valueUsd: null,
      unpricedTokens: 0
    }
    current.tokens += point.tokens
    current.unpricedTokens += point.unpricedTokens
    if (point.valueUsd !== null) {
      current.valueUsd = (current.valueUsd ?? 0) + point.valueUsd
    }
    byDay.set(point.day, current)
  }
  return [...byDay.values()].sort((left, right) => left.day.localeCompare(right.day))
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
