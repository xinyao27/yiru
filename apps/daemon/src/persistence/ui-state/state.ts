import { getDefaultOnboardingState } from '@yiru/runtime-protocol/workbench/constants'
import {
  compareFeatureInteractionUsageBuckets,
  getFeatureInteractionCategory,
  getFeatureInteractionUsageBucket,
  normalizeFeatureInteractions,
  normalizeFeatureInteractionTelemetryBuckets,
  type FeatureInteractionId
} from '@yiru/runtime-protocol/workbench/feature-interactions'
import type {
  PersistedState,
  OnboardingChecklistState
} from '@yiru/runtime-protocol/workbench/types'
import type { GitHubCacheFile } from '~main/persisted-state/github-cache-file'
import type { PersistedStateNotifications } from '~main/persisted-state/notifications'
import {
  applyPersistedUiUpdate,
  readPersistedUi
} from '~main/persisted-state/persisted-ui-mutations'
import { track } from '~main/telemetry/client'
import { getCohortAtEmit } from '~main/telemetry/cohort-classifier'

import { PersistenceSlice, type PersistenceRuntime, type StoreMethodLookup } from '../slice'

export class UiStateSlice extends PersistenceSlice {
  private readonly githubCacheFile: GitHubCacheFile
  private readonly notifications: PersistedStateNotifications

  constructor(
    runtime: PersistenceRuntime,
    lookupStoreMethod: StoreMethodLookup,
    githubCacheFile: GitHubCacheFile,
    notifications: PersistedStateNotifications
  ) {
    super(runtime, lookupStoreMethod)
    this.githubCacheFile = githubCacheFile
    this.notifications = notifications
  }
  // ── UI State ───────────────────────────────────────────────────────

  getUI(): PersistedState['ui'] {
    return readPersistedUi(this.state.ui)
  }

  updateUI(updates: Partial<PersistedState['ui']>): void {
    const mutation = applyPersistedUiUpdate(this.state.ui, updates)
    if (!mutation.changed) {
      return
    }
    this.state.ui = mutation.ui
    this.scheduleSave('ui')
    this.notifications.publishUiMutation(() => this.getUI())
  }

  recordFeatureInteraction(id: FeatureInteractionId): PersistedState['ui'] {
    const featureInteractions = normalizeFeatureInteractions(this.state.ui?.featureInteractions)
    const telemetryBuckets = normalizeFeatureInteractionTelemetryBuckets(
      this.state.featureInteractionTelemetryBuckets
    )
    const existing = featureInteractions[id]
    const previousCount = existing?.interactionCount ?? 0
    const nextCount = previousCount + 1
    const previousBucket = getFeatureInteractionUsageBucket(previousCount)
    const nextBucket = getFeatureInteractionUsageBucket(nextCount)
    const lastEmittedBucket = telemetryBuckets[id] ?? null
    const shouldEmit =
      nextBucket !== null &&
      (lastEmittedBucket === null ||
        compareFeatureInteractionUsageBuckets(nextBucket, lastEmittedBucket) > 0)

    this.updateUI({
      featureInteractions: {
        ...featureInteractions,
        [id]: {
          firstInteractedAt: existing?.firstInteractedAt ?? Date.now(),
          interactionCount: nextCount
        }
      }
    })
    this.state.featureInteractionTelemetryBuckets = shouldEmit
      ? { ...telemetryBuckets, [id]: nextBucket }
      : telemetryBuckets
    this.scheduleSave('ui')

    if (shouldEmit) {
      track('feature_interaction_usage_bucket_reached', {
        feature_id: id,
        feature_category: getFeatureInteractionCategory(id),
        count_bucket: nextBucket,
        bucket_source:
          lastEmittedBucket === null && previousBucket !== null && previousBucket === nextBucket
            ? 'observed_existing'
            : 'crossed_now',
        ...getCohortAtEmit()
      })
    }
    return this.getUI()
  }

  // ── Onboarding ────────────────────────────────────────────────────

  getOnboarding(): PersistedState['onboarding'] {
    const defaults = getDefaultOnboardingState()
    return {
      ...defaults,
      ...this.state.onboarding,
      checklist: {
        ...defaults.checklist,
        ...this.state.onboarding?.checklist
      }
    }
  }

  updateOnboarding(
    updates: Partial<Omit<PersistedState['onboarding'], 'checklist'>> & {
      checklist?: Partial<OnboardingChecklistState>
    }
  ): PersistedState['onboarding'] {
    const current = this.getOnboarding()
    this.state.onboarding = {
      ...current,
      ...updates,
      checklist: {
        ...current.checklist,
        ...updates.checklist
      }
    }
    this.scheduleSave('ui')
    return this.getOnboarding()
  }

  // ── GitHub Cache ──────────────────────────────────────────────────

  getGitHubCache(): PersistedState['githubCache'] {
    return this.state.githubCache
  }

  setGitHubCache(cache: PersistedState['githubCache']): void {
    // Why no scheduleSave: the cache is memory-only during the session and
    // snapshotted to its sidecar file at flush (quit/reload) time. Every poll
    // refresh restamps fetchedAt, so persisting here rewrote the whole
    // durable state file once per poll cycle for refetchable data.
    this.state.githubCache = cache
    this.githubCacheFile.markDirty()
  }
}
