import { STAR_NAG_INITIAL_THRESHOLD } from '@yiru/runtime-protocol/workbench/constants'
import {
  bucketStarNagAgentsSinceBaseline,
  type StarNagOutcome,
  type StarNagPromptMode,
  type StarNagPromptSource
} from '@yiru/runtime-protocol/workbench/star-nag-telemetry'
import type { EventProps } from '@yiru/runtime-protocol/workbench/telemetry-events'

import type { Store } from '../persistence/store'
import { getRuntimeHostPathsProvider } from '../runtime/host/paths-provider'
import type { StatsCollector } from '../stats/collector'
import { track } from '../telemetry/client'
import { getCohortAtEmit } from '../telemetry/cohort-classifier'

export type StarNagPromptSession = Omit<
  EventProps<'star_nag_outcome'>,
  'outcome' | 'next_threshold' | 'cooldown_days'
> & {
  openedRepoTracked?: boolean
  starAttemptPromise?: Promise<boolean>
}

type OutcomeOptions = {
  mode?: StarNagPromptMode
  nextThreshold?: number
  cooldownDays?: number
}

export function createStarNagPromptSession(
  store: Store,
  stats: StatsCollector,
  source: StarNagPromptSource,
  mode: StarNagPromptMode
): StarNagPromptSession {
  const ui = store.getUI()
  const threshold = ui.starNagNextThreshold ?? STAR_NAG_INITIAL_THRESHOLD
  const agentsSinceBaseline = Math.max(
    0,
    stats.getTotalAgentsSpawned() - (ui.starNagBaselineAgents ?? 0)
  )
  return {
    source,
    mode,
    threshold,
    agents_since_baseline: agentsSinceBaseline,
    agents_since_baseline_bucket: bucketStarNagAgentsSinceBaseline(agentsSinceBaseline),
    ...getCohortAtEmit()
  }
}

export function trackStarNagOutcome(
  session: StarNagPromptSession,
  outcome: StarNagOutcome,
  options: OutcomeOptions = {}
): void {
  const {
    openedRepoTracked: _openedRepoTracked,
    starAttemptPromise: _starAttemptPromise,
    ...context
  } = session
  track('star_nag_outcome', {
    ...context,
    outcome,
    ...(options.mode === undefined ? {} : { mode: options.mode }),
    ...(options.nextThreshold === undefined ? {} : { next_threshold: options.nextThreshold }),
    ...(options.cooldownDays === undefined ? {} : { cooldown_days: options.cooldownDays })
  })
}

export function trackAlreadyStarred(
  store: Store,
  stats: StatsCollector,
  source: StarNagPromptSource
): void {
  track('star_nag_outcome', {
    ...createStarNagPromptSession(store, stats, source, 'gh'),
    outcome: 'already_starred_suppressed'
  })
}

export function ensureStarNagBaseline(store: Store, stats: StatsCollector): void {
  const ui = store.getUI()
  const currentVersion = getRuntimeHostPathsProvider().version()
  if (ui.starNagAppVersion === currentVersion && ui.starNagBaselineAgents != null) {
    return
  }
  store.updateUI({
    starNagAppVersion: currentVersion,
    starNagBaselineAgents: stats.getTotalAgentsSpawned(),
    starNagNextThreshold: STAR_NAG_INITIAL_THRESHOLD
  })
}

export function hasReachedStarNagThreshold(
  store: Store,
  stats: StatsCollector,
  total: number
): boolean {
  const ui = store.getUI()
  if (ui.starNagAppVersion !== getRuntimeHostPathsProvider().version()) {
    ensureStarNagBaseline(store, stats)
    return false
  }
  const baseline = ui.starNagBaselineAgents ?? total
  const threshold = ui.starNagNextThreshold ?? STAR_NAG_INITIAL_THRESHOLD
  return total - baseline >= threshold
}

export function logStarNagEvent(
  store: Store,
  stats: StatsCollector,
  event: 'star_nag_shown' | 'star_nag_dismissed' | 'star_nag_later',
  source: StarNagPromptSource,
  nextThreshold?: number
): void {
  const ui = store.getUI()
  console.info({
    event,
    app_version: getRuntimeHostPathsProvider().version(),
    threshold: ui.starNagNextThreshold ?? STAR_NAG_INITIAL_THRESHOLD,
    agents_since_baseline: Math.max(
      0,
      stats.getTotalAgentsSpawned() - (ui.starNagBaselineAgents ?? 0)
    ),
    source,
    ...(nextThreshold === undefined ? {} : { next_threshold: nextThreshold })
  })
}
