import type { GitStatusEntry as PierreGitStatusEntry } from '@pierre/trees'
import { normalizeRelativePath } from '~renderer/lib/path'
import type { GitBranchChangeEntry, GitFileStatus, GitStatusEntry } from '~shared/types'

import type { SourceControlTreeDirectoryNode } from './directory-action-paths'
import {
  SUBMODULE_EMPTY_LABEL,
  SUBMODULE_ERROR_LABEL,
  SUBMODULE_LOADING_LABEL
} from './panel-constants'
import {
  buildSubmoduleChildEntry,
  getSubmoduleExpansionKey,
  isExpandableSubmoduleEntry,
  type SubmoduleStatusState
} from './submodule-expansion'
import type { SourceControlTreeNode } from './tree'

export type SourceControlPierreDirectoryTarget = {
  kind: 'directory'
  relativePath: string
  collapseKey: string
  node?: SourceControlTreeDirectoryNode
}

export type SourceControlPierreUncommittedTarget = {
  kind: 'uncommitted'
  entry: GitStatusEntry
  isSubmodule: boolean
}

export type SourceControlPierreBranchTarget = {
  kind: 'branch'
  entry: GitBranchChangeEntry
}

export type SourceControlPierrePlaceholderTarget = {
  kind: 'placeholder'
  message: string
}

export type SourceControlPierreTarget =
  | SourceControlPierreDirectoryTarget
  | SourceControlPierreUncommittedTarget
  | SourceControlPierreBranchTarget
  | SourceControlPierrePlaceholderTarget

export type SourceControlPierreTreeData = {
  canonicalPathByRowKey: Map<string, string>
  expandedPaths: string[]
  gitStatus: PierreGitStatusEntry[]
  paths: string[]
  targetByCanonicalPath: Map<string, SourceControlPierreTarget>
}

function toCanonicalFilePath(path: string): string {
  return normalizeRelativePath(path)
}

function toCanonicalDirectoryPath(path: string): string {
  const normalizedPath = normalizeRelativePath(path)
  return normalizedPath ? `${normalizedPath}/` : ''
}

function mapGitStatus(status: GitFileStatus): PierreGitStatusEntry['status'] | null {
  return status === 'copied' ? null : status
}

function addGitStatus(
  gitStatus: PierreGitStatusEntry[],
  canonicalPath: string,
  status: GitFileStatus
): void {
  const mappedStatus = mapGitStatus(status)
  if (mappedStatus) {
    gitStatus.push({ path: canonicalPath, status: mappedStatus })
  }
}

function createTreeData(): SourceControlPierreTreeData {
  return {
    canonicalPathByRowKey: new Map(),
    expandedPaths: [],
    gitStatus: [],
    paths: [],
    targetByCanonicalPath: new Map()
  }
}

function finalizeTreeData(data: SourceControlPierreTreeData): SourceControlPierreTreeData {
  const expandedPaths = new Set(data.expandedPaths)
  for (const [canonicalPath, target] of data.targetByCanonicalPath) {
    if (target.kind !== 'directory' && !(target.kind === 'uncommitted' && target.isSubmodule)) {
      continue
    }
    let separatorIndex = 0
    while ((separatorIndex = canonicalPath.indexOf('/', separatorIndex)) >= 0) {
      const ancestorPath = canonicalPath.slice(0, separatorIndex + 1)
      separatorIndex += 1
      if (ancestorPath !== canonicalPath && !data.targetByCanonicalPath.has(ancestorPath)) {
        expandedPaths.add(ancestorPath)
      }
    }
  }
  data.paths = [...new Set(data.paths)]
  data.expandedPaths = [...expandedPaths]
  return data
}

function addPlaceholder(
  data: SourceControlPierreTreeData,
  parentPath: string,
  label: string,
  message: string
): void {
  const canonicalPath = `${parentPath}${label}`
  data.paths.push(canonicalPath)
  data.targetByCanonicalPath.set(canonicalPath, { kind: 'placeholder', message })
}

function addImplicitDirectoryTargets(
  data: SourceControlPierreTreeData,
  entry: GitStatusEntry,
  rootPath: string,
  collapsedDirectoryKeys: ReadonlySet<string>
): void {
  const normalizedPath = toCanonicalFilePath(entry.path)
  let separatorIndex = rootPath.length
  while ((separatorIndex = normalizedPath.indexOf('/', separatorIndex + 1)) >= 0) {
    const relativePath = normalizedPath.slice(0, separatorIndex)
    const canonicalPath = `${relativePath}/`
    if (data.targetByCanonicalPath.has(canonicalPath)) {
      continue
    }
    const collapseKey = `dir::${entry.area}::${relativePath}`
    data.targetByCanonicalPath.set(canonicalPath, {
      kind: 'directory',
      relativePath,
      collapseKey
    })
    if (!collapsedDirectoryKeys.has(collapseKey)) {
      data.expandedPaths.push(canonicalPath)
    }
  }
}

function addUncommittedEntry(
  data: SourceControlPierreTreeData,
  entry: GitStatusEntry,
  collapsedDirectoryKeys: ReadonlySet<string>,
  expandedSubmoduleKeys: ReadonlySet<string>,
  submoduleStatusByKey: Readonly<Record<string, SubmoduleStatusState>>
): void {
  const isSubmodule = isExpandableSubmoduleEntry(entry)
  const canonicalPath = isSubmodule
    ? toCanonicalDirectoryPath(entry.path)
    : toCanonicalFilePath(entry.path)
  data.paths.push(canonicalPath)
  data.targetByCanonicalPath.set(canonicalPath, { kind: 'uncommitted', entry, isSubmodule })
  data.canonicalPathByRowKey.set(`${entry.area}::${entry.path}`, canonicalPath)
  addGitStatus(data.gitStatus, canonicalPath, entry.status)

  if (!isSubmodule) {
    return
  }

  const expansionKey = getSubmoduleExpansionKey(entry)
  if (expandedSubmoduleKeys.has(expansionKey)) {
    data.expandedPaths.push(canonicalPath)
  }
  const state = submoduleStatusByKey[expansionKey]
  if (!state || state.status === 'loading') {
    addPlaceholder(data, canonicalPath, SUBMODULE_LOADING_LABEL, SUBMODULE_LOADING_LABEL)
    return
  }
  if (state.status === 'error') {
    addPlaceholder(data, canonicalPath, SUBMODULE_ERROR_LABEL, state.error)
    return
  }
  if (state.entries.length === 0) {
    addPlaceholder(data, canonicalPath, SUBMODULE_EMPTY_LABEL, SUBMODULE_EMPTY_LABEL)
    return
  }

  const rootPath = normalizeRelativePath(entry.path)
  for (const innerEntry of state.entries) {
    const childEntry = buildSubmoduleChildEntry(entry.path, innerEntry, entry.area)
    addImplicitDirectoryTargets(data, childEntry, rootPath, collapsedDirectoryKeys)
    addUncommittedEntry(
      data,
      childEntry,
      collapsedDirectoryKeys,
      expandedSubmoduleKeys,
      submoduleStatusByKey
    )
  }
}

function addUncommittedNode(
  data: SourceControlPierreTreeData,
  node: SourceControlTreeNode<GitStatusEntry>,
  collapsedDirectoryKeys: ReadonlySet<string>,
  expandedSubmoduleKeys: ReadonlySet<string>,
  submoduleStatusByKey: Readonly<Record<string, SubmoduleStatusState>>
): void {
  if (node.type === 'file') {
    addUncommittedEntry(
      data,
      node.entry,
      collapsedDirectoryKeys,
      expandedSubmoduleKeys,
      submoduleStatusByKey
    )
    return
  }

  const canonicalPath = toCanonicalDirectoryPath(node.path)
  data.paths.push(canonicalPath)
  data.targetByCanonicalPath.set(canonicalPath, {
    kind: 'directory',
    relativePath: node.path,
    collapseKey: node.key,
    node
  })
  if (!collapsedDirectoryKeys.has(node.key)) {
    data.expandedPaths.push(canonicalPath)
  }
  for (const child of node.children) {
    addUncommittedNode(
      data,
      child,
      collapsedDirectoryKeys,
      expandedSubmoduleKeys,
      submoduleStatusByKey
    )
  }
}

export function buildUncommittedPierreTreeData(args: {
  roots: SourceControlTreeNode<GitStatusEntry>[]
  collapsedDirectoryKeys: ReadonlySet<string>
  expandedSubmoduleKeys: ReadonlySet<string>
  submoduleStatusByKey: Readonly<Record<string, SubmoduleStatusState>>
}): SourceControlPierreTreeData {
  const data = createTreeData()
  for (const root of args.roots) {
    addUncommittedNode(
      data,
      root,
      args.collapsedDirectoryKeys,
      args.expandedSubmoduleKeys,
      args.submoduleStatusByKey
    )
  }
  return finalizeTreeData(data)
}

function addBranchNode(
  data: SourceControlPierreTreeData,
  node: SourceControlTreeNode<GitBranchChangeEntry, 'branch'>,
  collapsedDirectoryKeys: ReadonlySet<string>
): void {
  if (node.type === 'file') {
    const canonicalPath = toCanonicalFilePath(node.entry.path)
    data.paths.push(canonicalPath)
    data.targetByCanonicalPath.set(canonicalPath, { kind: 'branch', entry: node.entry })
    addGitStatus(data.gitStatus, canonicalPath, node.entry.status)
    return
  }

  const canonicalPath = toCanonicalDirectoryPath(node.path)
  data.paths.push(canonicalPath)
  data.targetByCanonicalPath.set(canonicalPath, {
    kind: 'directory',
    relativePath: node.path,
    collapseKey: node.key
  })
  if (!collapsedDirectoryKeys.has(node.key)) {
    data.expandedPaths.push(canonicalPath)
  }
  for (const child of node.children) {
    addBranchNode(data, child, collapsedDirectoryKeys)
  }
}

export function buildBranchPierreTreeData(
  roots: SourceControlTreeNode<GitBranchChangeEntry, 'branch'>[],
  collapsedDirectoryKeys: ReadonlySet<string>
): SourceControlPierreTreeData {
  const data = createTreeData()
  for (const root of roots) {
    addBranchNode(data, root, collapsedDirectoryKeys)
  }
  return finalizeTreeData(data)
}
