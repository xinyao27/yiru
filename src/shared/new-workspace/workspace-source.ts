import {
  getLinkedWorkItemSuggestedName,
  getLinkedWorkItemWorkspaceName,
  type WorkspaceIntentWorkItem
} from '../workspace-name'
import { isWorkItemLookupText } from './work-item-lookup-text'

export type WorkspaceSourceProvider = 'github' | 'gitlab'

export type WorkspaceSourceLinkedItem = {
  provider: WorkspaceSourceProvider
  type: 'pr' | 'mr'
  number: number
  title: string
  url: string
  repoId?: string
}

export type GitHubWorkspaceSource = WorkspaceSourceLinkedItem & {
  provider: 'github'
  type: 'pr'
}

export type GitLabWorkspaceSource = WorkspaceSourceLinkedItem & {
  provider: 'gitlab'
  type: 'mr'
}

export type WorkspaceSourceItemLike = Omit<WorkspaceSourceLinkedItem, 'provider'> & {
  provider?: WorkspaceSourceProvider
}

export type WorkspaceSourceSelectionKind = 'github-pr' | 'gitlab-mr' | 'branch'

export type WorkspaceSourceSelection = {
  kind: WorkspaceSourceSelectionKind
  label: string
  url?: string
}

export function getWorkspaceSourceProvider(item: WorkspaceSourceItemLike): WorkspaceSourceProvider {
  return item.provider ?? (item.type === 'mr' ? 'gitlab' : 'github')
}

export function buildGitHubWorkspaceSource(item: {
  type: 'pr'
  number: number
  title: string
  url: string
  repoId?: string
}): GitHubWorkspaceSource {
  return { provider: 'github', ...item }
}

export function buildGitLabWorkspaceSource(item: {
  type: 'mr'
  number: number
  title: string
  url: string
  repoId?: string
}): GitLabWorkspaceSource {
  return { provider: 'gitlab', ...item }
}

export function shouldApplyWorkspaceSourceAutoName(args: {
  currentName: string
  lastAutoName: string
}): boolean {
  return (
    !args.currentName.trim() ||
    args.currentName === args.lastAutoName ||
    isWorkItemLookupText(args.currentName)
  )
}

function toWorkspaceIntentItem(item: WorkspaceSourceItemLike): WorkspaceIntentWorkItem {
  return { type: item.type, number: item.number, title: item.title }
}

export function getWorkspaceSourceName(item: WorkspaceSourceItemLike): {
  seedName: string
  displayName: string
} {
  const normalized = toWorkspaceIntentItem(item)
  const resolved = getLinkedWorkItemWorkspaceName(normalized)
  return {
    seedName: resolved?.seedName ?? getLinkedWorkItemSuggestedName(normalized),
    displayName: resolved?.displayName ?? item.title.trim()
  }
}

export function buildWorkspaceSourceSelection(args: {
  linkedWorkItem: WorkspaceSourceItemLike | null
  baseBranch?: string
}): WorkspaceSourceSelection | null {
  const { linkedWorkItem, baseBranch } = args
  if (!linkedWorkItem) {
    return baseBranch ? { kind: 'branch', label: baseBranch } : null
  }
  const provider = getWorkspaceSourceProvider(linkedWorkItem)
  return {
    kind: provider === 'gitlab' ? 'gitlab-mr' : 'github-pr',
    label: `#${linkedWorkItem.number} ${linkedWorkItem.title}`,
    url: linkedWorkItem.url
  }
}

export function shouldPreserveWorkspaceSourceOnRepoChange(): boolean {
  return false
}
