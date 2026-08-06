import type { RuntimeStatsSupplementalUsage } from '@yiru/runtime-protocol/mobile-runtime-types'
import type { ContributionPoint } from '@yiru/workbench-model/ui'
import { useEffect, useMemo } from 'react'
import { useAppStore } from '~renderer/store'
import {
  buildUsageValueSnapshot,
  type UsageValueModel,
  type UsageValueSupplementalInput
} from '~shared/stats/usage-value'

export type ModelUsageValue = UsageValueModel

export type UsageValue = {
  dailyTokens: ContributionPoint[]
  dailyValues: ContributionPoint[]
  hasUnpricedUsage: boolean
  hasValue: boolean
  isReady: boolean
  isScanning: boolean
  models: ModelUsageValue[]
  meteredValueUsd?: number | null
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
  const supplementalUsage = useAppStore((state) => state.statsSummary?.supplementalUsage)

  useEffect(() => {
    void prepareUsageSnapshots()
  }, [])

  const supplemental = useMemo<UsageValueSupplementalInput | undefined>(
    () => (supplementalUsage ? mapSupplementalUsage(supplementalUsage) : undefined),
    [supplementalUsage]
  )
  const usage = useMemo(
    () =>
      buildUsageValueSnapshot({
        claude: {
          daily: claudeDaily,
          modelBreakdown: claudeModels
        },
        codex: {
          daily: codexDaily,
          modelBreakdown: codexModels
        },
        openCode: {
          daily: openCodeDaily,
          modelBreakdown: openCodeModels
        },
        supplemental
      }),
    [
      claudeDaily,
      claudeModels,
      codexDaily,
      codexModels,
      openCodeDaily,
      openCodeModels,
      supplemental
    ]
  )
  const isReady =
    claudeRange === 'all' &&
    claudeSnapshotReady &&
    codexRange === 'all' &&
    codexSnapshotReady &&
    openCodeRange === 'all' &&
    openCodeSnapshotReady

  return useMemo(
    () => ({
      dailyTokens: usage.daily.map((point) => ({ day: point.day, value: point.tokens })),
      dailyValues: usage.daily.flatMap((point) =>
        point.valueUsd === null ? [] : [{ day: point.day, value: point.valueUsd }]
      ),
      hasUnpricedUsage: usage.hasUnpricedUsage,
      hasValue: usage.hasValue,
      isReady,
      isScanning:
        claudeScanState?.isScanning === true ||
        codexScanState?.isScanning === true ||
        openCodeScanState?.isScanning === true,
      models: usage.models,
      ...(usage.meteredValueUsd === undefined ? {} : { meteredValueUsd: usage.meteredValueUsd })
    }),
    [
      claudeScanState?.isScanning,
      codexScanState?.isScanning,
      isReady,
      openCodeScanState?.isScanning,
      usage
    ]
  )
}

function mapSupplementalUsage(usage: RuntimeStatsSupplementalUsage): UsageValueSupplementalInput {
  return {
    daily: usage.dailyTokens.map((point) => ({
      day: point.day,
      tokens: point.tokens,
      valueUsd: point.valueUsd,
      unpricedTokens: point.unpricedTokens
    })),
    models: usage.modelUsage,
    ...(usage.meteredValueUsd === undefined ? {} : { meteredValueUsd: usage.meteredValueUsd })
  }
}

async function prepareUsageSnapshots(): Promise<void> {
  await Promise.all([prepareClaudeUsage(), prepareCodexUsage(), prepareOpenCodeUsage()])
}

async function prepareClaudeUsage(): Promise<void> {
  let state = useAppStore.getState()
  if (state.claudeUsageScope !== 'yiru') {
    await state.setClaudeUsageScope('yiru')
  }
  state = useAppStore.getState()
  if (state.claudeUsageRange !== 'all') {
    await state.setClaudeUsageRange('all')
  }
  state = useAppStore.getState()
  if (state.claudeUsageScanState?.enabled === false) {
    await state.enableClaudeUsage()
  }
  await useAppStore.getState().fetchClaudeUsage()
}

async function prepareCodexUsage(): Promise<void> {
  let state = useAppStore.getState()
  if (state.codexUsageScope !== 'yiru') {
    await state.setCodexUsageScope('yiru')
  }
  state = useAppStore.getState()
  if (state.codexUsageRange !== 'all') {
    await state.setCodexUsageRange('all')
  }
  state = useAppStore.getState()
  if (state.codexUsageScanState?.enabled === false) {
    await state.enableCodexUsage()
  }
  await useAppStore.getState().fetchCodexUsage()
}

async function prepareOpenCodeUsage(): Promise<void> {
  let state = useAppStore.getState()
  if (state.openCodeUsageScope !== 'yiru') {
    await state.setOpenCodeUsageScope('yiru')
  }
  state = useAppStore.getState()
  if (state.openCodeUsageRange !== 'all') {
    await state.setOpenCodeUsageRange('all')
  }
  state = useAppStore.getState()
  if (state.openCodeUsageScanState?.enabled === false) {
    await state.enableOpenCodeUsage()
  }
  await useAppStore.getState().fetchOpenCodeUsage()
}
