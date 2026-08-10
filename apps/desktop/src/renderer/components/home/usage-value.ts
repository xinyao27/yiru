import type { RuntimeStatsSupplementalUsage } from '@yiru/runtime-protocol/mobile-runtime-types'
import type { ContributionPoint } from '@yiru/workbench-model/ui'
import { useEffect, useMemo } from 'react'
import { useAppStore } from '~renderer/store'
import {
  buildUsageValueSnapshot,
  type UsageValueModel,
  type UsageValueSupplementalInput
} from '~shared/stats/usage-value'

import {
  buildDailyProviderUsage,
  buildProjectUsage,
  type DailyProviderUsage,
  type ProjectUsageValue
} from './usage-aggregation'
import { dayIsInUsageRange, type UsageRange } from './usage-range'

export type ModelUsageValue = UsageValueModel

export type UsageValue = {
  dailyByProvider: DailyProviderUsage[]
  dailyTokens: ContributionPoint[]
  dailyValues: ContributionPoint[]
  hasUnpricedUsage: boolean
  hasValue: boolean
  isReady: boolean
  isScanning: boolean
  models: ModelUsageValue[]
  projects: ProjectUsageValue[]
  range: UsageRange
  meteredValueUsd?: number | null
}

export function useUsageValue(range: UsageRange): UsageValue {
  const claudeScanState = useAppStore((state) => state.claudeUsageScanState)
  const claudeRange = useAppStore((state) => state.claudeUsageRange)
  const claudeSnapshotReady = useAppStore((state) => state.claudeUsageSnapshotReady)
  const claudeDaily = useAppStore((state) => state.claudeUsageDaily)
  const claudeModels = useAppStore((state) => state.claudeUsageModelBreakdown)
  const claudeProjects = useAppStore((state) => state.claudeUsageProjectBreakdown)
  const codexScanState = useAppStore((state) => state.codexUsageScanState)
  const codexRange = useAppStore((state) => state.codexUsageRange)
  const codexSnapshotReady = useAppStore((state) => state.codexUsageSnapshotReady)
  const codexDaily = useAppStore((state) => state.codexUsageDaily)
  const codexModels = useAppStore((state) => state.codexUsageModelBreakdown)
  const codexProjects = useAppStore((state) => state.codexUsageProjectBreakdown)
  const openCodeScanState = useAppStore((state) => state.openCodeUsageScanState)
  const openCodeRange = useAppStore((state) => state.openCodeUsageRange)
  const openCodeSnapshotReady = useAppStore((state) => state.openCodeUsageSnapshotReady)
  const openCodeDaily = useAppStore((state) => state.openCodeUsageDaily)
  const openCodeModels = useAppStore((state) => state.openCodeUsageModelBreakdown)
  const openCodeProjects = useAppStore((state) => state.openCodeUsageProjectBreakdown)
  const supplementalUsage = useAppStore((state) => state.statsSummary?.supplementalUsage)

  useEffect(() => {
    void prepareUsageSnapshots(range)
  }, [range])

  const supplemental = useMemo<UsageValueSupplementalInput | undefined>(
    () => (supplementalUsage ? mapSupplementalUsage(supplementalUsage, range) : undefined),
    [range, supplementalUsage]
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
    claudeRange === range &&
    claudeSnapshotReady &&
    codexRange === range &&
    codexSnapshotReady &&
    openCodeRange === range &&
    openCodeSnapshotReady
  const aggregationInput = useMemo(
    () => ({
      claudeProjects,
      claudeDaily,
      codexProjects,
      codexDaily,
      openCodeProjects,
      openCodeDaily
    }),
    [claudeDaily, claudeProjects, codexDaily, codexProjects, openCodeDaily, openCodeProjects]
  )
  const projects = useMemo(() => buildProjectUsage(aggregationInput), [aggregationInput])
  const dailyByProvider = useMemo(
    () => buildDailyProviderUsage(aggregationInput),
    [aggregationInput]
  )

  return useMemo(
    () => ({
      dailyByProvider: isReady ? dailyByProvider : [],
      dailyTokens: isReady
        ? usage.daily.map((point) => ({ day: point.day, value: point.tokens }))
        : [],
      dailyValues: isReady
        ? usage.daily.flatMap((point) =>
            point.valueUsd === null ? [] : [{ day: point.day, value: point.valueUsd }]
          )
        : [],
      hasUnpricedUsage: isReady && usage.hasUnpricedUsage,
      hasValue: isReady && usage.hasValue,
      isReady,
      isScanning:
        !isReady ||
        claudeScanState?.isScanning === true ||
        codexScanState?.isScanning === true ||
        openCodeScanState?.isScanning === true,
      models: isReady ? usage.models : [],
      projects: isReady ? projects : [],
      range,
      ...(usage.meteredValueUsd === undefined ? {} : { meteredValueUsd: usage.meteredValueUsd })
    }),
    [
      claudeScanState?.isScanning,
      codexScanState?.isScanning,
      dailyByProvider,
      isReady,
      openCodeScanState?.isScanning,
      projects,
      range,
      usage
    ]
  )
}

function mapSupplementalUsage(
  usage: RuntimeStatsSupplementalUsage,
  range: UsageRange
): UsageValueSupplementalInput {
  return {
    daily: usage.dailyTokens
      .filter((point) => dayIsInUsageRange(point.day, range))
      .map((point) => ({
        day: point.day,
        tokens: point.tokens,
        valueUsd: point.valueUsd,
        unpricedTokens: point.unpricedTokens
      })),
    // Why: supplemental model and metered totals have no date attribution, so
    // including them in a bounded range would mix all-time and ranged values.
    models: []
  }
}

async function prepareUsageSnapshots(range: UsageRange): Promise<void> {
  await Promise.all([
    prepareClaudeUsage(range),
    prepareCodexUsage(range),
    prepareOpenCodeUsage(range)
  ])
}

async function prepareClaudeUsage(range: UsageRange): Promise<void> {
  let state = useAppStore.getState()
  if (state.claudeUsageScope !== 'yiru') {
    await state.setClaudeUsageScope('yiru')
  }
  state = useAppStore.getState()
  if (state.claudeUsageScanState?.enabled === false) {
    await state.enableClaudeUsage()
  }
  state = useAppStore.getState()
  if (state.claudeUsageRange !== range) {
    await state.setClaudeUsageRange(range)
    return
  }
  await useAppStore.getState().fetchClaudeUsage()
}

async function prepareCodexUsage(range: UsageRange): Promise<void> {
  let state = useAppStore.getState()
  if (state.codexUsageScope !== 'yiru') {
    await state.setCodexUsageScope('yiru')
  }
  state = useAppStore.getState()
  if (state.codexUsageScanState?.enabled === false) {
    await state.enableCodexUsage()
  }
  state = useAppStore.getState()
  if (state.codexUsageRange !== range) {
    await state.setCodexUsageRange(range)
    return
  }
  await useAppStore.getState().fetchCodexUsage()
}

async function prepareOpenCodeUsage(range: UsageRange): Promise<void> {
  let state = useAppStore.getState()
  if (state.openCodeUsageScope !== 'yiru') {
    await state.setOpenCodeUsageScope('yiru')
  }
  state = useAppStore.getState()
  if (state.openCodeUsageScanState?.enabled === false) {
    await state.enableOpenCodeUsage()
  }
  state = useAppStore.getState()
  if (state.openCodeUsageRange !== range) {
    await state.setOpenCodeUsageRange(range)
    return
  }
  await useAppStore.getState().fetchOpenCodeUsage()
}
