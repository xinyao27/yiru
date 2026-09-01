import {
  classifyWorktreeBaseChange,
  type WorktreeBaseWatchTarget
} from './base-directory-event-filter'

type WorktreeBaseWatcherEvent = {
  type: 'create' | 'update' | 'delete'
  path: string
}

export type WorktreeBaseCollectedChanges = {
  overflow: boolean
  structureRepoIds: string[]
  gitStatusRepoIds: string[]
  headIdentityRepoIds: string[]
}

type ChangeBuckets = {
  structureRepoIds: Set<string>
  gitStatusRepoIds: Set<string>
  headIdentityRepoIds: Set<string>
}

function emptyBuckets(): ChangeBuckets {
  return {
    structureRepoIds: new Set<string>(),
    gitStatusRepoIds: new Set<string>(),
    headIdentityRepoIds: new Set<string>()
  }
}

function addMatchingChange(
  target: WorktreeBaseWatchTarget,
  event: WorktreeBaseWatcherEvent,
  buckets: ChangeBuckets
): void {
  const change = classifyWorktreeBaseChange(target, event)
  for (const repoId of change.structureRepoIds) {
    buckets.structureRepoIds.add(repoId)
  }
  for (const repoId of change.gitStatusRepoIds) {
    buckets.gitStatusRepoIds.add(repoId)
  }
  for (const repoId of change.headIdentityRepoIds) {
    buckets.headIdentityRepoIds.add(repoId)
  }
}

function toCollectedChanges(buckets: ChangeBuckets): WorktreeBaseCollectedChanges {
  return {
    overflow: false,
    structureRepoIds: [...buckets.structureRepoIds],
    gitStatusRepoIds: [...buckets.gitStatusRepoIds],
    headIdentityRepoIds: [...buckets.headIdentityRepoIds]
  }
}

export function collectLocalWorktreeBaseChanges(
  target: WorktreeBaseWatchTarget,
  events: WorktreeBaseWatcherEvent[]
): WorktreeBaseCollectedChanges {
  const buckets = emptyBuckets()
  for (const event of events) {
    addMatchingChange(target, event, buckets)
  }
  return toCollectedChanges(buckets)
}
