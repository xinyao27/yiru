import {
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostId,
  type ExecutionHostId
} from '@yiru/workbench-model/workspace'
import { getDefaultOnboardingState, getDefaultWorkspaceSession } from '~shared/constants'
import {
  compareFeatureInteractionUsageBuckets,
  getFeatureInteractionCategory,
  getFeatureInteractionUsageBucket,
  normalizeFeatureInteractions,
  normalizeFeatureInteractionTelemetryBuckets,
  type FeatureInteractionId
} from '~shared/feature-interactions'
import type { PersistedState, OnboardingChecklistState, WorkspaceSessionState } from '~shared/types'
import { pruneWorkspaceSessionBrowserHistory } from '~shared/workspace/session-browser-history'
import { pruneLocalTerminalScrollbackBuffers } from '~shared/workspace/session-terminal-buffers'

import { applyPersistedUiUpdate, readPersistedUi } from './persisted-state/persisted-ui-mutations'
import { findWorktreeIdForTab } from './persistence-layout-tree'
import { StoreLayer8 } from './persistence-store-layer-8'
import { track } from './telemetry/client'
import { getCohortAtEmit } from './telemetry/cohort-classifier'
import { readTerminalScrollbackSnapshotSync } from './terminal-scrollback-snapshots'

export abstract class StoreLayer9 extends StoreLayer8 {
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
    this.scheduleSave()
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
    this.scheduleSave()

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
    this.scheduleSave()
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

  // ── Workspace Session ─────────────────────────────────────────────

  /** Resolve an execution host argument to a canonical id. Unknown/empty
   *  values fall back to 'local' so legacy callers without a hostId keep
   *  reading and writing the local partition exactly as before. */
  protected resolveHostId(hostId?: string | null): ExecutionHostId {
    return normalizeExecutionHostId(hostId) ?? LOCAL_EXECUTION_HOST_ID
  }

  getWorkspaceSession(hostId?: string | null): PersistedState['workspaceSession'] {
    const resolved = this.resolveHostId(hostId)
    if (resolved === LOCAL_EXECUTION_HOST_ID) {
      return this.state.workspaceSession ?? getDefaultWorkspaceSession()
    }
    return this.state.workspaceSessionsByHostId?.[resolved] ?? getDefaultWorkspaceSession()
  }

  readTerminalScrollbackSnapshot(ref: string): string | null {
    return readTerminalScrollbackSnapshotSync(ref, this.terminalScrollbackSnapshotStorage)
  }

  /** Resolve the worktree a terminal tab belongs to, from the session's
   *  tab→worktree map. More reliable than agent-echoed hook fields. */
  getWorktreeIdForTab(tabId: string): string | undefined {
    return findWorktreeIdForTab(this.getWorkspaceSession(), tabId)
  }

  setWorkspaceSession(session: PersistedState['workspaceSession'], hostId?: string | null): void {
    const resolved = this.resolveHostId(hostId)
    if (resolved === LOCAL_EXECUTION_HOST_ID) {
      this.setLocalWorkspaceSession(session)
      return
    }
    this.setHostWorkspaceSession(resolved, session)
  }

  /** Persist a non-'local' host partition. The PTY-binding race protections in
   *  setLocalWorkspaceSession only apply to the local daemon, so remote hosts
   *  take the lighter prune-and-store path. */
  protected setHostWorkspaceSession(hostId: ExecutionHostId, session: WorkspaceSessionState): void {
    const pruned = pruneWorkspaceSessionBrowserHistory(
      pruneLocalTerminalScrollbackBuffers(session, this.state.repos)
    )
    this.state.workspaceSessionsByHostId = {
      ...this.state.workspaceSessionsByHostId,
      [hostId]: pruned
    }
    this.scheduleSave()
  }
}
