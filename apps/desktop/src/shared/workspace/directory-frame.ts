import type { WorkspaceSpaceItemKind } from './space-types'

type ScannableWorkspaceSpaceItemKind = Exclude<WorkspaceSpaceItemKind, 'other'>

export type WorkspaceSpaceEntryScan = {
  name: string
  path: string
  kind: ScannableWorkspaceSpaceItemKind
  sizeBytes: number
  skippedEntryCount: number
  children?: WorkspaceSpaceEntryScan[]
}

export type WorkspaceSpaceEntryIdentity = {
  kind: ScannableWorkspaceSpaceItemKind
  sizeBytes: number
}

export type ParentSlot<TEntry> = {
  frame: DirectoryFrame<TEntry>
  index: number
}

export type DirectoryFrame<TEntry> = {
  result: WorkspaceSpaceEntryScan
  entries: readonly TEntry[]
  retainedBytes: number
  retired: boolean
  nextIndex: number
  remainingChildren: number
  childResults?: (WorkspaceSpaceEntryScan | null | undefined)[]
  parentSlot?: ParentSlot<TEntry>
}

export type EntryJob<TEntry> = {
  frame: DirectoryFrame<TEntry>
  index: number
  entry: TEntry
  name: string
  path: string
}

export function createEntryScan(
  path: string,
  name: string,
  identity: WorkspaceSpaceEntryIdentity
): WorkspaceSpaceEntryScan {
  return {
    name,
    path,
    kind: identity.kind,
    sizeBytes: identity.sizeBytes,
    skippedEntryCount: 0
  }
}
