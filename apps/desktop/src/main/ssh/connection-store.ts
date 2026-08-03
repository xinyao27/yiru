import type { SshRepoReadoption, SshTarget } from '@yiru/runtime-protocol/ssh-connection'

import type { Store } from '../persistence'
import {
  buildRemovedSshTargetTombstone,
  readoptOrphanedWorkspacesForTarget
} from './target-readoption'

export class SshConnectionStore {
  constructor(private store: Store) {}

  listTargets(): SshTarget[] {
    return this.store.getSshTargets().filter((target) => !isRuntimeOwnedSshTarget(target))
  }

  /** Map of removed-target id → its last known label, from the re-adoption
   *  tombstones. Lets the renderer show a friendly host name for a workspace
   *  still pinned to a target that no longer exists. */
  listRemovedTargetLabels(): Record<string, string> {
    const labels: Record<string, string> = {}
    for (const tombstone of this.store.getRemovedSshTargetTombstones()) {
      labels[tombstone.oldTargetId] = tombstone.label
    }
    return labels
  }

  getTarget(id: string): SshTarget | undefined {
    return this.store.getSshTarget(id)
  }

  addTarget(target: Omit<SshTarget, 'id'>): SshTarget {
    const full: SshTarget = {
      ...target,
      configHost: target.configHost ?? target.host,
      // Why: default to 'manual' so user-created targets are never overwritten
      // by a later ~/.ssh/config import (only 'ssh-config' targets are synced).
      source: target.source ?? 'manual',
      id: `ssh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    }
    // Why: re-adding a host the user previously deleted is an explicit intent to
    // keep it — lift any tombstone so config sync stops suppressing this alias.
    this.reclaimAlias(full.configHost ?? full.label)
    this.store.addSshTarget(full)
    // Why: re-adopt workspaces that were orphaned when the same host was removed
    // (repos/worktrees still point at the old, now-dead target id). Track the
    // exact migrations so IPC can refresh and renderer can prune only proven stale rows.
    this.lastRepoReadoptions = readoptOrphanedWorkspacesForTarget(this.store, full)
    return full
  }

  /** Exact migrations from the most recent add/import operation. */
  lastRepoReadoptions: SshRepoReadoption[] = []

  updateTarget(id: string, updates: Partial<Omit<SshTarget, 'id'>>): SshTarget | null {
    const updated = this.store.updateSshTarget(id, updates)
    if (updated) {
      // Why: actively editing a target reclaims its alias from the deleted set,
      // so an edit can never leave the host tombstoned.
      this.reclaimAlias(updated.configHost ?? updated.label)
    }
    return updated
  }

  removeTarget(id: string): void {
    const target = this.store.getSshTarget(id)
    // Why: deleting a config-managed target must record a tombstone; otherwise
    // the next ~/.ssh/config sync re-inserts it verbatim (the config entry still
    // exists on disk) and the host reappears. Manual targets need no tombstone —
    // sync never re-adds them.
    if (target && isConfigManagedTarget(target)) {
      const alias = target.configHost ?? target.label
      if (alias) {
        this.store.addDeletedSshConfigAlias(alias)
      }
    }
    // Why: record the removed target's host identity (for ALL user-facing
    // targets, config-managed or manual) so a later re-add of the same host can
    // re-adopt any workspaces orphaned on this id. Runtime-owned targets manage
    // their own lifecycle and are never re-adopted.
    if (target && !isRuntimeOwnedSshTarget(target)) {
      this.store.addRemovedSshTargetTombstone(buildRemovedSshTargetTombstone(target, Date.now()))
    }
    this.store.removeSshTarget(id)
  }

  private reclaimAlias(alias: string | undefined): void {
    if (alias) {
      this.store.removeDeletedSshConfigAlias(alias)
    }
  }
}

// Why: ephemeral VMs (removed in P3b) were the only writer of this owner tag, and
// startup sweeps their leftovers out of the store. This stays as the store-layer
// backstop for the one case the sweep cannot cover — an unreadable target list at
// launch — so a stale runtime-owned target never surfaces as a user SSH host.
export function isRuntimeOwnedSshTarget(target: SshTarget): boolean {
  return target.owner?.type === 'on-demand-runtime'
}

function isConfigManagedTarget(target: SshTarget): boolean {
  // Why: a target is subject to config sync (and therefore needs a tombstone on
  // delete) when it is explicitly config-sourced, or a legacy import that sync
  // still adopts. Manual targets are excluded — sync never re-adds them.
  return (
    target.source === 'ssh-config' ||
    (target.source === undefined && isLegacyConfigImportTarget(target))
  )
}

function isLegacyConfigImportTarget(target: SshTarget): boolean {
  const alias = target.configHost ?? target.label
  // Why: legacy manual and imported targets both lack `source`. Only adopt the
  // old import shape, where the SSH alias was kept as label/configHost while
  // host stored the resolved HostName; otherwise preserve the user's target.
  return Boolean(
    alias && target.label === alias && target.configHost === alias && target.host !== alias
  )
}
